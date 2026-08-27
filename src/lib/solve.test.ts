// ABOUTME: Unit tests for the periodic-cipher breaker and Caesar brute force.
// ABOUTME: Uses text encrypted with the cipher core and checks the key is recovered.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { beaufort, vigenere, caesar } from "./cipher";
import {
  beaufortDecrypt,
  breakPeriodic,
  caesarCandidates,
  scoreText,
  vigenereDecrypt,
} from "./solve";

const PLAIN =
  "It was a bright cold day in April, and the clocks were striking thirteen. " +
  "Winston Smith, his chin nuzzled into his breast in an effort to escape the " +
  "vile wind, slipped quickly through the glass doors of Victory Mansions, " +
  "though not quickly enough to prevent a swirl of gritty dust from entering " +
  "along with him. The hallway smelt of boiled cabbage and old rag mats.";

describe("scoreText", () => {
  it("scores English text higher than uniform random letters", () => {
    const random =
      "XQZWKVJPYGXQZWKVJPYGXQZWKVJPYGXQZWKVJPYGXQZWKVJPYGXQZWKVJPYG";
    expect(scoreText(PLAIN)).toBeGreaterThan(scoreText(random));
  });
});

describe("breakPeriodic", () => {
  it("recovers a Vigenere key and its length", () => {
    const ciphertext = vigenere(PLAIN, "LEMON", "encrypt");
    const [best] = breakPeriodic(ciphertext, vigenereDecrypt);
    expect(best.key).toBe("LEMON");
    expect(best.keyLength).toBe(5);
  });

  it("recovers a longer Vigenere key", () => {
    const ciphertext = vigenere(PLAIN, "FORTIFICATION", "encrypt");
    const [best] = breakPeriodic(ciphertext, vigenereDecrypt);
    expect(best.key).toBe("FORTIFICATION");
  });

  it("recovers a Beaufort key", () => {
    const ciphertext = beaufort(PLAIN, "SECRET");
    const [best] = breakPeriodic(ciphertext, beaufortDecrypt);
    expect(best.key).toBe("SECRET");
  });

  it("prefers the true key length over its multiples", () => {
    const ciphertext = vigenere(PLAIN, "LEMON", "encrypt");
    const candidates = breakPeriodic(ciphertext, vigenereDecrypt);
    expect(candidates[0].keyLength).toBe(5);
  });

  it("recovers a single-letter key", () => {
    const ciphertext = vigenere(PLAIN, "Q", "encrypt");
    const [best] = breakPeriodic(ciphertext, vigenereDecrypt);
    expect(best.key).toBe("Q");
  });

  it("throws when the text has too few letters", () => {
    expect(() => breakPeriodic("a!", vigenereDecrypt)).toThrow();
  });
});

describe("caesarCandidates", () => {
  it("ranks the correct shift first and returns all 26", () => {
    const ciphertext = caesar(
      "The quick brown fox jumps over the lazy dog.",
      7,
    );
    const candidates = caesarCandidates(ciphertext);
    expect(candidates).toHaveLength(26);
    expect(candidates[0].shift).toBe(7);
  });
});
