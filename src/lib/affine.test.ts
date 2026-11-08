// ABOUTME: Unit tests for the affine cipher and its exhaustive breaker.
// ABOUTME: Vectors are Wikipedia's "Affine cipher" example and pycipher 0.5.2's tests/test_affine.py.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { affine, breakAffine } from "./affine";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

describe("affine", () => {
  it("encrypts the Wikipedia AFFINE CIPHER example (a=5, b=8)", () => {
    expect(affine("AFFINE CIPHER", 5, 8, "encrypt")).toBe("IHHWVC SWFRCP");
  });

  it("matches pycipher's encryption vectors", () => {
    const vectors: [number, number, string][] = [
      [1, 7, "hijklmnopqrstuvwxyzabcdefg"],
      [3, 3, "dgjmpsvybehknqtwzcfiloruxa"],
      [5, 0, "afkpuzejotydinsxchmrwbglqv"],
      [7, 14, "ovcjqxelszgnubipwdkryfmtah"],
      [9, 18, "sbktcludmvenwfoxgpyhqziraj"],
      [23, 15, "pmjgdaxurolifczwtqnkhebyvs"],
    ];
    for (const [a, b, expected] of vectors) {
      expect(affine(ALPHABET, a, b, "encrypt")).toBe(expected);
    }
  });

  it("matches pycipher's decryption vectors", () => {
    const ciphertext = "pmjgdaxurolifczwtqnkhebyvs";
    const vectors: [number, number, string][] = [
      [7, 3, "yfmtahovcjqxelszgnubipwdkr"],
      [3, 25, "onmlkjihgfedcbazyxwvutsrqp"],
      [9, 12, "jarizqhypgxofwnevmdulctkbs"],
      [19, 18, "tmfyrkdwpibungzslexqjcvoha"],
    ];
    for (const [a, b, expected] of vectors) {
      expect(affine(ciphertext, a, b, "decrypt")).toBe(expected);
    }
  });

  it("round-trips and keeps case and punctuation", () => {
    const text = "Attack at dawn, 6 AM!";
    expect(affine(affine(text, 17, 20, "encrypt"), 17, 20, "decrypt")).toBe(
      text,
    );
  });

  it("rejects a multiplier that shares a factor with 26", () => {
    expect(() => affine("HELLO", 13, 1, "encrypt")).toThrow(/coprime/);
    expect(() => affine("HELLO", 4, 1, "encrypt")).toThrow(/coprime/);
  });
});

describe("breakAffine", () => {
  it("recovers the key from a sentence of English", () => {
    const plain =
      "It was a bright cold day in April, and the clocks were striking thirteen.";
    const [best] = breakAffine(affine(plain, 11, 4, "encrypt"));
    expect([best.a, best.b]).toEqual([11, 4]);
    expect(best.plaintext).toBe(plain);
  });

  it("ranks all 312 keys", () => {
    expect(breakAffine("HELLO WORLD")).toHaveLength(312);
  });
});
