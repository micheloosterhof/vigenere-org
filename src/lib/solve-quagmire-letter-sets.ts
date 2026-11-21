// ABOUTME: Breaks Quagmire I-III without a word list by scanning which letters form the alphabet keyword.
// ABOUTME: A quick pass over every period, variant and keyword size completes the best sets; the best-scoring combinations then get a full search.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { averageLog10, quadgramRaw } from "./anneal";
import { columnIoc } from "./period";
import { completeKey, decryptWithAlphabets } from "./quagmire-key-climb";
import {
  bestLetterSets,
  letterSetCount,
  letterSetScorer,
  type KeywordVariant,
  type LetterSetScorer,
  type ScoredLetterSet,
} from "./quagmire-letter-sets";
import { toLetterValues } from "./solve";
import {
  keywordResult,
  type QuagmireDictionaryResult,
} from "./solve-quagmire-dictionary";
import type { SolverRequirements } from "./solver-requirements";

const ALPHABET_SIZE = 26;
const CODE_A = 65;

// Letter sets completed per variant, period, and keyword size.
const SETS_COMPLETED = 300;
// The share of all letter sets of a size that is scored, and the least number
// scored: near-miss sets are repaired during completion, so a sample is enough.
const SAMPLE = 0.02;
const MIN_SETS_SCORED = 15000;
// The quick pass scores this many sets per variant and keyword size and
// completes the best few: in bench/results/quagmire-letter-sets-search.tsv
// nine solutions in ten come from the ten best sets.
const QUICK_SETS_SCORED = 15000;
const QUICK_SETS_COMPLETED = 10;
// How many variants, periods and sizes get the full search after the quick
// pass, and the log10 likelihood taken off a best set score per column to
// compare periods.
const DEEP_JOBS = 6;
const COLUMN_PENALTY = 2;

const VARIANTS: readonly KeywordVariant[] = [1, 2, 3];
// Keyword sizes tried when none are given. A size up to two letters too large
// still builds the true alphabet, because the extra letters are the first of
// the ordered tail, so these cover keywords of 3 to 10 different letters.
const SIZES: readonly number[] = [6, 8, 10, 4];
const MAX_PERIOD = 12;
// A period is tried only when it leaves at least this many letters per column.
const MIN_PER_COLUMN = 8;
// A period counts as looking as monoalphabetic as the best one when its
// column index of coincidence rises this share of the way from the median
// period's to the best period's.
const PEAK_SHARE = 0.6;

// Below this many letters the search fits wrong keys to pseudo-English.
const MIN_RELIABLE_LENGTH = 64;
// The search reads at most this many letters: enough for 48 per column at the
// longest period, and completions cost time in proportion to the text.
const SEARCH_LETTERS = 600;

/**
 * The average quadgram log10 probability from which a decryption of `letters`
 * letters counts as found; the search stops at the first completion that
 * reaches it. Under a hundred letters the bar is higher: in
 * bench/results/quagmire-letter-sets-unknown.tsv a decryption with a third of
 * its letters right reached -4.45 on 64 letters, where the right ones scored
 * -4.36 or better. From about a hundred letters wrong decryptions stay below
 * -5.0.
 */
export function readableFitness(letters: number): number {
  return letters < 100 ? -4.4 : -4.5;
}

/** One part of the search: a variant, period, and number of keyword letters. */
export interface LetterSetJob {
  variant: KeywordVariant;
  period: number;
  size: number;
  /** How many letter sets to score, drawn at random when the size has more; by default a fiftieth of them and at least 15,000. */
  scored?: number;
  /** How many of the best-scoring sets to complete; 300 by default. */
  completed?: number;
}

export interface LetterSetSolution extends LetterSetJob {
  /** The mixed alphabet: the keyword's letters, then the rest in order. */
  alphabet: number[];
  offsets: number[];
  /** Average quadgram log10 probability of the decryption. */
  fitness: number;
  /** How many letter sets were completed before the search stopped. */
  setsCompleted: number;
}

export interface LetterSetsOptions {
  /** Variants to try; all three by default. */
  variants?: KeywordVariant[];
  /** Periods to try, in this order; by default every period with enough letters per column, likeliest first. */
  periods?: number[];
  /** Numbers of different letters in the keyword to try; by default sizes that cover 3 to 10. */
  sizes?: number[];
  /** How many of the best-scoring variants, periods and sizes get the full search when the quick pass finds nothing; 6 by default. */
  deepJobs?: number;
  rng?: () => number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * The keyword a keyword-mixed alphabet was built from: what precedes its
 * ascending tail. A keyword whose last letters run on into the tail builds the
 * same alphabet without them, so those letters cannot be told apart.
 */
export function keywordOfAlphabet(alphabet: string): string {
  let tail = alphabet.length - 1;
  while (tail > 0 && alphabet[tail - 1] < alphabet[tail]) {
    tail -= 1;
  }
  return alphabet.slice(0, tail);
}

const UNMIXED = Array.from({ length: ALPHABET_SIZE }, (_, i) => i);

/** The plaintext letter values of `cipher` under one keyword alphabet and column offsets. */
export function decryptWithAlphabet(
  cipher: number[],
  variant: KeywordVariant,
  alphabet: number[],
  offsets: number[],
): number[] {
  return decryptWithAlphabets(
    cipher,
    variant === 2 ? UNMIXED : alphabet,
    variant === 1 ? UNMIXED : alphabet,
    offsets,
  );
}

/** Completes the given letter sets in turn; returns the completion with the best quadgram fitness. */
function completeSets(
  cipher: number[],
  job: LetterSetJob,
  scorer: LetterSetScorer,
  sets: ScoredLetterSet[],
  table: Uint8Array,
  rng: () => number,
): LetterSetSolution {
  const { variant, period } = job;
  let best: LetterSetSolution = {
    ...job,
    alphabet: Array.from({ length: ALPHABET_SIZE }, (_, i) => i),
    offsets: new Array<number>(period).fill(0),
    fitness: -Infinity,
    setsCompleted: 0,
  };
  for (const [completed, set] of sets.entries()) {
    scorer.score(set.letters);
    const key = completeKey(
      cipher,
      period,
      {
        plain: variant === 2 ? [] : set.letters,
        cipher: variant === 1 ? [] : set.letters,
        shared: variant === 3,
      },
      scorer.shifts,
      table,
      rng,
    );
    const alphabet = variant === 2 ? key.cipherAlphabet : key.plainAlphabet;
    const { offsets } = key;
    const fitness = averageLog10(
      quadgramRaw(
        decryptWithAlphabet(cipher, variant, alphabet, offsets),
        cipher.length,
        table,
      ),
      cipher.length - 3,
    );
    if (fitness > best.fitness) {
      best = { ...job, alphabet, offsets, fitness, setsCompleted: 0 };
    }
    best.setsCompleted = completed + 1;
    if (best.fitness >= readableFitness(cipher.length)) {
      break;
    }
  }
  return best;
}

/**
 * Runs one part of the search: scores a sample of the keyword letter sets of
 * the job's size, completes the best ones in turn, and returns the completion
 * with the best quadgram fitness.
 */
export function runLetterSetJob(
  cipher: number[],
  job: LetterSetJob,
  table: Uint8Array,
  rng: () => number,
): LetterSetSolution {
  const scorer = letterSetScorer(cipher, job.variant, job.period);
  const all = letterSetCount(job.size);
  const scored = job.scored ?? Math.max(SAMPLE * all, MIN_SETS_SCORED);
  const sets = bestLetterSets(
    scorer,
    job.size,
    job.completed ?? SETS_COMPLETED,
    Math.min(1, scored / all),
    rng,
  );
  return completeSets(cipher, job, scorer, sets, table, rng);
}

export interface PeriodScan {
  /** The best completion the quick pass found at this period. */
  solution: LetterSetSolution;
  /** Every variant and keyword size tried, with its best letter-set score. */
  jobs: { job: LetterSetJob; score: number }[];
}

/**
 * The quick pass over one period: for every variant and keyword size, scores
 * a small sample of letter sets and keeps the best few; then completes those,
 * starting with the variant and size whose best set scored highest. At the
 * true period that is nearly always the true variant with a size that fits.
 */
export function scanLetterSetPeriod(
  cipher: number[],
  period: number,
  table: Uint8Array,
  rng: () => number,
  variants: readonly KeywordVariant[] = VARIANTS,
  sizes: readonly number[] = SIZES,
): PeriodScan {
  const scans: {
    job: LetterSetJob;
    scorer: LetterSetScorer;
    sets: ScoredLetterSet[];
  }[] = [];
  for (const variant of variants) {
    const scorer = letterSetScorer(cipher, variant, period);
    for (const size of sizes) {
      const sets = bestLetterSets(
        scorer,
        size,
        QUICK_SETS_COMPLETED,
        Math.min(1, QUICK_SETS_SCORED / letterSetCount(size)),
        rng,
      );
      if (sets.length > 0) {
        scans.push({ job: { variant, period, size }, scorer, sets });
      }
    }
  }
  scans.sort((a, b) => b.sets[0].score - a.sets[0].score);
  let best: LetterSetSolution | undefined;
  for (const { job, scorer, sets } of scans) {
    const solution = completeSets(cipher, job, scorer, sets, table, rng);
    if (best === undefined || solution.fitness > best.fitness) {
      best = solution;
    }
    if (best.fitness >= readableFitness(cipher.length)) {
      break;
    }
  }
  if (best === undefined) {
    throw new Error("no variant or keyword size to try");
  }
  return {
    solution: best,
    jobs: scans.map(({ job, sets }) => ({ job, score: sets[0].score })),
  };
}

/**
 * The periods worth trying, most promising first, out of those that leave
 * enough letters per column. Periods whose columns look about as
 * monoalphabetic as the best one come first, shortest first, so that a period
 * is tried before its multiples; the others follow, best first.
 */
export function letterSetPeriods(cipher: number[]): number[] {
  const periods: number[] = [];
  for (let period = 2; period <= MAX_PERIOD; period += 1) {
    if (cipher.length / period >= MIN_PER_COLUMN) {
      periods.push(period);
    }
  }
  const ioc = new Map(
    periods.map((period) => [period, columnIoc(cipher, period)]),
  );
  const of = (period: number): number => ioc.get(period) ?? 0;
  const sorted = [...periods].sort((a, b) => of(a) - of(b));
  const peak = of(sorted[sorted.length - 1]);
  const baseline = of(sorted[Math.floor(sorted.length / 2)]);
  const strong = baseline + PEAK_SHARE * (peak - baseline);
  return [
    ...periods.filter((period) => of(period) >= strong),
    ...sorted.reverse().filter((period) => of(period) < strong),
  ];
}

/**
 * Rewrites a solved key in keyword form. The search can end on the alphabet
 * turned by some places, which decrypts the same once the shifts are turned
 * to match but reads as a longer keyword (ZVORTIGEN for VORTIGEN). The turn
 * with the longest ordered tail is the keyword form.
 */
export function keywordForm(
  variant: KeywordVariant,
  alphabet: number[],
  offsets: number[],
): { alphabet: number[]; offsets: number[] } {
  let best = { tail: 0, places: 0 };
  for (let places = 0; places < ALPHABET_SIZE; places += 1) {
    let tail = 1;
    while (
      tail < ALPHABET_SIZE &&
      alphabet[(places + ALPHABET_SIZE - tail - 1) % ALPHABET_SIZE] <
        alphabet[(places + ALPHABET_SIZE - tail) % ALPHABET_SIZE]
    ) {
      tail += 1;
    }
    if (tail > best.tail) {
      best = { tail, places };
    }
  }
  const { places } = best;
  // Turning the plaintext alphabet moves every shift the same way, the
  // ciphertext alphabet the other way, and a shared alphabet not at all.
  const shiftTurn = variant === 1 ? places : variant === 2 ? -places : 0;
  return {
    alphabet: alphabet.map((_, i) => alphabet[(i + places) % ALPHABET_SIZE]),
    offsets: offsets.map(
      (offset) => (offset + shiftTurn + ALPHABET_SIZE) % ALPHABET_SIZE,
    ),
  };
}

/** The shortest period that the offsets repeat with. */
function shortestPeriod(offsets: number[]): number {
  for (let period = 1; period < offsets.length; period += 1) {
    if (
      offsets.length % period === 0 &&
      offsets.every((offset, i) => offset === offsets[i % period])
    ) {
      return period;
    }
  }
  return offsets.length;
}

/**
 * Breaks a Quagmire I, II, or III whose alphabet keyword is not in any word
 * list. In a keyword-mixed alphabet the letters outside the keyword follow it
 * in order, so knowing which letters the keyword holds places all the others.
 * A quick pass scans each period in turn, for every variant and keyword size;
 * if none reads as English, the variants, periods and sizes whose best letter
 * set scored highest get the full search. Check `found`.
 */
export function breakQuagmireLetterSets(
  text: string,
  table: Uint8Array,
  options: LetterSetsOptions = {},
): QuagmireDictionaryResult {
  const cipher = toLetterValues(text).slice(0, SEARCH_LETTERS);
  if (cipher.length < 2 * MIN_PER_COLUMN) {
    throw new Error(`text must contain at least ${2 * MIN_PER_COLUMN} letters`);
  }
  const rng = options.rng ?? Math.random;
  const variants = options.variants ?? VARIANTS;
  const sizes = options.sizes ?? SIZES;
  const periods = options.periods ?? letterSetPeriods(cipher);
  const deepJobs = Math.min(
    options.deepJobs ?? DEEP_JOBS,
    periods.length * variants.length * sizes.length,
  );
  const steps = periods.length + deepJobs;
  let done = 0;
  const step = (): void => {
    done += 1;
    options.onProgress?.(done, steps);
  };

  let best: LetterSetSolution | undefined;
  const keep = (solution: LetterSetSolution): boolean => {
    if (best === undefined || solution.fitness > best.fitness) {
      best = solution;
    }
    return best.fitness >= readableFitness(cipher.length);
  };
  const ranked: { job: LetterSetJob; score: number }[] = [];
  let found = false;
  for (const period of periods) {
    const scan = scanLetterSetPeriod(
      cipher,
      period,
      table,
      rng,
      variants,
      sizes,
    );
    ranked.push(...scan.jobs);
    found = keep(scan.solution);
    step();
    if (found) {
      break;
    }
  }
  if (!found) {
    // Every extra column adds a free shift, which lifts the best score of a
    // wrong period; the penalty per column takes that out of the comparison.
    const rank = ({ job, score }: (typeof ranked)[number]): number =>
      score - COLUMN_PENALTY * job.period;
    ranked.sort((a, b) => rank(b) - rank(a));
    for (const { job } of ranked.slice(0, deepJobs)) {
      found = keep(runLetterSetJob(cipher, job, table, rng));
      step();
      if (found) {
        break;
      }
    }
  }
  if (best === undefined) {
    throw new Error("no period to try");
  }
  const solved: LetterSetSolution = best;
  const form = keywordForm(solved.variant, solved.alphabet, solved.offsets);
  // A multiple of the true period decrypts as well; report the period itself.
  const period = shortestPeriod(form.offsets);
  const alphabetText = form.alphabet
    .map((value) => String.fromCharCode(CODE_A + value))
    .join("");
  return keywordResult(
    text,
    {
      word: keywordOfAlphabet(alphabetText),
      variant: solved.variant,
      period,
      offsets: form.offsets.slice(0, period),
      fitness: solved.fitness,
    },
    cipher.length >= MIN_RELIABLE_LENGTH &&
      solved.fitness >= readableFitness(cipher.length),
  );
}

/**
 * What the letter-set scan needs. In
 * bench/results/quagmire-letter-sets-unknown.tsv, with variant, period and
 * keyword size all unknown, Quagmire I and II fall at 16 letters per column
 * (45 of 48 texts) and Quagmire III with a keyword of 5 different letters too
 * (8 of 8). Quagmire III with 7 different letters needs 24 (7 of 8) and with
 * 9 needs 48 (7 of 8), which is the figure stated. None of 36 texts without a
 * keyword alphabet was reported as found.
 */
export const QUAGMIRE_LETTER_SETS_REQUIREMENTS: SolverRequirements = {
  id: "quagmire-letter-sets",
  ciphers: ["Quagmire I", "Quagmire II", "Quagmire III"],
  assumes: ["periodic", "shared-alphabet", "keyword-alphabet"],
  minLetters: MIN_RELIABLE_LENGTH,
  reliableLettersPerColumn: 48,
  maxPeriod: MAX_PERIOD,
  basis: "measured",
};
