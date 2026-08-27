// ABOUTME: Unit tests for the substitution cipher solver.
// ABOUTME: Encrypts English text with a known alphabet and checks the hill climb recovers it.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { substitution } from "./cipher";
import { breakSubstitution, quadgramScore } from "./solve-substitution";

const TABLE = new Uint8Array(
  readFileSync(
    new URL("../../public/data/english-quadgrams.bin", import.meta.url),
  ),
);

/** Deterministic PRNG so the hill climb's restarts are reproducible in tests. */
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
  "It was a bright cold day in April, and the clocks were striking thirteen. " +
  "Winston Smith, his chin nuzzled into his breast in an effort to escape the " +
  "vile wind, slipped quickly through the glass doors of Victory Mansions, " +
  "though not quickly enough to prevent a swirl of gritty dust from entering " +
  "along with him. The hallway smelt of boiled cabbage and old rag mats. At " +
  "one end of it a coloured poster, too large for indoor display, had been " +
  "tacked to the wall. It depicted simply an enormous face, more than a metre " +
  "wide: the face of a man of about forty-five, with a heavy black moustache " +
  "and ruggedly handsome features.";

describe("quadgramScore", () => {
  it("scores English text higher than uniform random letters", () => {
    const random = "XQZWKVJPYGXQZWKVJPYGXQZWKVJPYGXQZWKVJPYG";
    expect(quadgramScore(PLAIN, TABLE)).toBeGreaterThan(
      quadgramScore(random, TABLE),
    );
  });

  it("throws when the text has fewer than four letters", () => {
    expect(() => quadgramScore("abc", TABLE)).toThrow();
  });
});

describe("breakSubstitution", () => {
  it("recovers a keyword-mixed alphabet from ciphertext alone", () => {
    const ciphertext = substitution(PLAIN, "zebras", "encrypt");
    const result = breakSubstitution(ciphertext, TABLE, { rng: mulberry32(1) });
    expect(substitution(ciphertext, result.key, "decrypt")).toBe(PLAIN);
  });

  it("recovers a fully scrambled alphabet", () => {
    const ciphertext = substitution(
      PLAIN,
      "QWERTYUIOPASDFGHJKLZXCVBNM",
      "encrypt",
    );
    const result = breakSubstitution(ciphertext, TABLE, { rng: mulberry32(2) });
    expect(substitution(ciphertext, result.key, "decrypt")).toBe(PLAIN);
  });

  it("returns a key that is a permutation of the alphabet", () => {
    const ciphertext = substitution(PLAIN, "zebras", "encrypt");
    const result = breakSubstitution(ciphertext, TABLE, { rng: mulberry32(3) });
    expect([...result.key].sort().join("")).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  });

  it("throws when the text has too few letters", () => {
    expect(() =>
      breakSubstitution("abc", TABLE, { rng: mulberry32(4) }),
    ).toThrow();
  });
});
