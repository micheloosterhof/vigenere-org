// ABOUTME: Finds the column shifts of a Quagmire text under a given alphabet by dynamic programming on bigram score.
// ABOUTME: Neighbouring letters sit in neighbouring columns, so the columns form a ring that a Viterbi pass solves exactly.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { ENGLISH_BIGRAM_LOGPROBS } from "./data/english-bigrams";

const ALPHABET_SIZE = 26;
const PAIRS = ALPHABET_SIZE * ALPHABET_SIZE;
const BIGRAMS = Float64Array.from(ENGLISH_BIGRAM_LOGPROBS);

// Scratch space reused across calls: a dictionary scan makes hundreds of
// thousands of them.
const LINK = new Float64Array(PAIRS);
let reach = new Float64Array(ALPHABET_SIZE);
let reachNext = new Float64Array(ALPHABET_SIZE);

/**
 * Every decryption of every letter: entry `i * 26 + shift` is the plaintext
 * letter at position i when its column's shift is `shift`, for a cipher that
 * decrypts as plain = output[(input[cipher] - shift) mod 26].
 */
export function shiftTable(
  cipher: ArrayLike<number>,
  input: ArrayLike<number>,
  output: ArrayLike<number>,
): Uint8Array {
  const table = new Uint8Array(cipher.length * ALPHABET_SIZE);
  for (let i = 0; i < cipher.length; i += 1) {
    const position = input[cipher[i]];
    for (let shift = 0; shift < ALPHABET_SIZE; shift += 1) {
      table[i * ALPHABET_SIZE + shift] =
        output[(position - shift + ALPHABET_SIZE) % ALPHABET_SIZE];
    }
  }
  return table;
}

/**
 * Fills `link[a * 26 + b]` with the summed bigram score of each letter in
 * `column` under shift a followed by its right-hand neighbour under shift b.
 */
function linkScores(
  table: Uint8Array,
  length: number,
  period: number,
  column: number,
  link: Float64Array,
): void {
  link.fill(0);
  for (let i = column; i + 1 < length; i += period) {
    const here = i * ALPHABET_SIZE;
    const next = here + ALPHABET_SIZE;
    for (let a = 0; a < ALPHABET_SIZE; a += 1) {
      const first = table[here + a] * ALPHABET_SIZE;
      const row = a * ALPHABET_SIZE;
      for (let b = 0; b < ALPHABET_SIZE; b += 1) {
        link[row + b] += BIGRAMS[first + table[next + b]];
      }
    }
  }
}

/**
 * The best summed bigram score over all shifts when the links from the last
 * column back to the first are left out. That opens the ring into a chain,
 * which one Viterbi pass solves: 26 times cheaper than `ringShifts`, and close
 * enough to rank alphabets.
 */
export function chainScore(
  table: Uint8Array,
  length: number,
  period: number,
): number {
  if (period === 1) {
    return ringShifts(table, length, 1).score;
  }
  reach.fill(0);
  for (let column = 0; column + 1 < period; column += 1) {
    linkScores(table, length, period, column, LINK);
    for (let b = 0; b < ALPHABET_SIZE; b += 1) {
      let best = -Infinity;
      for (let a = 0; a < ALPHABET_SIZE; a += 1) {
        const score = reach[a] + LINK[a * ALPHABET_SIZE + b];
        if (score > best) {
          best = score;
        }
      }
      reachNext[b] = best;
    }
    [reach, reachNext] = [reachNext, reach];
  }
  let best = -Infinity;
  for (let a = 0; a < ALPHABET_SIZE; a += 1) {
    if (reach[a] > best) {
      best = reach[a];
    }
  }
  return best;
}

/**
 * The shifts with the best summed bigram score over every adjacent pair of
 * letters, found exactly: for each shift of the first column, a Viterbi pass
 * round the ring of columns.
 */
export function ringShifts(
  table: Uint8Array,
  length: number,
  period: number,
): { score: number; shifts: number[] } {
  const links: Float64Array[] = [];
  for (let column = 0; column < period; column += 1) {
    const link = new Float64Array(PAIRS);
    linkScores(table, length, period, column, link);
    links.push(link);
  }
  if (period === 1) {
    let best = -Infinity;
    let bestShift = 0;
    for (let a = 0; a < ALPHABET_SIZE; a += 1) {
      const score = links[0][a * ALPHABET_SIZE + a];
      if (score > best) {
        best = score;
        bestShift = a;
      }
    }
    return { score: best, shifts: [bestShift] };
  }

  let best = -Infinity;
  let bestShifts: number[] = [];
  // from[column * 26 + b]: the previous column's shift on the best path that
  // puts `column` at shift b, for the first-column shift being tried.
  const from = new Uint8Array(period * ALPHABET_SIZE);
  const last = period - 1;
  for (let first = 0; first < ALPHABET_SIZE; first += 1) {
    for (let b = 0; b < ALPHABET_SIZE; b += 1) {
      reach[b] = links[0][first * ALPHABET_SIZE + b];
    }
    for (let column = 1; column < last; column += 1) {
      const link = links[column];
      for (let b = 0; b < ALPHABET_SIZE; b += 1) {
        let bestScore = -Infinity;
        let bestFrom = 0;
        for (let a = 0; a < ALPHABET_SIZE; a += 1) {
          const score = reach[a] + link[a * ALPHABET_SIZE + b];
          if (score > bestScore) {
            bestScore = score;
            bestFrom = a;
          }
        }
        reachNext[b] = bestScore;
        from[(column + 1) * ALPHABET_SIZE + b] = bestFrom;
      }
      [reach, reachNext] = [reachNext, reach];
    }
    for (let a = 0; a < ALPHABET_SIZE; a += 1) {
      const score = reach[a] + links[last][a * ALPHABET_SIZE + first];
      if (score > best) {
        best = score;
        const shifts = new Array<number>(period);
        shifts[0] = first;
        shifts[last] = a;
        for (let column = last; column > 1; column -= 1) {
          shifts[column - 1] = from[column * ALPHABET_SIZE + shifts[column]];
        }
        bestShifts = shifts;
      }
    }
  }
  return { score: best, shifts: bestShifts };
}
