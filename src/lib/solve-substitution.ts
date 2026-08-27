// ABOUTME: Breaks simple substitution ciphers by hill climbing over the letter mapping.
// ABOUTME: Steepest-ascent swaps scored with quadgram statistics, restarted from several seeds.
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

// English letters from most to least frequent; used to seed the climb by
// pairing frequency ranks between ciphertext and English.
const FREQUENCY_ORDER = "ETAOINSHRDLCUMWFGYPBVKJXQZ";

// The climb scores at most this many letters; more adds cost without accuracy.
const SAMPLE_LIMIT = 2000;

const RESTARTS = 10;

export interface SubstitutionResult {
  /** Full alphabet usable as the key of substitution() to decrypt the text. */
  key: string;
  /** Average quadgram log10 probability of the decryption; higher is more English-like. */
  fitness: number;
}

interface Options {
  restarts?: number;
  rng?: () => number;
}

/** Sum of quantized quadgram scores for the sample decrypted through the mapping. */
function rawScore(
  sample: number[],
  mapping: number[],
  table: Uint8Array,
): number {
  let sum = 0;
  let index = 0;
  for (let i = 0; i < sample.length; i += 1) {
    index = (index * ALPHABET_SIZE + mapping[sample[i]]) % QUADGRAM_TABLE_SIZE;
    if (i >= 3) {
      sum += table[index];
    }
  }
  return sum;
}

/** Average quadgram log10 probability of the text's letters; higher is more English-like. */
export function quadgramScore(text: string, table: Uint8Array): number {
  const values = toLetterValues(text);
  if (values.length < 4) {
    throw new Error("text must contain at least four letters");
  }
  const identity = Array.from({ length: ALPHABET_SIZE }, (_, i) => i);
  const quadgrams = values.length - 3;
  return (
    QUADGRAM_MIN_LOG10 +
    (rawScore(values, identity, table) / quadgrams) * QUADGRAM_LOG10_SCALE
  );
}

/** Seeds the mapping by pairing ciphertext frequency ranks with English frequency ranks. */
function frequencySeed(sample: number[]): number[] {
  const counts = new Array<number>(ALPHABET_SIZE).fill(0);
  for (const value of sample) {
    counts[value] += 1;
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

/** Steepest-ascent hill climb: apply the best of all letter-pair swaps until none improves. */
function climb(sample: number[], mapping: number[], table: Uint8Array): number {
  let best = rawScore(sample, mapping, table);
  let improved = true;
  while (improved) {
    improved = false;
    let bestFirst = -1;
    let bestSecond = -1;
    let bestScore = best;
    for (let first = 0; first < ALPHABET_SIZE - 1; first += 1) {
      for (let second = first + 1; second < ALPHABET_SIZE; second += 1) {
        [mapping[first], mapping[second]] = [mapping[second], mapping[first]];
        const score = rawScore(sample, mapping, table);
        [mapping[first], mapping[second]] = [mapping[second], mapping[first]];
        if (score > bestScore) {
          bestScore = score;
          bestFirst = first;
          bestSecond = second;
        }
      }
    }
    if (bestFirst >= 0) {
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
 * Recovers the alphabet of a simple substitution cipher from ciphertext alone.
 * The table is the quantized quadgram data served at QUADGRAM_TABLE_URL.
 */
export function breakSubstitution(
  text: string,
  table: Uint8Array,
  options: Options = {},
): SubstitutionResult {
  const values = toLetterValues(text);
  if (values.length < 4) {
    throw new Error("text must contain at least four letters");
  }
  const rng = options.rng ?? Math.random;
  const restarts = options.restarts ?? RESTARTS;
  const sample = values.slice(0, SAMPLE_LIMIT);

  let bestMapping: number[] = [];
  let bestScore = -Infinity;
  for (let restart = 0; restart < restarts; restart += 1) {
    const mapping = restart === 0 ? frequencySeed(sample) : shuffled(rng);
    const score = climb(sample, mapping, table);
    if (score > bestScore) {
      bestScore = score;
      bestMapping = mapping;
    }
  }

  // bestMapping decrypts (cipher -> plain); the tool's key is the encrypt alphabet.
  const key = new Array<string>(ALPHABET_SIZE);
  bestMapping.forEach((plain, cipher) => {
    key[plain] = String.fromCharCode(CODE_A + cipher);
  });
  const quadgrams = sample.length - 3;
  return {
    key: key.join(""),
    fitness:
      QUADGRAM_MIN_LOG10 + (bestScore / quadgrams) * QUADGRAM_LOG10_SCALE,
  };
}
