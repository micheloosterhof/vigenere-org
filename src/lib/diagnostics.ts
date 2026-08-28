// ABOUTME: Statistical diagnostics for identifying the cipher behind a text.
// ABOUTME: Pure functions producing the feature vector that routes the auto-solver (and, later, a classifier).
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { toLetterValues } from "./solve";

const ALPHABET_SIZE = 26;

// English normalized IoC sits near 1.73; random text near 1.0. These thresholds
// separate the families with comfortable margins on the texts we handle.
const MONO_IOC = 1.3;
const AUTOKEY_DELTA_IOC = 1.35;
const MAX_PERIOD = 20;
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

/** Mean per-column normalized IoC when the text is split into `period` columns. */
function columnIoc(values: number[], period: number): number {
  let sum = 0;
  for (let column = 0; column < period; column += 1) {
    const counts = new Array<number>(ALPHABET_SIZE).fill(0);
    let total = 0;
    for (let i = column; i < values.length; i += period) {
      counts[values[i]] += 1;
      total += 1;
    }
    sum += ALPHABET_SIZE * coincidence(counts, total);
  }
  return sum / period;
}

/**
 * Suggests the key period from per-column IoC. Reports the shortest period whose
 * columns look monoalphabetic (well above random), so the true period beats its
 * multiples, falling back to the highest-scoring period.
 */
export function iocPerPeriod(
  text: string | number[],
  maxPeriod = MAX_PERIOD,
): { period: number; ioc: number; curve: number[] } {
  const values = typeof text === "string" ? toLetterValues(text) : text;
  const longest = Math.max(
    1,
    Math.min(maxPeriod, Math.floor(values.length / 20)),
  );
  const curve = Array.from({ length: longest }, (_, i) =>
    columnIoc(values, i + 1),
  );
  if (curve[0] >= MONO_IOC) {
    return { period: 1, ioc: curve[0], curve };
  }
  const peak = Math.max(...curve);
  const baseline = [...curve].sort((a, b) => a - b)[
    Math.floor(curve.length / 2)
  ];
  const threshold =
    peak - baseline < 0.1 ? peak : baseline + 0.6 * (peak - baseline);
  const period = curve.findIndex((v) => v >= threshold) + 1;
  return { period, ioc: curve[period - 1], curve };
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
 * Conditional IoC: groups each letter by the letter `lag` positions before it and
 * pools the within-group coincidences. Elevated for ciphertext autokey because
 * each group is a monoalphabetic image of the plaintext.
 */
export function conditionalIoc(text: string | number[], lag: number): number {
  const values = typeof text === "string" ? toLetterValues(text) : text;
  const buckets = Array.from({ length: ALPHABET_SIZE }, () =>
    new Array<number>(ALPHABET_SIZE).fill(0),
  );
  const sizes = new Array<number>(ALPHABET_SIZE).fill(0);
  for (let i = lag; i < values.length; i += 1) {
    buckets[values[i - lag]][values[i]] += 1;
    sizes[values[i - lag]] += 1;
  }
  let numerator = 0;
  let denominator = 0;
  for (let group = 0; group < ALPHABET_SIZE; group += 1) {
    const total = sizes[group];
    if (total < 2) {
      continue;
    }
    for (const count of buckets[group]) {
      numerator += count * (count - 1);
    }
    denominator += total * (total - 1);
  }
  return denominator > 0 ? (ALPHABET_SIZE * numerator) / denominator : 0;
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
  if (autokey.ioc >= AUTOKEY_DELTA_IOC && ioc < MONO_IOC) {
    likelyFamily = "ciphertext-autokey";
  } else if (ioc >= MONO_IOC) {
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
    autokeyDeltaIoc: autokey.ioc,
    autokeyLag: autokey.lag,
    likelyFamily,
  };
}
