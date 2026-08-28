// ABOUTME: Breaks the ciphertext autokey cipher, where the key is a primer followed by the ciphertext.
// ABOUTME: The difference of letters a primer-length apart is the plaintext, so only the short primer head needs reconstructing.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import {
  QUADGRAM_LOG10_SCALE,
  QUADGRAM_MIN_LOG10,
  QUADGRAM_TABLE_SIZE,
} from "./data/english-quadgrams-meta";
import { toLetterValues } from "./solve";

const ALPHABET_SIZE = 26;
const CODE_A = 65;
const MAX_PRIMER = 20;
const PLAINTEXT_RESTARTS = 6;

export interface AutokeyResult {
  /** Recovered primer length (the lag that made the difference read as English). */
  primerLength: number;
  /** "vigenere" when the plaintext is the difference, "beaufort" when it is the reverse difference. */
  variant: "vigenere" | "beaufort";
  plaintext: string;
  /** Average quadgram log10 probability of the recovered plaintext. */
  fitness: number;
}

function mod(value: number): number {
  return ((value % ALPHABET_SIZE) + ALPHABET_SIZE) % ALPHABET_SIZE;
}

interface Options {
  rng?: () => number;
}

/** Average quantized quadgram score of a run of letter values. */
function meanQuadgram(values: number[], table: Uint8Array): number {
  if (values.length < 4) {
    return 0;
  }
  let sum = 0;
  let index = 0;
  for (let i = 0; i < values.length; i += 1) {
    index = (index * ALPHABET_SIZE + values[i]) % QUADGRAM_TABLE_SIZE;
    if (i >= 3) {
      sum += table[index];
    }
  }
  return sum / (values.length - 3);
}

/** Sum of the quadgram scores of every 4-gram covering position `at`. */
function coveringScore(plain: number[], at: number, table: Uint8Array): number {
  let score = 0;
  for (
    let start = Math.max(0, at - 3);
    start <= at && start + 4 <= plain.length;
    start += 1
  ) {
    const index =
      ((plain[start] * ALPHABET_SIZE + plain[start + 1]) * ALPHABET_SIZE +
        plain[start + 2]) *
        ALPHABET_SIZE +
      plain[start + 3];
    score += table[index];
  }
  return score;
}

/** Recovers the head letters by coordinate ascent: each is set to fit the quadgrams around it. */
function recoverHead(
  plain: number[],
  headLength: number,
  table: Uint8Array,
): void {
  for (let i = 0; i < headLength; i += 1) {
    plain[i] = 0;
  }
  for (let pass = 0; pass < 4; pass += 1) {
    for (let i = headLength - 1; i >= 0; i -= 1) {
      let bestLetter = 0;
      let bestScore = -Infinity;
      for (let letter = 0; letter < ALPHABET_SIZE; letter += 1) {
        plain[i] = letter;
        const score = coveringScore(plain, i, table);
        if (score > bestScore) {
          bestScore = score;
          bestLetter = letter;
        }
      }
      plain[i] = bestLetter;
    }
  }
}

/**
 * Recovers the plaintext of a ciphertext autokey cipher without the primer. For
 * each candidate primer length the tail is the difference (or reverse
 * difference) of letters that far apart, which reads as English at the true
 * length; the best-scoring length wins and the short head is filled in from
 * context. The table is the quantized quadgram data at QUADGRAM_TABLE_URL.
 */
export function breakCiphertextAutokey(
  text: string,
  table: Uint8Array,
): AutokeyResult {
  const cipher = toLetterValues(text);
  if (cipher.length < ALPHABET_SIZE) {
    throw new Error("text must contain at least 26 letters");
  }
  const longest = Math.max(
    1,
    Math.min(MAX_PRIMER, Math.floor(cipher.length / 4)),
  );

  let best: {
    length: number;
    variant: "vigenere" | "beaufort";
    score: number;
  } = {
    length: 1,
    variant: "vigenere",
    score: -Infinity,
  };
  for (let length = 1; length <= longest; length += 1) {
    for (const variant of ["vigenere", "beaufort"] as const) {
      const tail: number[] = [];
      for (let i = length; i < cipher.length; i += 1) {
        tail.push(
          variant === "vigenere"
            ? mod(cipher[i] - cipher[i - length])
            : mod(cipher[i - length] - cipher[i]),
        );
      }
      const score = meanQuadgram(tail, table);
      if (score > best.score) {
        best = { length, variant, score };
      }
    }
  }

  // The recovered plaintext letters: the tail from the difference, and the head
  // chosen letter by letter (right to left) to read as English into the tail.
  const plain = new Array<number>(cipher.length);
  for (let i = best.length; i < cipher.length; i += 1) {
    plain[i] =
      best.variant === "vigenere"
        ? mod(cipher[i] - cipher[i - best.length])
        : mod(cipher[i - best.length] - cipher[i]);
  }
  recoverHead(plain, best.length, table);

  return {
    primerLength: best.length,
    variant: best.variant,
    plaintext: reinsert(text, plain),
    fitness:
      QUADGRAM_MIN_LOG10 + meanQuadgram(plain, table) * QUADGRAM_LOG10_SCALE,
  };
}

/** Reinserts recovered plaintext letters into the original text, keeping case and punctuation. */
function reinsert(text: string, plain: number[]): string {
  let position = 0;
  return [...text]
    .map((char) => {
      const upper = char.toUpperCase();
      if (upper < "A" || upper > "Z") {
        return char;
      }
      const output = String.fromCharCode(CODE_A + plain[position]);
      position += 1;
      return char === upper ? output : output.toLowerCase();
    })
    .join("");
}

/**
 * Breaks the plaintext autokey cipher, where the key is a primer followed by the
 * plaintext. Decryption splits into `primerLength` independent chains, each fixed
 * by one primer letter, so the search is over 26 choices per chain rather than a
 * full alphabet. Coordinate descent on the primer, over every candidate primer
 * length, recovers the whole plaintext exactly. Table is the quantized quadgram data.
 */
export function breakPlaintextAutokey(
  text: string,
  table: Uint8Array,
  options: Options = {},
): AutokeyResult {
  const cipher = toLetterValues(text);
  if (cipher.length < ALPHABET_SIZE) {
    throw new Error("text must contain at least 26 letters");
  }
  const rng = options.rng ?? Math.random;
  const longest = Math.max(
    1,
    Math.min(MAX_PRIMER, Math.floor(cipher.length / 4)),
  );

  let bestPlain: number[] = [];
  let bestLength = 1;
  let bestScore = -Infinity;

  for (let length = 1; length <= longest; length += 1) {
    // candidate[position][primerLetter] = the plaintext letter that primer value
    // produces at that position, walking the chain it belongs to.
    const candidate = Array.from(
      { length: cipher.length },
      () => new Array<number>(ALPHABET_SIZE),
    );
    for (let chain = 0; chain < length; chain += 1) {
      for (let g = 0; g < ALPHABET_SIZE; g += 1) {
        let previous = mod(cipher[chain] - g);
        candidate[chain][g] = previous;
        for (let pos = chain + length; pos < cipher.length; pos += length) {
          previous = mod(cipher[pos] - previous);
          candidate[pos][g] = previous;
        }
      }
    }

    const plain = new Array<number>(cipher.length);
    const assemble = (primer: number[]): number => {
      for (let i = 0; i < cipher.length; i += 1) {
        plain[i] = candidate[i][primer[i % length]];
      }
      return meanQuadgram(plain, table);
    };

    for (let restart = 0; restart < PLAINTEXT_RESTARTS; restart += 1) {
      const primer = Array.from({ length }, () =>
        restart === 0 ? 0 : Math.floor(rng() * ALPHABET_SIZE),
      );
      let score = assemble(primer);
      let improved = true;
      while (improved) {
        improved = false;
        for (let chain = 0; chain < length; chain += 1) {
          let bestG = primer[chain];
          let bestChainScore = score;
          for (let g = 0; g < ALPHABET_SIZE; g += 1) {
            primer[chain] = g;
            const trial = assemble(primer);
            if (trial > bestChainScore) {
              bestChainScore = trial;
              bestG = g;
            }
          }
          primer[chain] = bestG;
          if (bestChainScore > score) {
            score = bestChainScore;
            improved = true;
          }
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestLength = length;
        assemble(primer);
        bestPlain = [...plain];
      }
    }
  }

  return {
    primerLength: bestLength,
    variant: "vigenere",
    plaintext: reinsert(text, bestPlain),
    fitness: QUADGRAM_MIN_LOG10 + bestScore * QUADGRAM_LOG10_SCALE,
  };
}
