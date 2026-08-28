// ABOUTME: Tests for the ciphertext autokey solver.
// ABOUTME: Encrypts with a known primer and checks the plaintext is recovered without it.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { autokey } from "./cipher";
import { breakCiphertextAutokey, breakPlaintextAutokey } from "./solve-autokey";

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TABLE = new Uint8Array(
  readFileSync(
    new URL("../../public/data/english-quadgrams.bin", import.meta.url),
  ),
);

const PLAIN =
  "It was a bright cold day in April, and the clocks were striking thirteen. " +
  "Winston Smith, his chin nuzzled into his breast in an effort to escape the " +
  "vile wind, slipped quickly through the glass doors of Victory Mansions.";

function accuracy(recovered: string, expected: string): number {
  let matches = 0;
  for (let i = 0; i < expected.length; i += 1) {
    if (recovered[i] === expected[i]) {
      matches += 1;
    }
  }
  return matches / expected.length;
}

describe("breakCiphertextAutokey", () => {
  it("recovers plaintext from a short primer without knowing it", () => {
    const ciphertext = autokey(PLAIN, "X", "ciphertext", "encrypt");
    const result = breakCiphertextAutokey(ciphertext, TABLE);
    expect(result.primerLength).toBe(1);
    expect(accuracy(result.plaintext, PLAIN)).toBeGreaterThan(0.97);
  });

  it("recovers plaintext from a longer primer and finds its length", () => {
    const ciphertext = autokey(PLAIN, "TYPEWRITER", "ciphertext", "encrypt");
    const result = breakCiphertextAutokey(ciphertext, TABLE);
    expect(result.primerLength).toBe(10);
    // Everything past the primer is recovered exactly from the difference.
    expect(accuracy(result.plaintext, PLAIN)).toBeGreaterThan(0.95);
    expect(result.plaintext.slice(40)).toBe(PLAIN.slice(40));
  });

  it("preserves case and punctuation", () => {
    const ciphertext = autokey(
      "Attack at Dawn, and hold the line until dusk.",
      "KEY",
      "ciphertext",
      "encrypt",
    );
    const result = breakCiphertextAutokey(ciphertext, TABLE);
    expect(result.plaintext.slice(10)).toBe(
      "Dawn, and hold the line until dusk.",
    );
  });

  it("throws on text with too few letters", () => {
    expect(() => breakCiphertextAutokey("abc", TABLE)).toThrow();
  });
});

describe("breakPlaintextAutokey", () => {
  it(
    "recovers plaintext exactly from a short primer",
    { timeout: 60000 },
    () => {
      const ciphertext = autokey(PLAIN, "X", "plaintext", "encrypt");
      const result = breakPlaintextAutokey(ciphertext, TABLE, {
        rng: mulberry32(1),
      });
      expect(result.primerLength).toBe(1);
      expect(result.plaintext).toBe(PLAIN);
    },
  );

  it(
    "recovers plaintext and finds a longer primer length",
    { timeout: 60000 },
    () => {
      const ciphertext = autokey(PLAIN, "SECRET", "plaintext", "encrypt");
      const result = breakPlaintextAutokey(ciphertext, TABLE, {
        rng: mulberry32(2),
      });
      expect(result.primerLength).toBe(6);
      expect(result.plaintext).toBe(PLAIN);
    },
  );

  it("throws on text with too few letters", () => {
    expect(() =>
      breakPlaintextAutokey("abc", TABLE, { rng: mulberry32(3) }),
    ).toThrow();
  });
});
