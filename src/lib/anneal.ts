// ABOUTME: Simulated annealing over cipher keys, scored by English quadgram statistics of the decryption.
// ABOUTME: Shared by the Bifid, Trifid, and double transposition breakers; randomness is injected.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import {
  QUADGRAM_LOG10_SCALE,
  QUADGRAM_MIN_LOG10,
  QUADGRAM_TABLE_SIZE,
} from "./data/english-quadgrams-meta";

const ALPHABET_SIZE = 26;

/**
 * Sum of quantized quadgram scores over `values` (letters 0-25). Values of 26
 * or more (a Trifid "+", a transposed space) are skipped, so the windows run
 * over the letters alone.
 */
export function quadgramRaw(
  values: ArrayLike<number>,
  length: number,
  table: Uint8Array,
): number {
  let sum = 0;
  let index = 0;
  let letters = 0;
  for (let i = 0; i < length; i += 1) {
    const value = values[i];
    if (value >= ALPHABET_SIZE) {
      continue;
    }
    index = (index * ALPHABET_SIZE + value) % QUADGRAM_TABLE_SIZE;
    letters += 1;
    if (letters >= 4) {
      sum += table[index];
    }
  }
  return sum;
}

/** Converts a raw quadgram sum over `quadgrams` windows to average log10 probability. */
export function averageLog10(raw: number, quadgrams: number): number {
  return (
    QUADGRAM_MIN_LOG10 + (raw / Math.max(1, quadgrams)) * QUADGRAM_LOG10_SCALE
  );
}

export interface AnnealProblem<Key> {
  /** A random starting key. */
  random(rng: () => number): Key;
  /** A slightly changed copy of the key. */
  neighbour(key: Key, rng: () => number): Key;
  /** Raw quadgram sum of the key's decryption; higher is better. */
  score(key: Key): number;
}

export interface AnnealOptions {
  rng: () => number;
  iterations: number;
  /** Starting temperature in raw quadgram units; it falls linearly to zero. */
  temperature: number;
  /** Called every so often with the fraction done. */
  onProgress?: (fraction: number) => void;
  /** Stops early once the best score reaches this. */
  target?: number;
}

export interface AnnealResult<Key> {
  key: Key;
  score: number;
}

/**
 * Simulated annealing: always accepts a better key and accepts a worse one
 * with probability exp(Δ/T), so the search can leave local maxima while the
 * temperature is high and settles as it cools. Returns the best key seen.
 */
export function anneal<Key>(
  problem: AnnealProblem<Key>,
  options: AnnealOptions,
): AnnealResult<Key> {
  const { rng, iterations, temperature, onProgress, target } = options;
  let current = problem.random(rng);
  let currentScore = problem.score(current);
  let best = current;
  let bestScore = currentScore;
  const reportEvery = Math.max(1, Math.floor(iterations / 50));
  for (let step = 0; step < iterations; step += 1) {
    const t = temperature * (1 - step / iterations);
    const candidate = problem.neighbour(current, rng);
    const score = problem.score(candidate);
    const delta = score - currentScore;
    if (delta >= 0 || (t > 0 && rng() < Math.exp(delta / t))) {
      current = candidate;
      currentScore = score;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
        if (target !== undefined && bestScore >= target) {
          break;
        }
      }
    }
    if (onProgress && step % reportEvery === 0) {
      onProgress(step / iterations);
    }
  }
  return { key: best, score: bestScore };
}

/** A small seeded generator (mulberry32), so each pool job is reproducible from its seed. */
export function seededRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random permutation of 0..size-1 (Fisher-Yates). */
export function randomPermutation(size: number, rng: () => number): number[] {
  const items = Array.from({ length: size }, (_, i) => i);
  for (let i = size - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** A copy of the permutation with two random entries swapped. */
export function swapTwo(items: number[], rng: () => number): number[] {
  const copy = [...items];
  const i = Math.floor(rng() * copy.length);
  let j = Math.floor(rng() * (copy.length - 1));
  if (j >= i) {
    j += 1;
  }
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}
