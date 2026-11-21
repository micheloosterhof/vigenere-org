// ABOUTME: Breaks Quagmire IV, whose plaintext and ciphertext alphabets are mixed by two different keywords.
// ABOUTME: Jobs anneal the two keyword letter sets together at a period and pair of keyword sizes, quick jobs first, and complete the best pairs into keys.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { averageLog10, quadgramRaw, seededRng } from "./anneal";
import { substituteLetters } from "./cipher";
import { nameQuagmireKey } from "./keyword-alphabet";
import { completeKey, decryptWithAlphabets } from "./quagmire-key-climb";
import {
  letterSetPairScorer,
  type LetterSetPairScorer,
} from "./quagmire-letter-sets";
import { toLetterValues } from "./solve";
import {
  keywordForm,
  keywordOfAlphabet,
  letterSetPeriods,
  readableFitness,
  shortestPeriod,
} from "./solve-quagmire-letter-sets";
import type { SolverRequirements } from "./solver-requirements";

const ALPHABET_SIZE = 26;
const CODE_A = 65;
const SET_SPACE = 2 ** ALPHABET_SIZE;

// Steps per annealing run. Each run contributes its best pair of letter sets.
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

// Keyword sizes tried when none are given, as pairs for the plaintext and the
// ciphertext keyword. A size up to three letters too large mostly still finds
// the keyword, one too small does not, so 6 and 8 cover keywords of 3 to 8
// different letters.
const SIZES: readonly [plain: number, cipher: number][] = [
  [6, 6],
  [6, 8],
  [8, 6],
  [8, 8],
];
// Annealing runs per job in each round. In bench/results/quagmire-iv-jobs.tsv
// 30 runs solve 45 of 54 texts with keywords of up to 8 different letters and
// 48 or more letters per column, at a third of the cost of 100 runs, which
// solve 53.
const ROUNDS: readonly number[] = [30, 100];
// How many of the likeliest periods are tried, and the letters per column a
// period must leave.
const PERIODS_TRIED = 2;
const MIN_PER_COLUMN = 24;

// Below this many letters the search fits wrong keys to pseudo-English.
const MIN_RELIABLE_LENGTH = 64;
// The search reads at most this many letters: enough for 64 per column at the
// longest period, and completions cost time in proportion to the text.
const SEARCH_LETTERS = 800;

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
  /** Annealing runs. */
  runs: number;
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

export interface QuagmireIvPlan {
  /** Periods to try, in this order; by default the two likeliest that leave enough letters per column. */
  periods?: number[];
  /** Pairs of keyword sizes to try: the number of different letters in the plaintext keyword and in the ciphertext keyword. By default pairs that cover keywords of up to 8 different letters. */
  sizes?: readonly [plain: number, cipher: number][];
  /** Annealing runs per job, one number per round; 30 then 100 by default. */
  rounds?: readonly number[];
}

export interface QuagmireIvOptions extends QuagmireIvPlan {
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
    job.runs,
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

/** The letters of `text` that the search reads, as values. */
export function searchedLetters(text: string): number[] {
  return toLetterValues(text).slice(0, SEARCH_LETTERS);
}

/** Whether a decryption of `letters` letters with this fitness counts as found. */
export function quagmireIvFound(letters: number, fitness: number): boolean {
  return letters >= MIN_RELIABLE_LENGTH && fitness >= readableFitness(letters);
}

/** A job as a pool worker takes it: with the seed of its random numbers. */
export interface SeededQuagmireIvJob extends QuagmireIvJob {
  seed: number;
}

/** A job's solution, with what tells a pool to stop: whether it reads as English. */
export interface QuagmireIvJobResult extends QuagmireIvSolution {
  english: boolean;
}

/** Runs one job on the letters of `text` that the search reads. */
export function runSeededQuagmireIvJob(
  job: SeededQuagmireIvJob,
  text: string,
  table: Uint8Array,
): QuagmireIvJobResult {
  const cipher = searchedLetters(text);
  const solution = runQuagmireIvJob(cipher, job, table, seededRng(job.seed));
  return {
    ...solution,
    english: quagmireIvFound(cipher.length, solution.fitness),
  };
}

/**
 * The periods tried when none are given: the likeliest by the columns' index
 * of coincidence, out of those that leave enough letters per column.
 */
export function quagmireIvPeriods(cipher: number[]): number[] {
  return letterSetPeriods(cipher)
    .filter((period) => cipher.length / period >= MIN_PER_COLUMN)
    .slice(0, PERIODS_TRIED);
}

/**
 * The jobs of a search, in the order to run them: round by round, so that the
 * quick jobs of every period and size pair come before any longer one.
 */
export function planQuagmireIvJobs(
  cipher: number[],
  plan: QuagmireIvPlan = {},
): QuagmireIvJob[] {
  const periods = plan.periods ?? quagmireIvPeriods(cipher);
  const jobs: QuagmireIvJob[] = [];
  for (const runs of plan.rounds ?? ROUNDS) {
    for (const period of periods) {
      for (const [plainSize, cipherSize] of plan.sizes ?? SIZES) {
        jobs.push({ period, plainSize, cipherSize, runs });
      }
    }
  }
  return jobs;
}

const text = (values: number[]): string =>
  values.map((value) => String.fromCharCode(CODE_A + value)).join("");

/**
 * The result a solution stands for: both alphabets in keyword form, the
 * shortest period the shifts repeat with, the key named, and the whole of
 * `ciphertext` decrypted.
 */
export function quagmireIvResult(
  ciphertext: string,
  solution: Pick<
    QuagmireIvSolution,
    "plainAlphabet" | "cipherAlphabet" | "offsets" | "fitness"
  >,
): QuagmireIvResult {
  // The search can end on either alphabet turned by some places; the turn
  // with the longest ordered tail is the keyword form.
  const plain = keywordForm(1, solution.plainAlphabet, solution.offsets);
  const cipher = keywordForm(2, solution.cipherAlphabet, plain.offsets);
  // A multiple of the true period decrypts as well; report the period itself.
  const period = shortestPeriod(cipher.offsets);
  const offsets = cipher.offsets.slice(0, period);
  const plainAlphabet = text(plain.alphabet);
  const cipherAlphabet = text(cipher.alphabet);
  const index = new Array<number>(ALPHABET_SIZE);
  cipher.alphabet.forEach((letter, i) => {
    index[letter] = i;
  });
  const named = nameQuagmireKey(plainAlphabet, cipherAlphabet, offsets);
  return {
    found: quagmireIvFound(
      searchedLetters(ciphertext).length,
      solution.fitness,
    ),
    plainKeyword: keywordOfAlphabet(plainAlphabet),
    cipherKeyword: keywordOfAlphabet(cipherAlphabet),
    plainAlphabet,
    cipherAlphabet,
    period,
    offsets,
    key: named.key,
    indicator: named.indicator,
    plaintext: substituteLetters(
      ciphertext,
      offsets,
      (letter, offset) =>
        plain.alphabet[
          (index[letter] - offset + ALPHABET_SIZE) % ALPHABET_SIZE
        ],
    ),
    fitness: solution.fitness,
  };
}

/**
 * Breaks a Quagmire IV. Each alphabet is its keyword followed by the
 * remaining letters in order, so the two sets of keyword letters place every
 * other letter. Scoring every pair of sets is out of reach, so each period
 * and pair of keyword sizes is a job that anneals the two sets together and
 * completes the best pairs found. The jobs run quick ones first, and the
 * search stops at the first decryption that reads as English. Check `found`.
 */
export function breakQuagmireIv(
  ciphertext: string,
  table: Uint8Array,
  options: QuagmireIvOptions = {},
): QuagmireIvResult {
  const cipher = searchedLetters(ciphertext);
  const rng = options.rng ?? Math.random;
  const jobs = planQuagmireIvJobs(cipher, options);
  let best: QuagmireIvSolution | undefined;
  for (const [done, job] of jobs.entries()) {
    const solution = runQuagmireIvJob(cipher, job, table, rng);
    if (best === undefined || solution.fitness > best.fitness) {
      best = solution;
    }
    options.onProgress?.(done + 1, jobs.length);
    if (quagmireIvFound(cipher.length, best.fitness)) {
      break;
    }
  }
  if (best === undefined) {
    throw new Error("text is too short for any key length");
  }
  return quagmireIvResult(ciphertext, best);
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
