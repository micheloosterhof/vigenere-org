// ABOUTME: Breaks double transposition by simulated annealing over both column orders at given key lengths.
// ABOUTME: Decryption is an index permutation, so each step only rearranges and rescores the text.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import {
  QUADGRAM_LOG10_SCALE,
  QUADGRAM_MIN_LOG10,
} from "./data/english-quadgrams-meta";
import {
  anneal,
  averageLog10,
  quadgramRaw,
  randomPermutation,
  type AnnealProblem,
} from "./anneal";

const CODE_A = 65;
const ALPHABET_SIZE = 26;

/** Column orders (rank → column) for the first and second keys. */
export interface DoubleKey {
  first: number[];
  second: number[];
}

/**
 * src[i] is the ciphertext index that plaintext index i comes from, for a
 * columnar transposition of `n` characters with the given column order
 * (irregular: the last row may be short).
 */
export function columnarSource(
  n: number,
  order: number[],
  into: Int32Array = new Int32Array(n),
): Int32Array {
  const columns = order.length;
  const base = Math.floor(n / columns);
  const extra = n % columns;
  const start = new Int32Array(columns);
  let offset = 0;
  for (const column of order) {
    start[column] = offset;
    offset += base + (column < extra ? 1 : 0);
  }
  for (let i = 0; i < n; i += 1) {
    into[i] = start[i % columns] + Math.floor(i / columns);
  }
  return into;
}

/** The canonical keyword (A, B, C ranks) that reproduces a column order. */
export function orderToKeyword(order: number[]): string {
  const letters = new Array<string>(order.length);
  order.forEach((column, rank) => {
    letters[column] = String.fromCharCode(CODE_A + rank);
  });
  return letters.join("");
}

function mutate(order: number[], rng: () => number): number[] {
  const copy = [...order];
  const n = copy.length;
  const i = Math.floor(rng() * n);
  let j = Math.floor(rng() * (n - 1));
  if (j >= i) {
    j += 1;
  }
  const roll = rng();
  if (roll < 0.6) {
    [copy[i], copy[j]] = [copy[j], copy[i]];
  } else if (roll < 0.8) {
    // Move one column to another place in the order.
    const [moved] = copy.splice(i, 1);
    copy.splice(j, 0, moved);
  } else {
    // Reverse a stretch of the order.
    const [a, b] = i < j ? [i, j] : [j, i];
    copy.splice(a, b - a + 1, ...copy.slice(a, b + 1).reverse());
  }
  return copy;
}

export function doubleProblem(
  text: string,
  firstLength: number,
  secondLength: number,
  table: Uint8Array,
): AnnealProblem<DoubleKey> & { decryptKey(key: DoubleKey): string } {
  const chars = [...text];
  const n = chars.length;
  const values = Uint8Array.from(chars, (char) => {
    const code = char.toUpperCase().charCodeAt(0) - CODE_A;
    return code >= 0 && code < ALPHABET_SIZE ? code : ALPHABET_SIZE;
  });
  const plain = new Uint8Array(n);
  const src1 = new Int32Array(n);
  const src2 = new Int32Array(n);
  const composed = new Int32Array(n);
  /** Plaintext index → ciphertext index; reuses one buffer, so copy before keeping. */
  const indices = (key: DoubleKey): Int32Array => {
    columnarSource(n, key.second, src2);
    columnarSource(n, key.first, src1);
    for (let i = 0; i < n; i += 1) {
      composed[i] = src2[src1[i]];
    }
    return composed;
  };
  return {
    random: (rng) => ({
      first: randomPermutation(firstLength, rng),
      second: randomPermutation(secondLength, rng),
    }),
    neighbour: (key, rng) =>
      rng() < firstLength / (firstLength + secondLength)
        ? { first: mutate(key.first, rng), second: key.second }
        : { first: key.first, second: mutate(key.second, rng) },
    score(key) {
      const src = indices(key);
      for (let i = 0; i < n; i += 1) {
        plain[i] = values[src[i]];
      }
      return quadgramRaw(plain, n, table);
    },
    decryptKey(key) {
      const src = indices(key);
      return Array.from(src, (i) => chars[i]).join("");
    },
  };
}

export interface DoubleCandidate {
  firstLength: number;
  secondLength: number;
  /** Canonical keywords (A, B, C ranks) that decrypt with doubleTransposition(). */
  firstKey: string;
  secondKey: string;
  /** Average quadgram log10 probability of the decryption; higher is more English-like. */
  fitness: number;
  plaintext: string;
  /** True once the decryption reads as English, which ends the search. */
  english: boolean;
}

export interface DoubleRunOptions {
  rng: () => number;
  iterations?: number;
  /** Starting temperature per letter, in raw quadgram units. */
  temperatureFactor?: number;
  onProgress?: (fraction: number) => void;
}

/** Annealing settings chosen by benchmark; longer keys need more restarts. */
export const DOUBLE_SETTINGS = { iterations: 300000, restarts: 12 };

// Correct decryptions score about -4.3 in average quadgram log10.
const ENGLISH_FITNESS = -4.7;

// Shorter text lets the search overfit random letters toward ENGLISH_FITNESS.
const MIN_LETTERS = 100;

/** The column order with every column index shifted cyclically by `shift`. */
function rotateColumns(order: number[], shift: number): number[] {
  return order.map((column) => (column + shift) % order.length);
}

/**
 * Shifting a key's columns cyclically rotates the decryption, which scores
 * almost as well as the true one (only the few quadgrams at the seam differ),
 * so annealing can stop on a rotation: "SABRIGHT…WALLATIW". Trying every pair
 * of rotations puts the plaintext's true start and end back.
 */
function bestRotation(
  problem: AnnealProblem<DoubleKey>,
  key: DoubleKey,
): { key: DoubleKey; score: number } {
  let best = { key, score: problem.score(key) };
  for (let a = 0; a < key.first.length; a += 1) {
    for (let b = 0; b < key.second.length; b += 1) {
      if (a === 0 && b === 0) {
        continue;
      }
      const candidate = {
        first: rotateColumns(key.first, a),
        second: rotateColumns(key.second, b),
      };
      const score = problem.score(candidate);
      if (score > best.score) {
        best = { key: candidate, score };
      }
    }
  }
  return best;
}

/** One annealing run over both column orders at the given key lengths. */
export function annealDouble(
  text: string,
  firstLength: number,
  secondLength: number,
  table: Uint8Array,
  options: DoubleRunOptions,
): DoubleCandidate {
  for (const length of [firstLength, secondLength]) {
    if (!Number.isInteger(length) || length < 2 || length > 20) {
      throw new Error("key lengths must be whole numbers from 2 to 20");
    }
  }
  const letters = [...text].filter((c) => /[a-z]/i.test(c)).length;
  if (letters < MIN_LETTERS) {
    throw new Error(
      `text must contain at least ${MIN_LETTERS} letters (it has ${letters}); about 200 are needed for a reliable solve`,
    );
  }
  const quadgrams = letters - 3;
  const target =
    ((ENGLISH_FITNESS - QUADGRAM_MIN_LOG10) / QUADGRAM_LOG10_SCALE) * quadgrams;
  const problem = doubleProblem(text, firstLength, secondLength, table);
  const annealed = anneal(problem, {
    rng: options.rng,
    iterations: options.iterations ?? DOUBLE_SETTINGS.iterations,
    temperature: letters * (options.temperatureFactor ?? 2),
    target,
    onProgress: options.onProgress,
  });
  const result = bestRotation(problem, annealed.key);
  return {
    firstLength,
    secondLength,
    firstKey: orderToKeyword(result.key.first),
    secondKey: orderToKeyword(result.key.second),
    fitness: averageLog10(result.score, quadgrams),
    plaintext: problem.decryptKey(result.key),
    english: result.score >= target,
  };
}

/** Sequential restarts at the given key lengths, stopping at the first English decryption. */
export function breakDoubleTransposition(
  text: string,
  firstLength: number,
  secondLength: number,
  table: Uint8Array,
  options: DoubleRunOptions & { restarts?: number },
): DoubleCandidate {
  let best: DoubleCandidate | null = null;
  const restarts = options.restarts ?? DOUBLE_SETTINGS.restarts;
  for (let run = 0; run < restarts; run += 1) {
    const candidate = annealDouble(
      text,
      firstLength,
      secondLength,
      table,
      options,
    );
    if (best === null || candidate.fitness > best.fitness) {
      best = candidate;
    }
    if (candidate.english) {
      break;
    }
  }
  if (best === null) {
    throw new Error("restarts must be at least 1");
  }
  return best;
}
