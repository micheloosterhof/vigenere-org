// ABOUTME: Interprets recovered mixed alphabets as keyword alphabets: fixes their rotation and names the key.
// ABOUTME: A solved alphabet is only defined up to rotation; the author's form has the ascending tail at the end.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { scoreText } from "./solve";

const ALPHABET_SIZE = 26;

export interface RecoveredKey {
  /** The period key as letters, one per column offset. */
  key: string;
  /** The indicator letter whose key reads most like English. */
  indicator: string;
  /** Average bigram log10 probability of the key letters. */
  fitness: number;
}

/** Length of the strictly ascending run that ends the string. */
function ascendingSuffix(alphabet: string): number {
  let length = 1;
  while (
    length < alphabet.length &&
    alphabet[alphabet.length - length - 1] < alphabet[alphabet.length - length]
  ) {
    length += 1;
  }
  return length;
}

/**
 * Rotates a mixed alphabet into its keyword form. Rotating an alphabet does
 * not change the decryption it produces, so a solver can only recover it up to
 * rotation; a keyword-mixed alphabet (keyword first, the unused letters in
 * order) is the rotation whose ascending tail is longest.
 */
export function normalizeMixedAlphabet(alphabet: string): string {
  let best = alphabet;
  let bestSuffix = ascendingSuffix(alphabet);
  for (let by = 1; by < alphabet.length; by += 1) {
    const rotated = alphabet.slice(by) + alphabet.slice(0, by);
    const suffix = ascendingSuffix(rotated);
    if (suffix > bestSuffix) {
      best = rotated;
      bestSuffix = suffix;
    }
  }
  return best;
}

// The units of Z26: valid decimation steps through an alphabet.
const UNITS = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];

/**
 * Rewrites a solved Quagmire III into the author's form. A solver pins the
 * alphabet only up to an affine reindexing: decimating it by any unit m (and
 * dividing the offsets by m) decrypts identically. Trying every unit and
 * rotation, the reindexing with the longest ascending tail is the
 * keyword-mixed original.
 */
export function normalizeQuagmireSolution(
  alphabet: string,
  offsets: number[],
): { alphabet: string; offsets: number[] } {
  let best = { alphabet, offsets, suffix: -1 };
  for (const m of UNITS) {
    const mInverse = UNITS.find((u) => (u * m) % ALPHABET_SIZE === 1) as number;
    const decimated = Array.from(
      { length: ALPHABET_SIZE },
      (_, i) => alphabet[(m * i) % ALPHABET_SIZE],
    ).join("");
    const rotated = normalizeMixedAlphabet(decimated);
    const suffix = ascendingSuffix(rotated);
    if (suffix > best.suffix) {
      best = {
        alphabet: rotated,
        offsets: offsets.map((o) => (mInverse * o) % ALPHABET_SIZE),
        suffix,
      };
    }
  }
  return { alphabet: best.alphabet, offsets: best.offsets };
}

const STRAIGHT = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Names the period key of a solved Quagmire. Each column offset is the key
 * letter's index in the ciphertext alphabet minus the indicator's index in
 * the plaintext alphabet — the variant decides which of those alphabets is
 * the mixed one — so every indicator choice yields a candidate key; the one
 * reading most like English wins. One-letter keys carry no signal and default
 * to indicator A.
 */
export function recoverQuagmireKey(
  alphabet: string,
  offsets: number[],
  variant: 1 | 2 | 3 = 3,
): RecoveredKey {
  const plainAlphabet = variant === 2 ? STRAIGHT : alphabet;
  const cipherAlphabet = variant === 1 ? STRAIGHT : alphabet;
  const candidate = (indicator: number): string =>
    offsets
      .map((offset) => cipherAlphabet[(offset + indicator) % ALPHABET_SIZE])
      .join("");

  if (offsets.length < 2) {
    const indicatorIndex = plainAlphabet.indexOf("A");
    return {
      key: candidate(indicatorIndex),
      indicator: "A",
      fitness: 0,
    };
  }

  let best: RecoveredKey = { key: "", indicator: "A", fitness: -Infinity };
  for (let indicator = 0; indicator < ALPHABET_SIZE; indicator += 1) {
    const key = candidate(indicator);
    const fitness = scoreText(key);
    if (fitness > best.fitness) {
      best = { key, indicator: plainAlphabet[indicator], fitness };
    }
  }
  return best;
}
