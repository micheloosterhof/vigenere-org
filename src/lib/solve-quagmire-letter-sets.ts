// ABOUTME: Breaks Quagmire I-III without a word list by scanning which letters form the alphabet keyword.
// ABOUTME: The best letter sets are completed by a local search over the keyword's order, its letters, and the column shifts.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { averageLog10, quadgramRaw } from "./anneal";
import { ENGLISH_BIGRAM_LOGPROBS } from "./data/english-bigrams";
import { ENGLISH_FREQUENCIES } from "./diagnostics";
import {
  bestLetterSets,
  letterSetCount,
  letterSetScorer,
  type KeywordVariant,
} from "./quagmire-letter-sets";
import { toLetterValues } from "./solve";
import {
  keywordResult,
  type QuagmireDictionaryResult,
} from "./solve-quagmire-dictionary";

const ALPHABET_SIZE = 26;
const CODE_A = 65;
const BIGRAMS = Float64Array.from(ENGLISH_BIGRAM_LOGPROBS);
const LETTERS = Float64Array.from(ENGLISH_FREQUENCIES, Math.log10);

// Letter sets completed per variant, period, and keyword size.
const SETS_COMPLETED = 300;
// The share of all letter sets of a size that is scored, and the least number
// scored: near-miss sets are repaired during completion, so a sample is enough.
const SAMPLE = 0.02;
const MIN_SETS_SCORED = 15000;
// Starts of the completion search per letter set: the set as given, then
// random orders of its letters.
const STARTS = 4;

// Average quadgram log10 probability from which a decryption counts as found;
// the search stops at the first completion that reaches it.
const READABLE_QUADGRAM = -4.5;
// Below this many letters the search fits wrong keys to pseudo-English.
const MIN_RELIABLE_LENGTH = 64;

/** One part of the search: a variant, period, and number of keyword letters. */
export interface LetterSetJob {
  variant: KeywordVariant;
  period: number;
  size: number;
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

interface Options {
  variants?: KeywordVariant[];
  periods?: number[];
  /** Numbers of different letters in the keyword to try. */
  sizes?: number[];
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

/**
 * Completes a keyword letter set into a full key by local search on unigram
 * plus bigram score: change one column's shift, swap two keyword letters, or
 * replace a keyword letter by one from outside. The replacement repairs a set
 * that is one or two letters off, so the scan need not find the exact set.
 */
function completeLetterSet(
  cipher: number[],
  variant: KeywordVariant,
  period: number,
  letters: number[],
  startShifts: number[],
  rng: () => number,
): { alphabet: number[]; offsets: number[] } {
  const length = cipher.length;
  const size = letters.length;
  const alphabet = new Array<number>(ALPHABET_SIZE);
  const index = new Array<number>(ALPHABET_SIZE);
  const used = new Uint8Array(ALPHABET_SIZE);
  let keyword = [...letters];
  let shifts = [...startShifts];

  const build = (): void => {
    used.fill(0);
    for (let i = 0; i < size; i += 1) {
      alphabet[i] = keyword[i];
      used[keyword[i]] = 1;
    }
    let next = size;
    for (let letter = 0; letter < ALPHABET_SIZE; letter += 1) {
      if (!used[letter]) {
        alphabet[next] = letter;
        next += 1;
      }
    }
    for (let i = 0; i < ALPHABET_SIZE; i += 1) {
      index[alphabet[i]] = i;
    }
  };
  const score = (): number => {
    let sum = 0;
    let previous = 0;
    for (let i = 0; i < length; i += 1) {
      const shift = shifts[i % period];
      const c = cipher[i];
      const plain =
        variant === 1
          ? alphabet[(c - shift + ALPHABET_SIZE) % ALPHABET_SIZE]
          : variant === 2
            ? (index[c] - shift + ALPHABET_SIZE) % ALPHABET_SIZE
            : alphabet[(index[c] - shift + ALPHABET_SIZE) % ALPHABET_SIZE];
      sum += LETTERS[plain];
      if (i > 0) {
        sum += BIGRAMS[previous * ALPHABET_SIZE + plain];
      }
      previous = plain;
    }
    return sum;
  };

  let best = { score: -Infinity, keyword: [...keyword], shifts: [...shifts] };
  for (let start = 0; start < STARTS; start += 1) {
    keyword = [...letters];
    shifts = [...startShifts];
    if (start > 0) {
      for (let i = size - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [keyword[i], keyword[j]] = [keyword[j], keyword[i]];
      }
    }
    build();
    let current = score();
    let improved = true;
    while (improved) {
      improved = false;
      for (let column = 0; column < period; column += 1) {
        let bestShift = shifts[column];
        for (let shift = 0; shift < ALPHABET_SIZE; shift += 1) {
          shifts[column] = shift;
          const changed = score();
          if (changed > current) {
            current = changed;
            bestShift = shift;
            improved = true;
          }
        }
        shifts[column] = bestShift;
      }
      for (let a = 0; a < size; a += 1) {
        for (let b = a + 1; b < size; b += 1) {
          [keyword[a], keyword[b]] = [keyword[b], keyword[a]];
          build();
          const changed = score();
          if (changed > current) {
            current = changed;
            improved = true;
          } else {
            [keyword[a], keyword[b]] = [keyword[b], keyword[a]];
          }
        }
      }
      for (let a = 0; a < size; a += 1) {
        let bestLetter = keyword[a];
        for (let letter = 0; letter < ALPHABET_SIZE; letter += 1) {
          if (keyword.includes(letter)) {
            continue;
          }
          keyword[a] = letter;
          build();
          const changed = score();
          if (changed > current) {
            current = changed;
            bestLetter = letter;
            improved = true;
          }
          keyword[a] = bestLetter;
        }
      }
      build();
    }
    if (current > best.score) {
      best = { score: current, keyword: [...keyword], shifts: [...shifts] };
    }
  }
  keyword = best.keyword;
  build();
  return { alphabet: [...alphabet], offsets: best.shifts };
}

/** The plaintext letter values of `cipher` under a mixed alphabet and column offsets. */
function decrypt(
  cipher: number[],
  variant: KeywordVariant,
  alphabet: number[],
  offsets: number[],
): number[] {
  const index = new Array<number>(ALPHABET_SIZE);
  alphabet.forEach((letter, i) => {
    index[letter] = i;
  });
  return cipher.map((c, i) => {
    const from = variant === 1 ? c : index[c];
    const position =
      (from - offsets[i % offsets.length] + ALPHABET_SIZE) % ALPHABET_SIZE;
    return variant === 2 ? position : alphabet[position];
  });
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
  const { variant, period, size } = job;
  const scorer = letterSetScorer(cipher, variant, period);
  const sample = Math.min(
    1,
    Math.max(SAMPLE, MIN_SETS_SCORED / letterSetCount(size)),
  );
  const sets = bestLetterSets(scorer, size, SETS_COMPLETED, sample, rng);
  let best: LetterSetSolution = {
    ...job,
    alphabet: Array.from({ length: ALPHABET_SIZE }, (_, i) => i),
    offsets: new Array<number>(period).fill(0),
    fitness: -Infinity,
    setsCompleted: 0,
  };
  for (const [completed, set] of sets.entries()) {
    scorer.score(set.letters);
    const { alphabet, offsets } = completeLetterSet(
      cipher,
      variant,
      period,
      set.letters,
      scorer.shifts,
      rng,
    );
    const fitness = averageLog10(
      quadgramRaw(
        decrypt(cipher, variant, alphabet, offsets),
        cipher.length,
        table,
      ),
      cipher.length - 3,
    );
    if (fitness > best.fitness) {
      best = { ...job, alphabet, offsets, fitness, setsCompleted: 0 };
    }
    best.setsCompleted = completed + 1;
    if (best.fitness >= READABLE_QUADGRAM) {
      break;
    }
  }
  return best;
}

/**
 * Breaks a Quagmire I, II, or III whose alphabet keyword is not in any word
 * list. In a keyword-mixed alphabet the letters outside the keyword follow it
 * in order, so knowing which letters the keyword holds places all the others.
 * For each variant, period, and keyword size given, a sample of the letter
 * sets is scored and the best are completed; the search stops at the first
 * decryption that reads as English. Check `found`.
 */
export function breakQuagmireLetterSets(
  text: string,
  table: Uint8Array,
  options: Options & Required<Pick<Options, "periods" | "sizes">>,
): QuagmireDictionaryResult {
  const cipher = toLetterValues(text);
  const rng = options.rng ?? Math.random;
  const jobs: LetterSetJob[] = [];
  for (const period of options.periods) {
    for (const size of options.sizes) {
      for (const variant of options.variants ?? ([3, 1, 2] as const)) {
        jobs.push({ variant, period, size });
      }
    }
  }
  let best: LetterSetSolution | undefined;
  for (const [done, job] of jobs.entries()) {
    const solution = runLetterSetJob(cipher, job, table, rng);
    if (best === undefined || solution.fitness > best.fitness) {
      best = solution;
    }
    options.onProgress?.(done + 1, jobs.length);
    if (best.fitness >= READABLE_QUADGRAM) {
      break;
    }
  }
  if (best === undefined) {
    throw new Error("no period or keyword size to try");
  }
  const alphabetText = best.alphabet
    .map((value) => String.fromCharCode(CODE_A + value))
    .join("");
  return keywordResult(
    text,
    {
      word: keywordOfAlphabet(alphabetText),
      variant: best.variant,
      period: best.period,
      offsets: best.offsets,
      fitness: best.fitness,
    },
    cipher.length >= MIN_RELIABLE_LENGTH && best.fitness >= READABLE_QUADGRAM,
  );
}
