// ABOUTME: Seeded fuzz of the auto-solver: random keys per cipher family, checking identification and recovery.
// ABOUTME: The solvers are statistical, so it asserts aggregate recovery rates rather than per-case perfection.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { autokey, beaufort, substitution, vigenere } from "./cipher";
import { autosolve } from "./autosolve";

const TABLE = new Uint8Array(
  readFileSync(
    new URL("../../public/data/english-quadgrams.bin", import.meta.url),
  ),
);

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLAIN =
  "It was a bright cold day in April and the clocks were striking thirteen " +
  "Winston Smith his chin nuzzled into his breast in an effort to escape the " +
  "vile wind slipped quickly through the glass doors of Victory Mansions though " +
  "not quickly enough to prevent a swirl of gritty dust from entering along with " +
  "him The hallway smelt of boiled cabbage and old rag mats At one end of it a " +
  "coloured poster too large for indoor display had been tacked to the wall It " +
  "depicted simply an enormous face more than a metre wide the face of a man";

const SAMPLES = 8;

function randomKey(rng: () => number, length: number): string {
  let key = "";
  for (let i = 0; i < length; i += 1) {
    key += String.fromCharCode(65 + Math.floor(rng() * 26));
  }
  return key;
}

function accuracy(recovered: string, expected: string): number {
  let matches = 0;
  for (let i = 0; i < expected.length; i += 1) {
    if (recovered[i] === expected[i]) {
      matches += 1;
    }
  }
  return matches / expected.length;
}

/** Runs the auto-solver on `samples` random-key encryptions and returns the mean accuracy. */
function meanRecovery(
  seed: number,
  keyLength: (rng: () => number) => number,
  encrypt: (key: string) => string,
  expectFamily?: string,
): number {
  const keyRng = mulberry32(seed);
  let total = 0;
  for (let i = 0; i < SAMPLES; i += 1) {
    const key = randomKey(keyRng, keyLength(keyRng));
    const result = autosolve(encrypt(key), TABLE, {
      rng: mulberry32(seed + 1000 + i),
    });
    if (expectFamily !== undefined) {
      expect(result.best.cipher).toBe(expectFamily);
    }
    total += accuracy(result.best.plaintext, PLAIN);
  }
  return total / SAMPLES;
}

describe("autosolve fuzz over random keys", () => {
  it("recovers Vigenère for random keys", { timeout: 120000 }, () => {
    const mean = meanRecovery(
      1,
      (rng) => 4 + Math.floor(rng() * 4),
      (k) => vigenere(PLAIN, k, "encrypt"),
    );
    expect(mean).toBeGreaterThan(0.98);
  });

  it("recovers Beaufort for random keys", { timeout: 120000 }, () => {
    const mean = meanRecovery(
      2,
      (rng) => 4 + Math.floor(rng() * 4),
      (k) => beaufort(PLAIN, k),
    );
    expect(mean).toBeGreaterThan(0.85);
  });

  it("recovers substitution for random keys", { timeout: 120000 }, () => {
    const mean = meanRecovery(
      3,
      (rng) => 5 + Math.floor(rng() * 4),
      (k) => substitution(PLAIN, k, "encrypt"),
    );
    expect(mean).toBeGreaterThan(0.98);
  });

  it(
    "recovers plaintext autokey exactly for random primers",
    { timeout: 120000 },
    () => {
      const mean = meanRecovery(
        4,
        (rng) => 3 + Math.floor(rng() * 4),
        (k) => autokey(PLAIN, k, "plaintext", "encrypt"),
        "Plaintext autokey",
      );
      expect(mean).toBe(1);
    },
  );

  it(
    "recovers ciphertext autokey past the primer for random primers",
    { timeout: 120000 },
    () => {
      const mean = meanRecovery(
        5,
        (rng) => 3 + Math.floor(rng() * 4),
        (k) => autokey(PLAIN, k, "ciphertext", "encrypt"),
        "Ciphertext autokey",
      );
      expect(mean).toBeGreaterThan(0.9);
    },
  );
});
