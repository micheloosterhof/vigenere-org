// ABOUTME: Breaks the Bifid and Trifid ciphers by simulated annealing over the square or cube, per candidate period.
// ABOUTME: A pair index of coincidence ranks the periods; the best few are annealed until one reads as English.
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
  swapTwo,
  type AnnealProblem,
} from "./anneal";
import { toSquareValues } from "./playfair";
import { TRIFID_EXTRA } from "./trifid";

const CODE_A = 65;
const SQUARE_LETTERS = "ABCDEFGHIKLMNOPQRSTUVWXYZ";
const CUBE_SYMBOLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ" + TRIFID_EXTRA;

/** Periods tried when none is given; 0 is the whole message as one block. */
export const DEFAULT_PERIODS = [
  0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];

export type FractionationCipher = "bifid" | "trifid";

export interface FractionationCandidate {
  period: number;
  /** Square (25 letters, no J) or cube (27 symbols) usable as the key of bifid() or trifid(). */
  key: string;
  /** Average quadgram log10 probability of the decryption; higher is more English-like. */
  fitness: number;
  plaintext: string;
  /** True once the decryption reads as English, which ends the search. */
  english: boolean;
}

export interface AnnealRunOptions {
  rng: () => number;
  iterations?: number;
  /** Starting temperature per letter of text, in raw quadgram units. */
  temperatureFactor?: number;
  /** Called every so often with the fraction of this run done. */
  onProgress?: (fraction: number) => void;
}

/** Per-cipher annealing settings, chosen by benchmark: many short runs beat few long ones. */
export const RUN_SETTINGS: Record<
  FractionationCipher,
  { iterations: number; restarts: number; finalists: number }
> = {
  bifid: { iterations: 100000, restarts: 12, finalists: 3 },
  trifid: { iterations: 300000, restarts: 8, finalists: 4 },
};

/** Everything a solver needs about one cipher: its grid and how a key decrypts. */
interface Geometry {
  size: number;
  /** Coordinates per symbol: 2 for the square, 3 for the cube. */
  digits: number;
  /** Symbols of the grid in value order. */
  symbols: string;
  /** Plaintext symbol value to quadgram letter value (26 means skip). */
  letterOf: Uint8Array;
  decrypt(
    cipher: Uint8Array,
    cell: Int32Array,
    period: number,
    out: Uint8Array,
  ): void;
  /** Extra structural moves beyond swapping two cells. */
  shuffleLines(key: number[], rng: () => number): number[];
}

let scratchBuffer = new Int32Array(64);

/** A reusable buffer of at least `size` entries, so decryption allocates nothing per step. */
function scratch(size: number): Int32Array {
  if (scratchBuffer.length < size) {
    scratchBuffer = new Int32Array(size);
  }
  return scratchBuffer;
}

function lineSwap(
  key: number[],
  rng: () => number,
  count: number,
  cellsOf: (line: number) => number[],
): number[] {
  const copy = [...key];
  const a = Math.floor(rng() * count);
  let b = Math.floor(rng() * (count - 1));
  if (b >= a) {
    b += 1;
  }
  const first = cellsOf(a);
  const second = cellsOf(b);
  first.forEach((cell, i) => {
    [copy[cell], copy[second[i]]] = [copy[second[i]], copy[cell]];
  });
  return copy;
}

const BIFID: Geometry = {
  size: 25,
  digits: 2,
  symbols: SQUARE_LETTERS,
  letterOf: Uint8Array.from(SQUARE_LETTERS, (c) => c.charCodeAt(0) - CODE_A),
  decrypt(cipher, cell, period, out) {
    const n = cipher.length;
    const block = period === 0 ? n : period;
    const line = scratch(2 * block);
    for (let start = 0; start < n; start += block) {
      const len = Math.min(block, n - start);
      for (let i = 0; i < len; i += 1) {
        const position = cell[cipher[start + i]];
        line[2 * i] = (position / 5) | 0;
        line[2 * i + 1] = position % 5;
      }
      for (let i = 0; i < len; i += 1) {
        out[start + i] = line[i] * 5 + line[len + i];
      }
    }
  },
  shuffleLines(key, rng) {
    return rng() < 0.5
      ? lineSwap(key, rng, 5, (r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c))
      : lineSwap(key, rng, 5, (c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c));
  },
};

const TRIFID: Geometry = {
  size: 27,
  digits: 3,
  symbols: CUBE_SYMBOLS,
  letterOf: Uint8Array.from(CUBE_SYMBOLS, (_, i) => i),
  decrypt(cipher, cell, period, out) {
    const n = cipher.length;
    const block = period === 0 ? n : period;
    const line = scratch(3 * block);
    for (let start = 0; start < n; start += block) {
      const len = Math.min(block, n - start);
      for (let i = 0; i < len; i += 1) {
        const position = cell[cipher[start + i]];
        line[3 * i] = (position / 9) | 0;
        line[3 * i + 1] = ((position / 3) | 0) % 3;
        line[3 * i + 2] = position % 3;
      }
      for (let i = 0; i < len; i += 1) {
        out[start + i] = line[i] * 9 + line[len + i] * 3 + line[2 * len + i];
      }
    }
  },
  shuffleLines(key, rng) {
    const axis = Math.floor(rng() * 3);
    const cells = (fixed: number): number[] => {
      const result: number[] = [];
      for (let a = 0; a < 3; a += 1) {
        for (let b = 0; b < 3; b += 1) {
          result.push(
            axis === 0
              ? fixed * 9 + a * 3 + b
              : axis === 1
                ? a * 9 + fixed * 3 + b
                : a * 9 + b * 3 + fixed,
          );
        }
      }
      return result;
    };
    return lineSwap(key, rng, 3, cells);
  },
};

/** Fills `cell` (symbol value → cell) from a key (cell → symbol value). */
function cellsOfKey(key: number[], cell: Int32Array): Int32Array {
  for (let position = 0; position < key.length; position += 1) {
    cell[key[position]] = position;
  }
  return cell;
}

function problemFor(
  geometry: Geometry,
  cipher: Uint8Array,
  period: number,
  table: Uint8Array,
): AnnealProblem<number[]> & { decryptKey(key: number[]): Uint8Array } {
  const out = new Uint8Array(cipher.length);
  const letters = new Uint8Array(cipher.length);
  const cell = new Int32Array(geometry.size);
  const decryptKey = (key: number[]): Uint8Array => {
    geometry.decrypt(cipher, cellsOfKey(key, cell), period, out);
    const plain = new Uint8Array(cipher.length);
    for (let i = 0; i < out.length; i += 1) {
      plain[i] = key[out[i]];
    }
    return plain;
  };
  return {
    random: (rng) => randomPermutation(geometry.size, rng),
    neighbour: (key, rng) =>
      rng() < 0.9 ? swapTwo(key, rng) : geometry.shuffleLines(key, rng),
    score(key) {
      geometry.decrypt(cipher, cellsOfKey(key, cell), period, out);
      for (let i = 0; i < out.length; i += 1) {
        letters[i] = geometry.letterOf[key[out[i]]];
      }
      return quadgramRaw(letters, letters.length, table);
    },
    decryptKey,
  };
}

/**
 * How strongly a period shows in the ciphertext. Within a block of period p,
 * ciphertext symbols about p/2 apart (Bifid) or p/3 apart (Trifid) carry the
 * coordinates of the same plaintext symbols, so at the true period those
 * pairs repeat like English digraphs: their index of coincidence is high.
 */
export function periodScore(
  values: ArrayLike<number>,
  period: number,
  digits: number,
): number {
  const n = values.length;
  const p = period === 0 ? n : period;
  let best = 0;
  for (const distance of [Math.floor(p / digits), Math.ceil(p / digits)]) {
    if (distance < 1 || distance >= p) {
      continue;
    }
    const counts = new Map<number, number>();
    let total = 0;
    for (let start = 0; start + p <= n; start += p) {
      for (let j = 0; j + distance < p; j += 1) {
        const pair = values[start + j] * 32 + values[start + j + distance];
        counts.set(pair, (counts.get(pair) ?? 0) + 1);
        total += 1;
      }
    }
    if (total < 2) {
      continue;
    }
    let coincidences = 0;
    for (const count of counts.values()) {
      coincidences += count * (count - 1);
    }
    best = Math.max(best, coincidences / (total * (total - 1)));
  }
  return best;
}

// Correct decryptions score about -4.3 in average quadgram log10; wrong ones
// stay below -5. A run that reaches this has found the key and stops.
export const ENGLISH_FITNESS = -4.7;

// Below about 100 letters a search over 25! squares can make random text
// score near ENGLISH_FITNESS (-4.8 at 80 letters), so shorter text is refused
// rather than risk reporting a false key.
export const MIN_LETTERS = 100;

const GEOMETRY: Record<FractionationCipher, Geometry> = {
  bifid: BIFID,
  trifid: TRIFID,
};

function cipherValues(cipher: FractionationCipher, text: string): Uint8Array {
  if (cipher === "bifid") {
    return Uint8Array.from(toSquareValues(text));
  }
  const values: number[] = [];
  for (const char of text.toUpperCase()) {
    const value = CUBE_SYMBOLS.indexOf(char);
    if (value >= 0) {
      values.push(value);
    }
  }
  return Uint8Array.from(values);
}

/**
 * The periods worth annealing, most likely first: the usable ones among
 * `periods`, ranked by periodScore, keeping the best `finalists`.
 */
export function rankPeriods(
  cipher: FractionationCipher,
  text: string,
  periods: number[] = DEFAULT_PERIODS,
  finalists: number = RUN_SETTINGS[cipher].finalists,
): number[] {
  const values = cipherValues(cipher, text);
  const n = values.length;
  if (n < MIN_LETTERS) {
    throw new Error(
      `text must contain at least ${MIN_LETTERS} letters (it has ${n}); about 200 are needed for a reliable solve`,
    );
  }
  const usable = [
    ...new Set(periods.filter((p) => p === 0 || (p >= 2 && p < n))),
  ];
  if (usable.length === 0) {
    throw new Error(
      "no usable period: give one from 2 to the text length, or 0",
    );
  }
  return usable
    .map((period) => ({
      period,
      score: periodScore(values, period, GEOMETRY[cipher].digits),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, finalists)
    .map((ranked) => ranked.period);
}

/** One annealing run for the square or cube at one period. */
export function annealFractionation(
  cipher: FractionationCipher,
  text: string,
  period: number,
  table: Uint8Array,
  options: AnnealRunOptions,
): FractionationCandidate {
  const geometry = GEOMETRY[cipher];
  const values = cipherValues(cipher, text);
  const n = values.length;
  if (n < MIN_LETTERS) {
    throw new Error(
      `text must contain at least ${MIN_LETTERS} letters (it has ${n}); about 200 are needed for a reliable solve`,
    );
  }
  const quadgrams = n - 3;
  const target =
    ((ENGLISH_FITNESS - QUADGRAM_MIN_LOG10) / QUADGRAM_LOG10_SCALE) * quadgrams;
  const problem = problemFor(geometry, values, period, table);
  const result = anneal(problem, {
    rng: options.rng,
    iterations: options.iterations ?? RUN_SETTINGS[cipher].iterations,
    // The raw score is a sum over the text, so the temperature scales with length.
    temperature: n * (options.temperatureFactor ?? 1),
    target,
    onProgress: options.onProgress,
  });
  const plain = problem.decryptKey(result.key);
  return {
    period,
    key: result.key.map((v) => geometry.symbols[v]).join(""),
    fitness: averageLog10(result.score, quadgrams),
    plaintext: Array.from(plain, (v) => geometry.symbols[v]).join(""),
    english: result.score >= target,
  };
}

export interface BreakFractionationOptions extends AnnealRunOptions {
  periods?: number[];
  restarts?: number;
  finalists?: number;
}

/**
 * Sequential search: anneals each ranked period with restarts and stops at
 * the first decryption that reads as English. The page runs the same jobs
 * across a worker pool instead.
 */
export function breakFractionation(
  cipher: FractionationCipher,
  text: string,
  table: Uint8Array,
  options: BreakFractionationOptions,
): FractionationCandidate {
  const settings = RUN_SETTINGS[cipher];
  const periods = rankPeriods(
    cipher,
    text,
    options.periods,
    options.finalists ?? settings.finalists,
  );
  let best: FractionationCandidate | null = null;
  for (const period of periods) {
    for (let run = 0; run < (options.restarts ?? settings.restarts); run += 1) {
      const candidate = annealFractionation(
        cipher,
        text,
        period,
        table,
        options,
      );
      if (best === null || candidate.fitness > best.fitness) {
        best = candidate;
      }
      if (candidate.english) {
        return candidate;
      }
    }
  }
  if (best === null) {
    throw new Error("no period to try");
  }
  return best;
}

/** Test hook: the decryption a key (cell → symbol values) gives. */
export function decryptWithGrid(
  cipher: FractionationCipher,
  values: number[],
  key: number[],
  period: number,
  table: Uint8Array,
): { plaintext: number[]; raw: number } {
  const problem = problemFor(
    GEOMETRY[cipher],
    Uint8Array.from(values),
    period,
    table,
  );
  return {
    plaintext: Array.from(problem.decryptKey(key)),
    raw: problem.score(key),
  };
}
