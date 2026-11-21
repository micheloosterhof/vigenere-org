// ABOUTME: Local search that turns the keyword letter sets of a Quagmire into a full key: keyword order, letters, and column shifts.
// ABOUTME: Covers all four variants: a keyword on the plaintext alphabet, on the ciphertext alphabet, one shared by both, or one on each.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { averageLog10, quadgramRaw } from "./anneal";
import { ENGLISH_BIGRAM_LOGPROBS } from "./data/english-bigrams";
import { ENGLISH_FREQUENCIES } from "./diagnostics";

const ALPHABET_SIZE = 26;
const BIGRAMS = Float64Array.from(ENGLISH_BIGRAM_LOGPROBS);
const LETTERS = Float64Array.from(ENGLISH_FREQUENCIES, Math.log10);

// Starts of the search per pair of letter sets: the sets as given, then random
// orders of their letters.
const STARTS = 4;
// A key at least this good in average quadgram log10 probability is close
// enough to English to be searched again from its turned forms.
const NEARLY_READABLE_QUADGRAM = -5;

/** The keyword letters to start from. An empty list stands for the unmixed alphabet. */
export interface KeywordLetters {
  /** Letters of the plaintext alphabet's keyword. */
  plain: number[];
  /** Letters of the ciphertext alphabet's keyword. */
  cipher: number[];
  /** True when one keyword mixes both alphabets (Quagmire III); `plain` and `cipher` then hold the same letters. */
  shared: boolean;
}

export interface QuagmireKey {
  /** The plaintext alphabet: its keyword, then the remaining letters in order. */
  plainAlphabet: number[];
  cipherAlphabet: number[];
  offsets: number[];
}

const NO_KEYWORD: number[] = [];

/**
 * The plaintext letter values of `cipher` under two alphabets and column
 * offsets: plain = plainAlphabet[(position of the cipher letter in
 * cipherAlphabet - offset) mod 26].
 */
export function decryptWithAlphabets(
  cipher: ArrayLike<number>,
  plainAlphabet: number[],
  cipherAlphabet: number[],
  offsets: number[],
): number[] {
  const index = new Array<number>(ALPHABET_SIZE);
  cipherAlphabet.forEach((letter, i) => {
    index[letter] = i;
  });
  return Array.from(
    cipher,
    (c, i) =>
      plainAlphabet[
        (index[c] - offsets[i % offsets.length] + ALPHABET_SIZE) % ALPHABET_SIZE
      ],
  );
}

/**
 * Completes keyword letter sets into a full key by local search: change one
 * column's shift, swap two letters of a keyword, or replace a keyword letter
 * by one from outside it. The replacement repairs a set that is one or two
 * letters off, so the sets need not be exact. The search runs on unigram plus
 * bigram score from several starts, which finds the right region, and the best
 * start is finished on quadgram score, which settles letters that pair up
 * plausibly either way (I for O).
 */
export function completeKey(
  cipher: number[],
  period: number,
  letters: KeywordLetters,
  startShifts: number[],
  table: Uint8Array,
  rng: () => number,
): QuagmireKey {
  const length = cipher.length;
  const plain = new Array<number>(length).fill(0);
  // The keywords being searched: one when it is shared or the other alphabet
  // is unmixed, else two. `plainKeyword` and `cipherKeyword` say which of
  // them mixes each alphabet (-1 for an unmixed alphabet).
  let keywords: number[][] = [];
  let plainKeyword = -1;
  let cipherKeyword = -1;
  const reset = (): void => {
    keywords = [];
    plainKeyword = -1;
    cipherKeyword = -1;
    if (letters.plain.length > 0) {
      plainKeyword = keywords.push([...letters.plain]) - 1;
    }
    if (letters.shared) {
      cipherKeyword = plainKeyword;
    } else if (letters.cipher.length > 0) {
      cipherKeyword = keywords.push([...letters.cipher]) - 1;
    }
  };
  reset();
  let shifts = [...startShifts];
  const plainAlphabet = new Array<number>(ALPHABET_SIZE);
  const cipherAlphabet = letters.shared
    ? plainAlphabet
    : new Array<number>(ALPHABET_SIZE);
  const cipherIndex = new Array<number>(ALPHABET_SIZE);
  const used = new Uint8Array(ALPHABET_SIZE);

  /** Writes the alphabet that `keyword` builds into `alphabet`. */
  const fill = (keyword: number[], alphabet: number[]): void => {
    used.fill(0);
    let next = 0;
    for (const letter of keyword) {
      alphabet[next] = letter;
      used[letter] = 1;
      next += 1;
    }
    for (let letter = 0; letter < ALPHABET_SIZE; letter += 1) {
      if (!used[letter]) {
        alphabet[next] = letter;
        next += 1;
      }
    }
  };
  const build = (): void => {
    fill(plainKeyword < 0 ? NO_KEYWORD : keywords[plainKeyword], plainAlphabet);
    if (!letters.shared) {
      fill(
        cipherKeyword < 0 ? NO_KEYWORD : keywords[cipherKeyword],
        cipherAlphabet,
      );
    }
    for (let i = 0; i < ALPHABET_SIZE; i += 1) {
      cipherIndex[cipherAlphabet[i]] = i;
    }
  };
  const decipher = (): void => {
    for (let i = 0; i < length; i += 1) {
      plain[i] =
        plainAlphabet[
          (cipherIndex[cipher[i]] - shifts[i % period] + ALPHABET_SIZE) %
            ALPHABET_SIZE
        ];
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
      for (const keyword of keywords) {
        const size = keyword.length;
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
    }
    return current;
  };

  let best = {
    score: -Infinity,
    keywords: keywords.map((keyword) => [...keyword]),
    shifts: [...shifts],
  };
  for (let start = 0; start < STARTS; start += 1) {
    reset();
    shifts = [...startShifts];
    if (start > 0) {
      for (const keyword of keywords) {
        for (let i = keyword.length - 1; i > 0; i -= 1) {
          const j = Math.floor(rng() * (i + 1));
          [keyword[i], keyword[j]] = [keyword[j], keyword[i]];
        }
      }
    }
    const reached = climb(bigramScore);
    if (reached > best.score) {
      best = {
        score: reached,
        keywords: keywords.map((keyword) => [...keyword]),
        shifts: [...shifts],
      };
    }
  }
  keywords = best.keywords;
  shifts = best.shifts;
  let reached = climb(quadgramScore);

  // Turning a whole alphabet one place, with every shift turned to match, is
  // the same key. It reads as another keyword, though: XYUGOSLIV followed by
  // A is YUGOSLIVA with X sent to the tail, and only the second form can
  // reach YUGOSLAVI by swapping two keyword letters. A key that is close to
  // English is therefore also searched from the turned forms of each keyword.
  const turn = (which: number, places: 1 | -1): void => {
    const keyword = keywords[which];
    const size = keyword.length;
    const tail = (
      which === plainKeyword ? plainAlphabet : cipherAlphabet
    ).slice(size);
    keywords[which] =
      places === 1
        ? [...keyword.slice(1), Math.min(keyword[0], tail[0])]
        : [
            Math.max(keyword[size - 1], tail[tail.length - 1]),
            ...keyword.slice(0, size - 1),
          ];
    // Turning the plaintext alphabet needs every shift turned the same way,
    // the ciphertext alphabet the other way; a shared keyword needs neither.
    const shiftTurn =
      (which === plainKeyword ? places : 0) -
      (which === cipherKeyword ? places : 0);
    shifts = shifts.map(
      (shift) => (shift + shiftTurn + ALPHABET_SIZE) % ALPHABET_SIZE,
    );
  };
  if (averageLog10(reached, length - 3) >= NEARLY_READABLE_QUADGRAM) {
    let improved = true;
    while (improved) {
      improved = false;
      for (let which = 0; which < keywords.length; which += 1) {
        for (const places of [1, -1] as const) {
          const before = {
            keywords: keywords.map((keyword) => [...keyword]),
            shifts: [...shifts],
          };
          turn(which, places);
          const turned = climb(quadgramScore);
          if (turned > reached) {
            reached = turned;
            improved = true;
          } else {
            keywords = before.keywords;
            shifts = before.shifts;
            build();
          }
        }
      }
    }
  }
  return {
    plainAlphabet: [...plainAlphabet],
    cipherAlphabet: [...cipherAlphabet],
    offsets: shifts,
  };
}
