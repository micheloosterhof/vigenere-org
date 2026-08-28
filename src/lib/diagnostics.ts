// ABOUTME: Statistical diagnostics for identifying the cipher behind a text.
// ABOUTME: Pure functions producing the feature vector that routes the auto-solver (and, later, a classifier).
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { toLetterValues } from "./solve";
import { ENGLISH_IOC, iocPerPeriod, MAX_PERIOD } from "./period";

export { iocPerPeriod } from "./period";

const ALPHABET_SIZE = 26;

const AUTOKEY_DELTA_IOC = 1.35;
const MAX_LAG = 20;

export type CipherFamily =
  "monoalphabetic" | "periodic" | "ciphertext-autokey" | "unknown";

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
  /** Key length suggested by the index of coincidence; 1 means monoalphabetic. */
  period: number;
  /** Per-column IoC at the suggested period. */
  periodIoc: number;
  /** Coincidence rate at the suggested period; elevated when the text is periodic. */
  kappaAtPeriod: number;
  /** Best ciphertext-autokey delta-stream IoC found, and the lag (primer length) that gave it. */
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

/** Best ciphertext-autokey delta-stream IoC over all lags, with the winning lag. */
function bestAutokeyLag(
  values: number[],
  maxLag: number,
): { ioc: number; lag: number } {
  let best = { ioc: 0, lag: 1 };
  const longest = Math.max(1, Math.min(maxLag, Math.floor(values.length / 20)));
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

/** Computes the full diagnostics feature vector and a coarse family guess. */
export function analyze(text: string): Diagnostics {
  const values = toLetterValues(text);
  if (values.length < ALPHABET_SIZE) {
    throw new Error("text must contain at least 26 letters to analyze");
  }
  const ioc = normalizedIoc(values, 1);
  const { period, ioc: periodIoc } = iocPerPeriod(values, MAX_PERIOD);
  const autokey = bestAutokeyLag(values, MAX_LAG);

  let likelyFamily: CipherFamily;
  if (autokey.ioc >= AUTOKEY_DELTA_IOC && ioc < ENGLISH_IOC) {
    likelyFamily = "ciphertext-autokey";
  } else if (ioc >= ENGLISH_IOC) {
    likelyFamily = "monoalphabetic";
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
    period,
    periodIoc,
    kappaAtPeriod: kappa(values, Math.max(1, period)),
    autokeyDeltaIoc: autokey.ioc,
    autokeyLag: autokey.lag,
    likelyFamily,
  };
}
