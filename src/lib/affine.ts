// ABOUTME: Affine cipher: each letter x becomes (a·x + b) mod 26, with a coprime to 26.
// ABOUTME: Includes a breaker that tries all 312 keys and ranks the decryptions by bigram fitness.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { substituteLetters, type Mode } from "./cipher";
import { scoreText } from "./solve";

const ALPHABET_SIZE = 26;

/** The twelve multipliers coprime to 26, the only ones that give a reversible cipher. */
export const AFFINE_MULTIPLIERS = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];

/** Multiplicative inverse of a modulo 26. */
function inverse(a: number): number {
  for (let candidate = 1; candidate < ALPHABET_SIZE; candidate += 1) {
    if ((a * candidate) % ALPHABET_SIZE === 1) {
      return candidate;
    }
  }
  throw new Error(
    `a must be coprime to 26 (one of ${AFFINE_MULTIPLIERS.join(", ")})`,
  );
}

function checkKey(a: number, b: number): void {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    throw new Error("a and b must be whole numbers");
  }
  inverse(((a % ALPHABET_SIZE) + ALPHABET_SIZE) % ALPHABET_SIZE);
}

/**
 * Encrypts or decrypts the affine cipher: E(x) = (a·x + b) mod 26 and
 * D(y) = a⁻¹·(y − b) mod 26. Letters keep their case; non-letters pass through.
 */
export function affine(text: string, a: number, b: number, mode: Mode): string {
  checkKey(a, b);
  const multiplier = ((a % ALPHABET_SIZE) + ALPHABET_SIZE) % ALPHABET_SIZE;
  if (mode === "encrypt") {
    return substituteLetters(text, [0], (x) => multiplier * x + b);
  }
  const aInverse = inverse(multiplier);
  return substituteLetters(text, [0], (y) => aInverse * (y - b));
}

export interface AffineCandidate {
  a: number;
  b: number;
  /** Average bigram log10 probability of the decrypted text; higher is more English-like. */
  fitness: number;
  plaintext: string;
}

/** Ranks all 312 affine keys by how English-like the decryption is. */
export function breakAffine(text: string): AffineCandidate[] {
  const candidates: AffineCandidate[] = [];
  for (const a of AFFINE_MULTIPLIERS) {
    for (let b = 0; b < ALPHABET_SIZE; b += 1) {
      const plaintext = affine(text, a, b, "decrypt");
      candidates.push({ a, b, fitness: scoreText(plaintext), plaintext });
    }
  }
  return candidates.sort((x, y) => y.fitness - x.fitness);
}
