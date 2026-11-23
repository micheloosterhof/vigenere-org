// ABOUTME: Quagmire keyword dictionary attack for short texts: solves each keyword's column shifts together, not one by one.
// ABOUTME: A chain score filters the word list, the exact ring solution re-ranks the survivors, and a climb plus annealing on quadgrams decides.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { anneal, averageLog10, quadgramRaw, seededRng } from "./anneal";
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

/** A keyword, variant and period with its score: what the word scan hands on. */
export interface JointCandidate {
  word: string;
  variant: DictionaryVariant;
  period: number;
  score: number;
}

/** A candidate with a shift for each column. */
export interface JointShifted extends JointCandidate {
  shifts: number[];
}

/**
 * A candidate that goes on to the annealing, with the shifts its climb ended
 * on. It carries the seed of its own annealing runs, so they come out the
 * same on any thread and in any order.
 */
export interface JointFinalist extends JointShifted {
  seed: number;
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
export function distinctAlphabets(words: string[]): string[] {
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
function best<T extends JointCandidate>(candidates: T[], keep: number): T[] {
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
  const periods = jointPeriods(toLetterValues(text).length, options);
  const candidates = scanJointCandidates(
    text,
    distinctAlphabets(words),
    periods,
    options.onProgress,
  );
  return finishJoint(text, candidates, table, options);
}

/** The key lengths the attack tries on a text of `length` letters; throws when there are none. */
export function jointPeriods(
  length: number,
  options: Pick<Options, "period" | "maxPeriod">,
): number[] {
  if (length < MIN_LENGTH) {
    throw new Error(`text must contain at least ${MIN_LENGTH} letters`);
  }
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
  return periods;
}

/**
 * Stage 1, the word scan: the chain score of every keyword in `alphabets`
 * (one word per alphabet) at every variant and period. Returns the best of
 * each period. The list can be scanned in parts: the best of the whole list
 * are among the best of its parts.
 */
export function scanJointCandidates(
  text: string,
  alphabets: string[],
  periods: number[],
  onProgress?: (done: number, total: number) => void,
): JointCandidate[] {
  const cipher = toLetterValues(text);
  const length = cipher.length;
  const byPeriod = new Map<number, JointCandidate[]>();
  for (const period of periods) {
    byPeriod.set(period, []);
  }
  alphabets.forEach((word, wordCount) => {
    const alphabet = mixedAlphabet(word);
    for (const plan of variantPlans(alphabet, inverseAlphabet(alphabet))) {
      const shifted = shiftTable(cipher, plan.input, plan.output);
      for (const [period, candidates] of byPeriod) {
        candidates.push({
          word,
          variant: plan.variant,
          period,
          score: chainScore(shifted, length, period),
        });
      }
    }
    if (
      (wordCount + 1) % PROGRESS_EVERY === 0 ||
      wordCount + 1 === alphabets.length
    ) {
      onProgress?.(wordCount + 1, alphabets.length);
    }
  });
  return [...byPeriod.values()].flatMap((candidates) =>
    best(candidates, CHAIN_KEEP),
  );
}

/**
 * Stages 2 to 4: from the word scan's candidates to the answer. The exact
 * ring solution re-ranks each period's shortlist, a climb on quadgram score
 * ranks the survivors of all periods, and annealing decides among the best.
 */
export function finishJoint(
  text: string,
  candidates: JointCandidate[],
  table: Uint8Array,
  options: Pick<Options, "rng"> = {},
): QuagmireDictionaryResult {
  const ring = ringJointCandidates(text, jointShortlist(candidates));
  const finalists = climbJointCandidates(text, ring, table, options);
  return decideJoint(text, annealJointFinalists(text, finalists, table));
}

/** The shift table of a candidate's keyword and variant for the ciphertext. */
function shiftTableOf(cipher: number[], candidate: JointCandidate): Uint8Array {
  const plan = planFor(candidate.word, candidate.variant);
  return shiftTable(cipher, plan.input, plan.output);
}

/** A scorer of decryptions of `length` letters: the raw quadgram sum of a shift table read at the given shifts. */
function quadgramScorer(
  length: number,
  table: Uint8Array,
): (shifted: Uint8Array, shifts: number[]) => number {
  const plain = new Array<number>(length);
  return (shifted, shifts) => {
    const period = shifts.length;
    for (let i = 0; i < length; i += 1) {
      plain[i] = shifted[i * ALPHABET_SIZE + shifts[i % period]];
    }
    return quadgramRaw(plain, length, table);
  };
}

/** The best of each period among the given candidates, period by period. */
function bestOfEachPeriod<T extends JointCandidate>(
  candidates: T[],
  keep: number,
): T[] {
  const periods = [...new Set(candidates.map((candidate) => candidate.period))];
  return periods.flatMap((period) =>
    best(
      candidates.filter((candidate) => candidate.period === period),
      keep,
    ),
  );
}

/** Each period's shortlist among the word scan's candidates: those that get a ring solution. */
export function jointShortlist(candidates: JointCandidate[]): JointCandidate[] {
  return bestOfEachPeriod(candidates, CHAIN_KEEP);
}

/**
 * Stage 2 for some or all of the shortlist: the exact ring solution of each
 * candidate, which is the score it is re-ranked by and the shifts it starts
 * from. The shortlist can be solved in parts, on separate threads.
 */
export function ringJointCandidates(
  text: string,
  candidates: JointCandidate[],
): JointShifted[] {
  const cipher = toLetterValues(text);
  const length = cipher.length;
  return candidates.map((candidate) => {
    const shifted = shiftTableOf(cipher, candidate);
    const { score, shifts } = ringShifts(shifted, length, candidate.period);
    return { ...candidate, score, shifts };
  });
}

/**
 * Stage 3: the finalists among the candidates with a ring solution, best
 * first. The best of each period by ring score survive, and a climb on
 * quadgram score ranks the survivors of all periods.
 */
export function climbJointCandidates(
  text: string,
  ring: JointShifted[],
  table: Uint8Array,
  options: Pick<Options, "rng"> = {},
): JointFinalist[] {
  const cipher = toLetterValues(text);
  const length = cipher.length;
  const rng = options.rng ?? Math.random;
  const survivors = bestOfEachPeriod(ring, RING_KEEP);

  // From the ring shifts, move one column at a time to its best shift until
  // none improves. This ranks the survivors of all periods the same way on
  // every run; annealing from random shifts here ranked the true keyword of
  // Kryptos K1 anywhere from first to 290th.
  const quadgrams = quadgramScorer(length, table);
  const climbed = best(
    survivors.map((candidate) => {
      const shifted = shiftTableOf(cipher, candidate);
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
  return climbed.map((candidate) => ({
    ...candidate,
    seed: Math.floor(rng() * 2 ** 31),
  }));
}

/**
 * Stage 4 for some or all of the finalists: anneals each from its climbed
 * shifts, which gets past optima that need several columns to change
 * together. The finalists can be annealed in parts, on separate threads.
 */
export function annealJointFinalists(
  text: string,
  finalists: JointFinalist[],
  table: Uint8Array,
): Finalist[] {
  const cipher = toLetterValues(text);
  const length = cipher.length;
  const quadgrams = quadgramScorer(length, table);
  return finalists.map((candidate) => {
    const shifted = shiftTableOf(cipher, candidate);
    const { period } = candidate;
    const rng = seededRng(candidate.seed);
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
}

/** The answer from the annealed finalists: the best of them, found if it reads as English on enough text. */
export function decideJoint(
  text: string,
  finalists: Finalist[],
): QuagmireDictionaryResult {
  const length = toLetterValues(text).length;
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
