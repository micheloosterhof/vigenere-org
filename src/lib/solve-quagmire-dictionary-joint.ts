// ABOUTME: Quagmire keyword dictionary attack for short texts: solves each keyword's column shifts together, not one by one.
// ABOUTME: A chain score filters the word list, the exact ring solution re-ranks the survivors, and annealing on quadgrams decides.
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

// A short annealing run ranks every ring survivor; the best of all periods
// then get several longer runs.
const QUICK_ITERATIONS = 3000;
const FINAL_KEEP = 60;
const FINAL_RUNS = 4;
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
function best(candidates: Candidate[], keep: number): Candidate[] {
  return candidates.sort((a, b) => b.score - a.score).slice(0, keep);
}

/**
 * Breaks a short Quagmire I, II, or III whose alphabet keyword is a
 * dictionary word. With only a few letters per column the letter frequencies
 * of one column cannot fix its shift, but neighbouring letters sit in
 * neighbouring columns, so the bigrams tie the shifts together. For every
 * keyword, variant, and period the best shifts under bigram score are found by
 * dynamic programming (the open chain to shortlist, the closed ring to
 * re-rank); the survivors' shifts are then annealed on quadgram score, which
 * decides the winner. Check `found`.
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

  // Stage 2: the exact ring score re-ranks each period's shortlist.
  const survivors: Candidate[] = [];
  for (const period of periods) {
    const ring = best(byPeriod[period], CHAIN_KEEP).map((candidate) => {
      const plan = planFor(candidate.word, candidate.variant);
      const shifted = shiftTable(cipher, plan.input, plan.output);
      return { ...candidate, score: ringShifts(shifted, length, period).score };
    });
    survivors.push(...best(ring, RING_KEEP));
  }

  // Stages 3 and 4: anneal the shifts on quadgram score.
  const plain = new Array<number>(length);
  const annealShifts = (
    candidate: Candidate,
    iterations: number,
  ): { raw: number; offsets: number[] } => {
    const plan = planFor(candidate.word, candidate.variant);
    const shifted = shiftTable(cipher, plan.input, plan.output);
    const { period } = candidate;
    const result = anneal<number[]>(
      {
        random: (random) =>
          Array.from({ length: period }, () =>
            Math.floor(random() * ALPHABET_SIZE),
          ),
        neighbour: (shifts, random) => {
          const changed = [...shifts];
          changed[Math.floor(random() * period)] = Math.floor(
            random() * ALPHABET_SIZE,
          );
          return changed;
        },
        score: (shifts) => {
          for (let i = 0; i < length; i += 1) {
            plain[i] = shifted[i * ALPHABET_SIZE + shifts[i % period]];
          }
          return quadgramRaw(plain, length, table);
        },
      },
      { rng, iterations, temperature: TEMPERATURE },
    );
    return { raw: result.score, offsets: result.key };
  };

  const quick = best(
    survivors.map((candidate) => ({
      ...candidate,
      score: annealShifts(candidate, QUICK_ITERATIONS).raw,
    })),
    FINAL_KEEP,
  );
  const finalists: Finalist[] = quick.map((candidate) => {
    let top = { raw: -Infinity, offsets: [] as number[] };
    for (let run = 0; run < FINAL_RUNS; run += 1) {
      const result = annealShifts(candidate, FINAL_ITERATIONS);
      if (result.raw > top.raw) {
        top = result;
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
 * solves 18 of 18 texts of 60 letters or more at 8 letters per column, 35 of
 * 36 at 12, and 8 of 9 at 6; below 60 letters it cannot tell a right
 * decryption from a wrong one.
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
  maxLetters: MAX_PER_COLUMN * MAX_PERIOD,
  minLettersPerColumn: 8,
  maxPeriod: MAX_PERIOD,
  basis: "measured",
};
