// ABOUTME: Breaks Quagmire IV, whose plaintext and ciphertext alphabets are mixed by two different keywords.
// ABOUTME: Anneals the two keyword letter sets together, then completes the candidate pairs into keys by local search.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { averageLog10, quadgramRaw } from "./anneal";
import { substituteLetters } from "./cipher";
import { nameQuagmireKey } from "./keyword-alphabet";
import { completeKey, decryptWithAlphabets } from "./quagmire-key-climb";
import {
  letterSetPairScorer,
  type LetterSetPairScorer,
} from "./quagmire-letter-sets";
import { toLetterValues } from "./solve";
import {
  keywordOfAlphabet,
  readableFitness,
} from "./solve-quagmire-letter-sets";
import type { SolverRequirements } from "./solver-requirements";

const ALPHABET_SIZE = 26;
const CODE_A = 65;
const SET_SPACE = 2 ** ALPHABET_SIZE;

// Annealing runs per period and pair of keyword sizes, and steps per run.
// Each run contributes its best pair of letter sets.
const RUNS = 300;
const STEPS = 3000;
// Starting temperature in log10 likelihood; it falls linearly to zero.
const TEMPERATURE = 3;
// The share of moves that slide a keyword letter to the nearest free letter
// beside it. That moves a single letter of the alphabet's ordered tail, so the
// score changes little; the other moves replace a keyword letter at random.
const SLIDE_SHARE = 0.8;

// The best-scoring pairs a job completes into keys. In
// bench/results/quagmire-iv-jobs.tsv the pair that solved was among the first
// 20 in 494 of 500 solved jobs, and the very first in 431.
const PAIRS_COMPLETED = 20;

// Below this many letters the search fits wrong keys to pseudo-English.
const MIN_RELIABLE_LENGTH = 64;

export interface QuagmireIvResult {
  /** True when the best decryption reads as English. */
  found: boolean;
  plainKeyword: string;
  cipherKeyword: string;
  /** The plaintext alphabet: its keyword, then the remaining letters in order. */
  plainAlphabet: string;
  cipherAlphabet: string;
  period: number;
  offsets: number[];
  /** The period key as letters, read off with the best-scoring indicator. */
  key: string;
  indicator: string;
  plaintext: string;
  /** Average quadgram log10 probability of the decryption. */
  fitness: number;
}

/** One part of the search: a period and the size of each keyword. */
export interface QuagmireIvJob {
  period: number;
  /** The number of different letters in the plaintext keyword. */
  plainSize: number;
  /** The number of different letters in the ciphertext keyword. */
  cipherSize: number;
  /** Annealing runs; 300 by default. */
  runs?: number;
}

export interface QuagmireIvSolution extends QuagmireIvJob {
  /** The plaintext alphabet as letter values: its keyword, then the remaining letters in order. */
  plainAlphabet: number[];
  cipherAlphabet: number[];
  offsets: number[];
  /** Average quadgram log10 probability of the decryption. */
  fitness: number;
  /** The best score of a pair of letter sets that the annealing reached. */
  score: number;
  /** How many pairs of letter sets were completed before the search stopped. */
  pairsCompleted: number;
}

interface Options {
  /** Periods to try, in this order. */
  periods: number[];
  /** Pairs of keyword sizes to try: the number of different letters in the plaintext keyword and in the ciphertext keyword. */
  sizes: [plain: number, cipher: number][];
  /** Annealing runs per period and size pair. */
  runs?: number;
  rng?: () => number;
  onProgress?: (done: number, total: number) => void;
}

interface LetterSetPair {
  plain: number[];
  cipher: number[];
  score: number;
}

/** The letters in a set held as a bit mask, in order. */
function lettersOf(mask: number): number[] {
  const letters: number[] = [];
  for (let letter = 0; letter < ALPHABET_SIZE; letter += 1) {
    if (mask & (1 << letter)) {
      letters.push(letter);
    }
  }
  return letters;
}

/** A random set of `size` letters as a bit mask. */
function randomSet(size: number, rng: () => number): number {
  let mask = 0;
  let count = 0;
  while (count < size) {
    const bit = 1 << Math.floor(rng() * ALPHABET_SIZE);
    if (!(mask & bit)) {
      mask |= bit;
      count += 1;
    }
  }
  return mask;
}

/** The set with one letter moved: slid to the nearest free neighbour, or replaced at random. */
function moved(mask: number, rng: () => number): number {
  const letters = lettersOf(mask);
  const out = letters[Math.floor(rng() * letters.length)];
  let into: number;
  if (rng() < SLIDE_SHARE) {
    const direction = rng() < 0.5 ? -1 : 1;
    into = out + direction;
    while (into >= 0 && into < ALPHABET_SIZE && mask & (1 << into)) {
      into += direction;
    }
    if (into < 0 || into >= ALPHABET_SIZE) {
      return mask;
    }
  } else {
    do {
      into = Math.floor(rng() * ALPHABET_SIZE);
    } while (mask & (1 << into));
  }
  return (mask ^ (1 << out)) | (1 << into);
}

/**
 * Anneals the plaintext and ciphertext keyword letter sets together on the
 * pair score. Returns one pair per run, best score first: the best pair the
 * run accepted that no earlier run contributed.
 */
function annealLetterSetPairs(
  scorer: LetterSetPairScorer,
  plainSize: number,
  cipherSize: number,
  runs: number,
  rng: () => number,
): LetterSetPair[] {
  const scores = new Map<number, number>();
  const scoreOf = (plain: number, cipher: number): number => {
    const key = plain * SET_SPACE + cipher;
    let score = scores.get(key);
    if (score === undefined) {
      scorer.setCipherLetters(lettersOf(cipher));
      score = scorer.score(lettersOf(plain));
      scores.set(key, score);
    }
    return score;
  };
  const taken = new Set<number>();
  const pairs: LetterSetPair[] = [];
  for (let run = 0; run < runs; run += 1) {
    let plain = randomSet(plainSize, rng);
    let cipher = randomSet(cipherSize, rng);
    let score = scoreOf(plain, cipher);
    const accepted = new Map<number, number>([
      [plain * SET_SPACE + cipher, score],
    ]);
    for (let step = 0; step < STEPS; step += 1) {
      const temperature = TEMPERATURE * (1 - step / STEPS);
      const changePlain = rng() < 0.5;
      const nextPlain = changePlain ? moved(plain, rng) : plain;
      const nextCipher = changePlain ? cipher : moved(cipher, rng);
      if (nextPlain === plain && nextCipher === cipher) {
        continue;
      }
      const next = scoreOf(nextPlain, nextCipher);
      if (
        next >= score ||
        (temperature > 0 && rng() < Math.exp((next - score) / temperature))
      ) {
        plain = nextPlain;
        cipher = nextCipher;
        score = next;
        accepted.set(plain * SET_SPACE + cipher, score);
      }
    }
    const best = [...accepted.entries()]
      .sort((a, b) => b[1] - a[1])
      .find(([key]) => !taken.has(key));
    if (best !== undefined) {
      taken.add(best[0]);
      pairs.push({
        plain: lettersOf(Math.floor(best[0] / SET_SPACE)),
        cipher: lettersOf(best[0] % SET_SPACE),
        score: best[1],
      });
    }
  }
  return pairs.sort((a, b) => b.score - a.score);
}

const UNMIXED = Array.from({ length: ALPHABET_SIZE }, (_, i) => i);

/**
 * Runs one part of the search: anneals the two keyword letter sets together
 * at the job's period and sizes, then completes the best-scoring pairs found,
 * best first, by local search over both keywords' order and letters and the
 * column shifts. Returns the completion with the best quadgram fitness, and
 * stops at the first one that reads as English.
 */
export function runQuagmireIvJob(
  cipher: number[],
  job: QuagmireIvJob,
  table: Uint8Array,
  rng: () => number,
): QuagmireIvSolution {
  const { period } = job;
  const length = cipher.length;
  const readable = readableFitness(length);
  const scorer = letterSetPairScorer(cipher, period);
  const pairs = annealLetterSetPairs(
    scorer,
    job.plainSize,
    job.cipherSize,
    job.runs ?? RUNS,
    rng,
  );
  let best: QuagmireIvSolution = {
    ...job,
    plainAlphabet: UNMIXED,
    cipherAlphabet: UNMIXED,
    offsets: new Array<number>(period).fill(0),
    fitness: -Infinity,
    score: pairs.length > 0 ? pairs[0].score : -Infinity,
    pairsCompleted: 0,
  };
  for (const pair of pairs.slice(0, PAIRS_COMPLETED)) {
    scorer.setCipherLetters(pair.cipher);
    scorer.score(pair.plain);
    const key = completeKey(
      cipher,
      period,
      { plain: pair.plain, cipher: pair.cipher, shared: false },
      scorer.shifts,
      table,
      rng,
    );
    const fitness = averageLog10(
      quadgramRaw(
        decryptWithAlphabets(
          cipher,
          key.plainAlphabet,
          key.cipherAlphabet,
          key.offsets,
        ),
        length,
        table,
      ),
      length - 3,
    );
    if (fitness > best.fitness) {
      best = { ...best, ...key, fitness };
    }
    best.pairsCompleted += 1;
    if (best.fitness >= readable) {
      break;
    }
  }
  return best;
}

const text = (values: number[]): string =>
  values.map((value) => String.fromCharCode(CODE_A + value)).join("");

/**
 * Breaks a Quagmire IV. Each alphabet is its keyword followed by the
 * remaining letters in order, so the two sets of keyword letters place every
 * other letter. Scoring every pair of sets is out of reach, so each period
 * and pair of keyword sizes is a job that anneals the two sets together and
 * completes the pairs found. The search stops at the first decryption that
 * reads as English. Check `found`.
 */
export function breakQuagmireIv(
  ciphertext: string,
  table: Uint8Array,
  options: Options,
): QuagmireIvResult {
  const cipher = toLetterValues(ciphertext);
  const length = cipher.length;
  const rng = options.rng ?? Math.random;
  // The search stops at the first key whose decryption reads as English.
  const readable = readableFitness(length);
  const steps = options.periods.length * options.sizes.length;
  let done = 0;

  let best: Pick<
    QuagmireIvSolution,
    "fitness" | "period" | "plainAlphabet" | "cipherAlphabet" | "offsets"
  > = {
    fitness: -Infinity,
    period: 1,
    plainAlphabet: UNMIXED,
    cipherAlphabet: UNMIXED,
    offsets: [0],
  };
  search: for (const period of options.periods) {
    for (const [plainSize, cipherSize] of options.sizes) {
      const solution = runQuagmireIvJob(
        cipher,
        { period, plainSize, cipherSize, runs: options.runs },
        table,
        rng,
      );
      if (solution.fitness > best.fitness) {
        best = solution;
      }
      done += 1;
      options.onProgress?.(done, steps);
      if (best.fitness >= readable) {
        break search;
      }
    }
  }

  const plainAlphabet = text(best.plainAlphabet);
  const cipherAlphabet = text(best.cipherAlphabet);
  const index = new Array<number>(ALPHABET_SIZE);
  best.cipherAlphabet.forEach((letter, i) => {
    index[letter] = i;
  });
  const named = nameQuagmireKey(plainAlphabet, cipherAlphabet, best.offsets);
  return {
    found: length >= MIN_RELIABLE_LENGTH && best.fitness >= readable,
    plainKeyword: keywordOfAlphabet(plainAlphabet),
    cipherKeyword: keywordOfAlphabet(cipherAlphabet),
    plainAlphabet,
    cipherAlphabet,
    period: best.period,
    offsets: best.offsets,
    key: named.key,
    indicator: named.indicator,
    plaintext: substituteLetters(
      ciphertext,
      best.offsets,
      (letter, offset) =>
        best.plainAlphabet[
          (index[letter] - offset + ALPHABET_SIZE) % ALPHABET_SIZE
        ],
    ),
    fitness: best.fitness,
  };
}

/**
 * What the Quagmire IV breaker needs. In bench/results/quagmire-iv.tsv, with
 * the period and both keyword sizes given, it solves every text at 64 letters
 * per column (24 of 24), and at 48 all but those with 9 different letters in
 * each keyword (18 of 18 against 1 of 6). With both sizes guessed one too
 * large it solves 21 of 24 at 64 per column.
 */
export const QUAGMIRE_IV_REQUIREMENTS: SolverRequirements = {
  id: "quagmire-iv",
  ciphers: ["Quagmire IV"],
  assumes: ["periodic", "shared-alphabet", "keyword-alphabet"],
  minLetters: MIN_RELIABLE_LENGTH,
  reliableLettersPerColumn: 64,
  basis: "measured",
};
