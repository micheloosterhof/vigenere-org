// ABOUTME: Statistical diagnostics for identifying the cipher behind a text.
// ABOUTME: Pure functions producing the feature vector that routes the auto-solver (and, later, a classifier).
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { READABLE_BIGRAM, scoreText, toLetterValues } from "./solve";
import { ENGLISH_IOC, iocPerPeriod, MAX_PERIOD } from "./period";

export { iocPerPeriod } from "./period";

const ALPHABET_SIZE = 26;

const AUTOKEY_DELTA_IOC = 1.35;
const MAX_LAG = 20;
// Per-letter chi-squared against English letter frequencies below this means
// the letters themselves are English: real text scores well under it, any
// substitution well over it.
const ENGLISH_FREQUENCY_MATCH = 1;

/** English letter frequencies A-Z, from Lewand, "Cryptological Mathematics". */
export const ENGLISH_FREQUENCIES = [
  0.08167, 0.01492, 0.02782, 0.04253, 0.12702, 0.02228, 0.02015, 0.06094,
  0.06966, 0.00153, 0.00772, 0.04025, 0.02406, 0.06749, 0.07507, 0.01929,
  0.00095, 0.05987, 0.06327, 0.09056, 0.02758, 0.00978, 0.0236, 0.0015, 0.01974,
  0.00074,
];
// Four letters is one quadgram and the shortest text every attack accepts. The
// statistics below are noisy on so little text, but a short Caesar still breaks.
const MIN_LENGTH = 4;

export type CipherFamily =
  | "monoalphabetic"
  | "periodic"
  | "transposition"
  | "ciphertext-autokey"
  | "unknown";

export interface Diagnostics {
  /** Number of letters analyzed. */
  length: number;
  /** Normalized single-letter index of coincidence; ~1.73 English, ~1.0 random. */
  ioc: number;
  /** Normalized digraph index of coincidence. */
  digraphIoc: number;
  /** Shannon entropy of the letters, in bits. */
  entropy: number;
  /** Chi-squared distance of the letter distribution from uniform. */
  chiSquared: number;
  /** Per-letter chi-squared distance from English letter frequencies; small means the letters are English. */
  chiSquaredEnglish: number;
  /** Average bigram log10 probability of the text as it stands; above about -2.55 reads as English. */
  bigramFitness: number;
  /** Key length suggested by the index of coincidence; 1 means monoalphabetic. */
  period: number;
  /** Per-column IoC at the suggested period. */
  periodIoc: number;
  /** Coincidence rate at the suggested period; elevated when the text is periodic. */
  kappaAtPeriod: number;
  /**
   * Best ciphertext-autokey delta-stream IoC found, and the lag (primer length)
   * that gave it. Lag 0 means the text was too short to test any lag.
   */
  autokeyDeltaIoc: number;
  autokeyLag: number;
  /** Coarse cipher family the statistics point to. */
  likelyFamily: CipherFamily;
}

function coincidence(counts: number[], total: number): number {
  if (total < 2) {
    return 0;
  }
  let sum = 0;
  for (const count of counts) {
    sum += count * (count - 1);
  }
  return sum / (total * (total - 1));
}

/** Normalized index of coincidence over n-grams of the given length; 1.0 is uniform-random. */
export function normalizedIoc(text: string | number[], length = 1): number {
  const values = typeof text === "string" ? toLetterValues(text) : text;
  const counts = new Map<number, number>();
  let total = 0;
  for (let i = 0; i + length <= values.length; i += 1) {
    let key = 0;
    for (let j = 0; j < length; j += 1) {
      key = key * ALPHABET_SIZE + values[i + j];
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total += 1;
  }
  return ALPHABET_SIZE ** length * coincidence([...counts.values()], total);
}

/** Kappa: the coincidence rate at a given lag; peaks at multiples of the key period. */
export function kappa(text: string | number[], skip: number): number {
  const values = typeof text === "string" ? toLetterValues(text) : text;
  const comparisons = values.length - skip;
  if (comparisons < 1) {
    return 0;
  }
  let hits = 0;
  for (let i = 0; i + skip < values.length; i += 1) {
    if (values[i] === values[i + skip]) {
      hits += 1;
    }
  }
  return hits / comparisons;
}

/**
 * Normalized IoC of the difference stream (c[i] op c[i-lag]). For a ciphertext
 * autokey cipher the difference at the primer-length lag is the plaintext, so it
 * reads English. `op` is "sub" for the Vigenère side, "add" for the Beaufort side.
 */
export function deltaStreamIoc(
  text: string | number[],
  lag: number,
  op: "sub" | "add",
): number {
  const values = typeof text === "string" ? toLetterValues(text) : text;
  const stream: number[] = [];
  for (let i = lag; i < values.length; i += 1) {
    const combined =
      op === "sub" ? values[i] - values[i - lag] : values[i] + values[i - lag];
    stream.push(((combined % ALPHABET_SIZE) + ALPHABET_SIZE) % ALPHABET_SIZE);
  }
  return normalizedIoc(stream, 1);
}

/**
 * Best ciphertext-autokey delta-stream IoC over all lags, with the winning lag.
 * A delta stream needs about twenty letters per lag before its IoC separates
 * English from noise, so shorter text is reported as lag 0: no signal, rather
 * than a signal measured on too little text.
 */
function bestAutokeyLag(
  values: number[],
  maxLag: number,
): { ioc: number; lag: number } {
  let best = { ioc: 0, lag: 0 };
  const longest = Math.min(maxLag, Math.floor(values.length / 20));
  for (let lag = 1; lag <= longest; lag += 1) {
    const ioc = Math.max(
      deltaStreamIoc(values, lag, "sub"),
      deltaStreamIoc(values, lag, "add"),
    );
    if (ioc > best.ioc) {
      best = { ioc, lag };
    }
  }
  return best;
}

/** Shannon entropy of the letters, in bits. */
export function shannonEntropy(text: string | number[]): number {
  const values = typeof text === "string" ? toLetterValues(text) : text;
  const counts = new Array<number>(ALPHABET_SIZE).fill(0);
  for (const value of values) {
    counts[value] += 1;
  }
  let entropy = 0;
  for (const count of counts) {
    if (count > 0) {
      const p = count / values.length;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

/** Chi-squared distance of the letter distribution from uniform. */
export function chiSquaredUniform(text: string | number[]): number {
  const values = typeof text === "string" ? toLetterValues(text) : text;
  const counts = new Array<number>(ALPHABET_SIZE).fill(0);
  for (const value of values) {
    counts[value] += 1;
  }
  const expected = values.length / ALPHABET_SIZE;
  if (expected === 0) {
    return 0;
  }
  let chiSquared = 0;
  for (const count of counts) {
    chiSquared += (count - expected) ** 2 / expected;
  }
  return chiSquared;
}

/**
 * Chi-squared distance from English letter frequencies, per letter. Real
 * English (also transposed) stays well below 1; substituted alphabets score
 * far above it.
 */
export function chiSquaredEnglish(text: string | number[]): number {
  const values = typeof text === "string" ? toLetterValues(text) : text;
  if (values.length === 0) {
    return 0;
  }
  const counts = new Array<number>(ALPHABET_SIZE).fill(0);
  for (const value of values) {
    counts[value] += 1;
  }
  let chiSquared = 0;
  for (let letter = 0; letter < ALPHABET_SIZE; letter += 1) {
    const expected = ENGLISH_FREQUENCIES[letter] * values.length;
    chiSquared += (counts[letter] - expected) ** 2 / expected;
  }
  return chiSquared / values.length;
}

/** Computes the full diagnostics feature vector and a coarse family guess. */
export function analyze(text: string): Diagnostics {
  const values = toLetterValues(text);
  if (values.length < MIN_LENGTH) {
    throw new Error(
      `text must contain at least ${MIN_LENGTH} letters to analyze`,
    );
  }
  const ioc = normalizedIoc(values, 1);
  const { period, ioc: periodIoc } = iocPerPeriod(values, MAX_PERIOD);
  const autokey = bestAutokeyLag(values, MAX_LAG);
  const frequencyDistance = chiSquaredEnglish(values);
  const bigramFitness = scoreText(text);

  let likelyFamily: CipherFamily;
  if (autokey.ioc >= AUTOKEY_DELTA_IOC && ioc < ENGLISH_IOC) {
    likelyFamily = "ciphertext-autokey";
  } else if (ioc >= ENGLISH_IOC) {
    // English-frequency letters that do not read as English have been moved,
    // not substituted: the transposition signature.
    likelyFamily =
      frequencyDistance <= ENGLISH_FREQUENCY_MATCH &&
      bigramFitness < READABLE_BIGRAM
        ? "transposition"
        : "monoalphabetic";
  } else if (period > 1) {
    likelyFamily = "periodic";
  } else {
    likelyFamily = "unknown";
  }

  return {
    length: values.length,
    ioc,
    digraphIoc: normalizedIoc(values, 2),
    entropy: shannonEntropy(values),
    chiSquared: chiSquaredUniform(values),
    chiSquaredEnglish: frequencyDistance,
    bigramFitness,
    period,
    periodIoc,
    kappaAtPeriod: kappa(values, Math.max(1, period)),
    autokeyDeltaIoc: autokey.ioc,
    autokeyLag: autokey.lag,
    likelyFamily,
  };
}
