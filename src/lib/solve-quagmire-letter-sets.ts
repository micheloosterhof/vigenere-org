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
// A completion at least this good is close enough to English to be searched
// again from its turned forms.
const NEARLY_READABLE_QUADGRAM = -5;
// Below this many letters the search fits wrong keys to pseudo-English.
const MIN_RELIABLE_LENGTH = 64;

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
 * Completes a keyword letter set into a full key by local search: change one
 * column's shift, swap two keyword letters, or replace a keyword letter by
 * one from outside. The replacement repairs a set that is one or two letters
 * off, so the scan need not find the exact set. The search runs on unigram
 * plus bigram score from several starts, which finds the right region, and
 * the best start is finished on quadgram score, which settles letters that
 * pair up plausibly either way (I for O).
 */
function completeLetterSet(
  cipher: number[],
  variant: KeywordVariant,
  period: number,
  letters: number[],
  startShifts: number[],
  table: Uint8Array,
  rng: () => number,
): { alphabet: number[]; offsets: number[] } {
  const length = cipher.length;
  const size = letters.length;
  const alphabet = new Array<number>(ALPHABET_SIZE);
  const index = new Array<number>(ALPHABET_SIZE);
  const used = new Uint8Array(ALPHABET_SIZE);
  const plain = new Array<number>(length).fill(0);
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
  const decipher = (): void => {
    for (let i = 0; i < length; i += 1) {
      const shift = shifts[i % period];
      const c = cipher[i];
      plain[i] =
        variant === 1
          ? alphabet[(c - shift + ALPHABET_SIZE) % ALPHABET_SIZE]
          : variant === 2
            ? (index[c] - shift + ALPHABET_SIZE) % ALPHABET_SIZE
            : alphabet[(index[c] - shift + ALPHABET_SIZE) % ALPHABET_SIZE];
    }
  };
  const bigramScore = (): number => {
    decipher();
    let sum = LETTERS[plain[0]];
    for (let i = 1; i < length; i += 1) {
      sum +=
        LETTERS[plain[i]] + BIGRAMS[plain[i - 1] * ALPHABET_SIZE + plain[i]];
    }
    return sum;
  };
  const quadgramScore = (): number => {
    decipher();
    return quadgramRaw(plain, length, table);
  };

  /** Applies improving moves until none is left; returns the score reached. */
  const climb = (score: () => number): number => {
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
    return current;
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
    const reached = climb(bigramScore);
    if (reached > best.score) {
      best = { score: reached, keyword: [...keyword], shifts: [...shifts] };
    }
  }
  keyword = best.keyword;
  shifts = best.shifts;
  let reached = climb(quadgramScore);

  // Turning the whole alphabet one place, with every shift turned to match,
  // is the same key. It reads as another keyword, though: XYUGOSLIV followed
  // by A is YUGOSLIVA with X sent to the tail, and only the second form can
  // reach YUGOSLAVI by swapping two keyword letters. A key that is close to
  // English is therefore also searched from both turned forms.
  const turn = (places: 1 | -1): void => {
    const tail = alphabet.slice(size);
    if (places === 1) {
      const dropped = keyword[0];
      keyword = [...keyword.slice(1), Math.min(dropped, tail[0])];
    } else {
      const dropped = keyword[size - 1];
      keyword = [
        Math.max(dropped, tail[tail.length - 1]),
        ...keyword.slice(0, size - 1),
      ];
    }
    const shiftTurn = variant === 1 ? places : variant === 2 ? -places : 0;
    shifts = shifts.map(
      (shift) => (shift + shiftTurn + ALPHABET_SIZE) % ALPHABET_SIZE,
    );
  };
  if (averageLog10(reached, length - 3) >= NEARLY_READABLE_QUADGRAM) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const places of [1, -1] as const) {
        const before = { keyword: [...keyword], shifts: [...shifts] };
        turn(places);
        const turned = climb(quadgramScore);
        if (turned > reached) {
          reached = turned;
          improved = true;
        } else {
          keyword = before.keyword;
          shifts = before.shifts;
          build();
        }
      }
    }
  }
  return { alphabet: [...alphabet], offsets: shifts };
}

/** The plaintext letter values of `cipher` under a mixed alphabet and column offsets. */
export function decryptWithAlphabet(
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
  const all = letterSetCount(size);
  const scored = job.scored ?? Math.max(SAMPLE * all, MIN_SETS_SCORED);
  const sets = bestLetterSets(
    scorer,
    size,
    job.completed ?? SETS_COMPLETED,
    Math.min(1, scored / all),
    rng,
  );
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
      table,
      rng,
    );
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
