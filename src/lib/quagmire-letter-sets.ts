// ABOUTME: Scores which letters form the keyword of a Quagmire I-III alphabet, without knowing their order.
// ABOUTME: The letters outside the keyword follow it in A-Z order, so the letter set alone places them; each column then takes its best shift.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { ENGLISH_BIGRAM_LOGPROBS } from "./data/english-bigrams";
import { ENGLISH_FREQUENCIES } from "./diagnostics";

const ALPHABET_SIZE = 26;
const PAIRS = ALPHABET_SIZE * ALPHABET_SIZE;

export type KeywordVariant = 1 | 2 | 3;

/**
 * How much more often two letters stand next to each other in English than
 * their separate frequencies predict, as a log10 ratio indexed first*26+second.
 */
const ASSOCIATION = (() => {
  const joint = Float64Array.from(ENGLISH_BIGRAM_LOGPROBS, (x) => 10 ** x);
  const total = joint.reduce((sum, x) => sum + x, 0);
  const first = new Float64Array(ALPHABET_SIZE);
  const second = new Float64Array(ALPHABET_SIZE);
  for (let a = 0; a < ALPHABET_SIZE; a += 1) {
    for (let b = 0; b < ALPHABET_SIZE; b += 1) {
      first[a] += joint[a * ALPHABET_SIZE + b] / total;
      second[b] += joint[a * ALPHABET_SIZE + b] / total;
    }
  }
  return Float64Array.from(joint, (x, i) =>
    Math.log10(
      x / total / (first[Math.floor(i / ALPHABET_SIZE)] * second[i % 26]),
    ),
  );
})();

/**
 * For every column, the likelihood that cipher letter c stands for plain
 * letter L, indexed c*26+L, as a log10 value and as a plain probability. A
 * column of N letters should hold N*f(L) of the letter standing for L, so the
 * count seen is scored as a Poisson draw around that; a letter that is absent
 * where English expects many costs as much as one that is too frequent.
 */
function cellLikelihoods(
  cipher: ArrayLike<number>,
  period: number,
): { log: Float64Array[]; plain: Float64Array[] } {
  const counts = Array.from(
    { length: period },
    () => new Int32Array(ALPHABET_SIZE),
  );
  for (let i = 0; i < cipher.length; i += 1) {
    counts[i % period][cipher[i]] += 1;
  }
  const log = counts.map((column) => {
    const size = column.reduce((sum, count) => sum + count, 0);
    const cells = new Float64Array(PAIRS);
    for (let c = 0; c < ALPHABET_SIZE; c += 1) {
      for (let letter = 0; letter < ALPHABET_SIZE; letter += 1) {
        const frequency = ENGLISH_FREQUENCIES[letter];
        cells[c * ALPHABET_SIZE + letter] =
          column[c] * Math.log10(frequency) - size * frequency * Math.LOG10E;
      }
    }
    return cells;
  });
  return {
    log,
    plain: log.map((cells) => Float64Array.from(cells, (x) => 10 ** x)),
  };
}

export interface LetterSetScorer {
  /**
   * Log10 likelihood of the ciphertext if the keyword consists of `letters`
   * (ascending letter values), with every column at its best shift. Higher is
   * better; scores of sets of different sizes are comparable.
   */
  score(letters: ArrayLike<number>): number;
  /** The best shift per column for the set scored last. */
  readonly shifts: number[];
}

/**
 * Prepares a scorer of keyword letter sets for one ciphertext, variant, and
 * period. The alphabet is the keyword followed by the remaining letters in
 * order, so a set fixes the position of every letter outside it. Those letters
 * are scored cell by cell; a keyword letter sits somewhere in the keyword's
 * positions, so its cells are averaged over them. Without that average, sets
 * that swallow the busiest cipher letters would win. The letters the set
 * deciphers on its own also add how well they pair with their neighbours.
 */
export function letterSetScorer(
  cipher: ArrayLike<number>,
  variant: KeywordVariant,
  period: number,
): LetterSetScorer {
  const length = cipher.length;
  const { log, plain } = cellLikelihoods(cipher, period);
  const shifts = new Array<number>(period).fill(0);
  // The letters outside the keyword in order, and each letter's alphabet
  // position (-1 for a keyword letter, whose position is unknown).
  const rest = new Int8Array(ALPHABET_SIZE);
  const position = new Int8Array(ALPHABET_SIZE);
  // Per cipher letter: its likelihood averaged over the keyword's plain letters.
  const keywordPlain = new Float64Array(ALPHABET_SIZE);
  const keywordPlainLog = new Float64Array(ALPHABET_SIZE);
  const ring = new Float64Array(ALPHABET_SIZE);
  // window[shift * size + y]: likelihood of keyword cipher letter y averaged
  // over the keyword's positions at that shift.
  const window = new Float64Array(PAIRS);
  const deciphered = new Int8Array(length);

  const score = (letters: ArrayLike<number>): number => {
    const size = letters.length;
    const restSize = ALPHABET_SIZE - size;
    position.fill(-1);
    for (let letter = 0, inSet = 0, outside = 0; letter < 26; letter += 1) {
      if (inSet < size && letters[inSet] === letter) {
        inSet += 1;
      } else {
        position[letter] = size + outside;
        rest[outside] = letter;
        outside += 1;
      }
    }

    let total = 0;
    for (let column = 0; column < period; column += 1) {
      const logCells = log[column];
      const cells = plain[column];
      if (variant !== 2) {
        for (let c = 0; c < ALPHABET_SIZE; c += 1) {
          let sum = 0;
          for (let y = 0; y < size; y += 1) {
            sum += cells[c * ALPHABET_SIZE + letters[y]];
          }
          keywordPlain[c] = sum / size;
          keywordPlainLog[c] = Math.log10(sum / size);
        }
      }
      if (variant !== 1) {
        for (let y = 0; y < size; y += 1) {
          const row = letters[y] * ALPHABET_SIZE;
          // ring[q]: this keyword cipher letter's likelihood if it deciphers
          // through alphabet position q.
          for (let q = 0; q < ALPHABET_SIZE; q += 1) {
            ring[q] =
              variant === 2
                ? cells[row + q]
                : q >= size
                  ? cells[row + rest[q - size]]
                  : keywordPlain[letters[y]];
          }
          // The keyword's positions 0..size-1 decipher through positions
          // -shift..size-1-shift: a window that slides round the ring.
          let sum = 0;
          for (let q = 0; q < size; q += 1) {
            sum += ring[q];
          }
          for (let shift = 0; shift < ALPHABET_SIZE; shift += 1) {
            window[shift * size + y] = sum / size;
            const entering = (2 * ALPHABET_SIZE - shift - 1) % ALPHABET_SIZE;
            const leaving =
              (2 * ALPHABET_SIZE + size - 1 - shift) % ALPHABET_SIZE;
            sum = Math.max(0, sum + ring[entering] - ring[leaving]);
          }
        }
      }

      let best = -Infinity;
      let bestShift = 0;
      for (let shift = 0; shift < ALPHABET_SIZE; shift += 1) {
        let sum = 0;
        if (variant === 1) {
          for (let c = 0; c < ALPHABET_SIZE; c += 1) {
            const q = (c - shift + ALPHABET_SIZE) % ALPHABET_SIZE;
            sum +=
              q >= size
                ? logCells[c * ALPHABET_SIZE + rest[q - size]]
                : keywordPlainLog[c];
          }
        } else {
          for (let i = 0; i < restSize; i += 1) {
            const q = (size + i - shift + ALPHABET_SIZE) % ALPHABET_SIZE;
            const row = rest[i] * ALPHABET_SIZE;
            sum +=
              variant === 2
                ? logCells[row + q]
                : q >= size
                  ? logCells[row + rest[q - size]]
                  : keywordPlainLog[rest[i]];
          }
          // The product of the keyword letters' averages, kept clear of
          // underflow.
          let product = 1;
          const offset = shift * size;
          for (let y = 0; y < size; y += 1) {
            product *= window[offset + y];
            if (product < 1e-200) {
              sum += Math.log10(product);
              product = 1;
            }
          }
          sum += Math.log10(product);
        }
        if (sum > best) {
          best = sum;
          bestShift = shift;
        }
      }
      total += best;
      shifts[column] = bestShift;
    }

    // Letters the ordered tail deciphers without the keyword's order.
    for (let i = 0; i < length; i += 1) {
      const from = variant === 1 ? cipher[i] : position[cipher[i]];
      if (from < 0) {
        deciphered[i] = -1;
        continue;
      }
      const q = (from - shifts[i % period] + ALPHABET_SIZE) % ALPHABET_SIZE;
      deciphered[i] = variant === 2 ? q : q >= size ? rest[q - size] : -1;
    }
    for (let i = 1; i < length; i += 1) {
      if (deciphered[i] >= 0 && deciphered[i - 1] >= 0) {
        total += ASSOCIATION[deciphered[i - 1] * ALPHABET_SIZE + deciphered[i]];
      }
    }
    return total;
  };
  return { score, shifts };
}

export interface ScoredLetterSet {
  letters: number[];
  score: number;
}

/** The number of ways to choose `size` of the 26 letters. */
export function letterSetCount(size: number): number {
  let count = 1;
  for (let i = 1; i <= size; i += 1) {
    count = (count * (ALPHABET_SIZE - size + i)) / i;
  }
  return Math.round(count);
}

/**
 * Scores keyword letter sets of one size and returns the `keep` best, best
 * first. Every set is scored when `sample` is 1; otherwise each is scored with
 * that probability. A sample is enough because sets one letter away from the
 * true one score nearly as well and are repaired afterwards.
 */
export function bestLetterSets(
  scorer: LetterSetScorer,
  size: number,
  keep: number,
  sample: number,
  rng: () => number,
): ScoredLetterSet[] {
  const letters = Array.from({ length: size }, (_, i) => i);
  let top: ScoredLetterSet[] = [];
  let floor = -Infinity;
  const trim = (): void => {
    top.sort((a, b) => b.score - a.score);
    if (top.length > keep) {
      top = top.slice(0, keep);
      floor = top[keep - 1].score;
    }
  };
  for (;;) {
    if (sample >= 1 || rng() < sample) {
      const score = scorer.score(letters);
      if (score > floor) {
        top.push({ letters: [...letters], score });
        if (top.length >= 2 * keep) {
          trim();
        }
      }
    }
    // Step to the next combination in lexicographic order.
    let i = size - 1;
    while (i >= 0 && letters[i] === ALPHABET_SIZE - size + i) {
      i -= 1;
    }
    if (i < 0) {
      break;
    }
    letters[i] += 1;
    for (let j = i + 1; j < size; j += 1) {
      letters[j] = letters[j - 1] + 1;
    }
  }
  trim();
  return top;
}
