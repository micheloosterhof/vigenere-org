// ABOUTME: Breaks general periodic polyalphabetic ciphers: an arbitrary alphabet per key position.
// ABOUTME: Detects the period by index of coincidence, then hill climbs each column under joint quadgram scoring.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import {
  QUADGRAM_LOG10_SCALE,
  QUADGRAM_MIN_LOG10,
  QUADGRAM_TABLE_SIZE,
} from "./data/english-quadgrams-meta";
import { toLetterValues } from "./solve";
import { substituteLetters } from "./cipher";
import { iocPerPeriod, MAX_PERIOD } from "./period";

const ALPHABET_SIZE = 26;
const CODE_A = 65;
const FREQUENCY_ORDER = "ETAOINSHRDLCUMWFGYPBVKJXQZ";

// The climb scores at most this many letters; more adds cost without accuracy.
const SAMPLE_LIMIT = 3000;

const RESTARTS = 10;

// Average quadgram log10 probability at which a decryption reads as English;
// once a restart reaches it, further restarts cannot meaningfully improve.
const EARLY_EXIT_FITNESS = -3.6;

export interface PolyalphabeticResult {
  period: number;
  /** One encrypt alphabet per key position, in the same form as the substitution tool's key. */
  alphabets: string[];
  plaintext: string;
  /** Average quadgram log10 probability of the decryption; higher is more English-like. */
  fitness: number;
}

export interface PolyalphabeticProgress {
  restart: number;
  restarts: number;
  fitness: number;
}

interface Options {
  period?: number;
  maxPeriod?: number;
  restarts?: number;
  rng?: () => number;
  onProgress?: (progress: PolyalphabeticProgress) => void;
}

/** Suggests the key period; throws on text too short to analyze. */
export function detectPeriod(text: string, maxPeriod = MAX_PERIOD): number {
  const values = toLetterValues(text);
  if (values.length < 4) {
    throw new Error("text must contain at least four letters");
  }
  return iocPerPeriod(values, maxPeriod).period;
}

/** Sum of quantized quadgram scores for the sample decrypted through the per-column mappings. */
function rawScore(
  sample: number[],
  mappings: number[][],
  period: number,
  table: Uint8Array,
): number {
  let sum = 0;
  let index = 0;
  for (let i = 0; i < sample.length; i += 1) {
    index =
      (index * ALPHABET_SIZE + mappings[i % period][sample[i]]) %
      QUADGRAM_TABLE_SIZE;
    if (i >= 3) {
      sum += table[index];
    }
  }
  return sum;
}

/** Seeds one column's mapping by pairing its frequency ranks with English frequency ranks. */
function frequencySeed(
  sample: number[],
  period: number,
  column: number,
): number[] {
  const counts = new Array<number>(ALPHABET_SIZE).fill(0);
  for (let i = column; i < sample.length; i += period) {
    counts[sample[i]] += 1;
  }
  const byFrequency = Array.from({ length: ALPHABET_SIZE }, (_, i) => i).sort(
    (a, b) => counts[b] - counts[a] || a - b,
  );
  const mapping = new Array<number>(ALPHABET_SIZE);
  byFrequency.forEach((cipherLetter, rank) => {
    mapping[cipherLetter] = FREQUENCY_ORDER.charCodeAt(rank) - CODE_A;
  });
  return mapping;
}

function shuffled(rng: () => number): number[] {
  const mapping = Array.from({ length: ALPHABET_SIZE }, (_, i) => i);
  for (let i = mapping.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [mapping[i], mapping[j]] = [mapping[j], mapping[i]];
  }
  return mapping;
}

/**
 * Steepest-ascent hill climb over the whole key: each step evaluates every
 * letter-pair swap in every column and applies the single best, so no column
 * converges against the others prematurely.
 */
function climb(
  sample: number[],
  mappings: number[][],
  period: number,
  table: Uint8Array,
): number {
  let best = rawScore(sample, mappings, period, table);
  let improved = true;
  while (improved) {
    improved = false;
    let bestColumn = -1;
    let bestFirst = -1;
    let bestSecond = -1;
    let bestScore = best;
    for (let column = 0; column < period; column += 1) {
      const mapping = mappings[column];
      for (let first = 0; first < ALPHABET_SIZE - 1; first += 1) {
        for (let second = first + 1; second < ALPHABET_SIZE; second += 1) {
          [mapping[first], mapping[second]] = [mapping[second], mapping[first]];
          const score = rawScore(sample, mappings, period, table);
          [mapping[first], mapping[second]] = [mapping[second], mapping[first]];
          if (score > bestScore) {
            bestScore = score;
            bestColumn = column;
            bestFirst = first;
            bestSecond = second;
          }
        }
      }
    }
    if (bestColumn >= 0) {
      const mapping = mappings[bestColumn];
      [mapping[bestFirst], mapping[bestSecond]] = [
        mapping[bestSecond],
        mapping[bestFirst],
      ];
      best = bestScore;
      improved = true;
    }
  }
  return best;
}

/**
 * Recovers a general periodic polyalphabetic cipher from ciphertext alone.
 * Needs roughly a hundred letters per key position; the table is the
 * quantized quadgram data served at QUADGRAM_TABLE_URL.
 */
export function breakPolyalphabetic(
  text: string,
  table: Uint8Array,
  options: Options = {},
): PolyalphabeticResult {
  const values = toLetterValues(text);
  if (values.length < 4) {
    throw new Error("text must contain at least four letters");
  }
  const rng = options.rng ?? Math.random;
  const restarts = options.restarts ?? RESTARTS;
  const period = options.period ?? detectPeriod(text, options.maxPeriod);
  const sample = values.slice(0, SAMPLE_LIMIT);

  let bestMappings: number[][] = [];
  let bestScore = -Infinity;
  for (let restart = 0; restart < restarts; restart += 1) {
    const mappings = Array.from({ length: period }, (_, column) =>
      restart === 0 ? frequencySeed(sample, period, column) : shuffled(rng),
    );
    const score = climb(sample, mappings, period, table);
    if (score > bestScore) {
      bestScore = score;
      bestMappings = mappings;
    }
    const fitness =
      QUADGRAM_MIN_LOG10 +
      (bestScore / (sample.length - 3)) * QUADGRAM_LOG10_SCALE;
    options.onProgress?.({ restart: restart + 1, restarts, fitness });
    if (fitness >= EARLY_EXIT_FITNESS) {
      break;
    }
  }

  // Each mapping decrypts (cipher -> plain); the displayed alphabets encrypt.
  const alphabets = bestMappings.map((mapping) => {
    const key = new Array<string>(ALPHABET_SIZE);
    mapping.forEach((plain, cipher) => {
      key[plain] = String.fromCharCode(CODE_A + cipher);
    });
    return key.join("");
  });
  const plaintext = substituteLetters(
    text,
    Array.from({ length: period }, (_, i) => i),
    (letter, column) => bestMappings[column][letter],
  );
  return {
    period,
    alphabets,
    plaintext,
    fitness:
      QUADGRAM_MIN_LOG10 +
      (bestScore / (sample.length - 3)) * QUADGRAM_LOG10_SCALE,
  };
}
