// ABOUTME: Quagmire keyword dictionary attack for short texts: solves each keyword's column shifts together, not one by one.
// ABOUTME: A chain score filters the word list, the exact ring solution re-ranks the survivors, and a climb plus annealing on quadgrams decides.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { anneal, averageLog10, quadgramRaw } from "./anneal";
import { inverseAlphabet, mixedAlphabet } from "./cipher";
import { chainScore, ringShifts, shiftTable } from "./quagmire-shifts";
import { toLetterValues } from "./solve";
import type { SolverRequirements } from "./solver-requirements";
import {
  bestFinalist,
  keywordResult,
  MIN_LENGTH,
  variantPlans,
  type DictionaryVariant,
  type Finalist,
  type QuagmireDictionaryResult,
  type VariantPlan,
} from "./solve-quagmire-dictionary";

const ALPHABET_SIZE = 26;
const MAX_PERIOD = 12;
const PROGRESS_EVERY = 500;

// Candidates kept per period after the chain score, and after the ring score.
const CHAIN_KEEP = 1000;
const RING_KEEP = 100;

// The survivors of all periods that are annealed, after a climb from their
// ring shifts has ranked them, and the annealing runs each gets.
const FINAL_KEEP = 60;
const FINAL_RUNS = 8;
const FINAL_ITERATIONS = 10000;
// Starting temperature in raw quadgram units.
const TEMPERATURE = 100;

// Average quadgram log10 probability from which a decryption counts as found.
// In bench/results/quagmire-dictionary-joint.tsv, from 60 letters up, wrong
// decryptions stay below -4.58 and all but one right one score above -4.5.
const READABLE_QUADGRAM = -4.5;

// Below this many letters wrong keywords anneal to pseudo-English as good as
// the true decryption (wrong ones reach -4.1 at 48 letters), so shorter text
// is never reported as found.
const MIN_RELIABLE_LENGTH = 60;

// A period is tried only when it leaves fewer letters per column than this.
// With more, the per-column dictionary attack already finds the keyword, and
// the scan here costs time in proportion to the text.
const MAX_PER_COLUMN = 32;

interface Options {
  /** Try only this key length instead of every length up to the maximum. */
  period?: number;
  maxPeriod?: number;
  rng?: () => number;
  onProgress?: (done: number, total: number) => void;
}

interface Candidate {
  word: string;
  variant: DictionaryVariant;
  period: number;
  score: number;
}

/** A candidate with a shift for each column. */
interface Shifted extends Candidate {
  shifts: number[];
}

/** The decryption plan for a keyword and variant. */
function planFor(word: string, variant: DictionaryVariant): VariantPlan {
  const alphabet = mixedAlphabet(word);
  return variantPlans(alphabet, inverseAlphabet(alphabet))[variant - 1];
}

/**
 * One word per alphabet: words with the same letters in the same first-seen
 * order build the same alphabet, and the shortest is the keyword as written.
 */
function distinctAlphabets(words: string[]): string[] {
  const shortest = new Map<string, string>();
  for (const word of words) {
    const letters = [...new Set(word.toUpperCase())].join("");
    const known = shortest.get(letters);
    if (known === undefined || word.length < known.length) {
      shortest.set(letters, word);
    }
  }
  return [...shortest.values()];
}

/** The `keep` best-scoring candidates, best first. */
function best<T extends Candidate>(candidates: T[], keep: number): T[] {
  return candidates.sort((a, b) => b.score - a.score).slice(0, keep);
}

/**
 * Breaks a short Quagmire I, II, or III whose alphabet keyword is a
 * dictionary word. With only a few letters per column the letter frequencies
 * of one column cannot fix its shift, but neighbouring letters sit in
 * neighbouring columns, so the bigrams tie the shifts together. For every
 * keyword, variant, and period the best shifts under bigram score are found by
 * dynamic programming (the open chain to shortlist, the closed ring to
 * re-rank); the survivors' shifts are then improved on quadgram score, by a
 * climb and then annealing, which decides the winner. Check `found`.
 */
export function breakQuagmireDictionaryJoint(
  text: string,
  words: string[],
  table: Uint8Array,
  options: Options = {},
): QuagmireDictionaryResult {
  const cipher = toLetterValues(text);
  const length = cipher.length;
  if (length < MIN_LENGTH) {
    throw new Error(`text must contain at least ${MIN_LENGTH} letters`);
  }
  const rng = options.rng ?? Math.random;
  const longest = Math.max(
    1,
    Math.min(options.maxPeriod ?? MAX_PERIOD, Math.floor(length / 3)),
  );
  const periods: number[] = [];
  if (options.period !== undefined) {
    periods.push(Math.min(options.period, longest));
  } else {
    for (let period = 1; period <= longest; period += 1) {
      if (length / period < MAX_PER_COLUMN) {
        periods.push(period);
      }
    }
  }
  if (periods.length === 0) {
    throw new Error(
      `text is too long: every key length up to ${longest} leaves ${MAX_PER_COLUMN} or more letters per column`,
    );
  }

  // Stage 1: chain score of every alphabet, variant, and period.
  const byPeriod: Candidate[][] = [];
  for (const period of periods) {
    byPeriod[period] = [];
  }
  const alphabets = new Set(distinctAlphabets(words));
  words.forEach((word, wordCount) => {
    if (alphabets.has(word)) {
      const alphabet = mixedAlphabet(word);
      for (const plan of variantPlans(alphabet, inverseAlphabet(alphabet))) {
        const shifted = shiftTable(cipher, plan.input, plan.output);
        for (const period of periods) {
          byPeriod[period].push({
            word,
            variant: plan.variant,
            period,
            score: chainScore(shifted, length, period),
          });
        }
      }
    }
    if (
      (wordCount + 1) % PROGRESS_EVERY === 0 ||
      wordCount + 1 === words.length
    ) {
      options.onProgress?.(wordCount + 1, words.length);
    }
  });

  // Stage 2: the exact ring solution re-ranks each period's shortlist and
  // gives every survivor its shifts to start from.
  const survivors: Shifted[] = [];
  for (const period of periods) {
    const ring = best(byPeriod[period], CHAIN_KEEP).map((candidate) => {
      const plan = planFor(candidate.word, candidate.variant);
      const shifted = shiftTable(cipher, plan.input, plan.output);
      const { score, shifts } = ringShifts(shifted, length, period);
      return { ...candidate, score, shifts };
    });
    survivors.push(...best(ring, RING_KEEP));
  }

  // Stages 3 and 4 improve the shifts on quadgram score.
  const plain = new Array<number>(length);
  const quadgrams = (shifted: Uint8Array, shifts: number[]): number => {
    const period = shifts.length;
    for (let i = 0; i < length; i += 1) {
      plain[i] = shifted[i * ALPHABET_SIZE + shifts[i % period]];
    }
    return quadgramRaw(plain, length, table);
  };
  const tableOf = (candidate: Candidate): Uint8Array => {
    const plan = planFor(candidate.word, candidate.variant);
    return shiftTable(cipher, plan.input, plan.output);
  };

  // Stage 3: from the ring shifts, move one column at a time to its best
  // shift until none improves. This ranks the survivors of all periods the
  // same way on every run; annealing from random shifts here ranked the true
  // keyword of Kryptos K1 anywhere from first to 290th.
  const climbed = best(
    survivors.map((candidate) => {
      const shifted = tableOf(candidate);
      const shifts = [...candidate.shifts];
      let score = quadgrams(shifted, shifts);
      let improved = true;
      while (improved) {
        improved = false;
        for (let column = 0; column < shifts.length; column += 1) {
          let bestShift = shifts[column];
          for (let shift = 0; shift < ALPHABET_SIZE; shift += 1) {
            shifts[column] = shift;
            const changed = quadgrams(shifted, shifts);
            if (changed > score) {
              score = changed;
              bestShift = shift;
              improved = true;
            }
          }
          shifts[column] = bestShift;
        }
      }
      return { ...candidate, score, shifts };
    }),
    FINAL_KEEP,
  );

  // Stage 4: anneal the best from their climbed shifts, which gets past
  // optima that need several columns to change together.
  const finalists: Finalist[] = climbed.map((candidate) => {
    const shifted = tableOf(candidate);
    const { period } = candidate;
    let top = { raw: candidate.score, offsets: candidate.shifts };
    for (let run = 0; run < FINAL_RUNS; run += 1) {
      const result = anneal<number[]>(
        {
          random: () => [...candidate.shifts],
          neighbour: (shifts, random) => {
            const changed = [...shifts];
            changed[Math.floor(random() * period)] = Math.floor(
              random() * ALPHABET_SIZE,
            );
            return changed;
          },
          score: (shifts) => quadgrams(shifted, shifts),
        },
        { rng, iterations: FINAL_ITERATIONS, temperature: TEMPERATURE },
      );
      if (result.score > top.raw) {
        top = { raw: result.score, offsets: result.key };
      }
    }
    return {
      word: candidate.word,
      variant: candidate.variant,
      period: candidate.period,
      offsets: top.offsets,
      fitness: averageLog10(top.raw, length - 3),
    };
  });

  const winner = bestFinalist(finalists);
  return keywordResult(
    text,
    winner,
    length >= MIN_RELIABLE_LENGTH && winner.fitness >= READABLE_QUADGRAM,
  );
}

/**
 * What the joint-shift dictionary attack needs. In
 * bench/results/quagmire-dictionary-joint.tsv, with the period unknown, it
 * solves every text of 60 letters or more from 6 letters per column up (90 of
 * 90; at 6 per column that is period 12 only, 9 texts). Below 60 letters it
 * cannot tell a right decryption from a wrong one.
 */
export const QUAGMIRE_DICTIONARY_JOINT_REQUIREMENTS: SolverRequirements = {
  id: "quagmire-dictionary-joint",
  ciphers: ["Quagmire I", "Quagmire II", "Quagmire III"],
  assumes: [
    "periodic",
    "shared-alphabet",
    "keyword-alphabet",
    "keyword-in-word-list",
  ],
  minLetters: MIN_RELIABLE_LENGTH,
  maxLetters: MAX_PER_COLUMN * MAX_PERIOD - 1,
  reliableLettersPerColumn: 8,
  maxPeriod: MAX_PERIOD,
  basis: "measured",
};
