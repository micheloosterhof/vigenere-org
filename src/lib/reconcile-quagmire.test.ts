// ABOUTME: Tests for reconciling per-column decryptions into one shared Quagmire III alphabet.
// ABOUTME: A single mixed alphabet plus per-column shifts should fit; independent alphabets should not.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { quagmire } from "./quagmire";
import { reconcileSharedAlphabet } from "./reconcile-quagmire";

const PLAIN =
  "It was a bright cold day in April, and the clocks were striking thirteen. " +
  "Winston Smith, his chin nuzzled into his breast in an effort to escape the " +
  "vile wind, slipped quickly through the glass doors of Victory Mansions.";

function toValues(text: string): number[] {
  const values: number[] = [];
  for (const char of text.toUpperCase()) {
    const code = char.charCodeAt(0) - 65;
    if (code >= 0 && code < 26) {
      values.push(code);
    }
  }
  return values;
}

describe("reconcileSharedAlphabet", () => {
  it("fits a single alphabet to a Quagmire III cipher and its plaintext", () => {
    const config = {
      variant: 3,
      keyword: "KRYPTOS",
      key: "BALTIC",
      indicator: "K",
    } as const;
    const ciphertext = quagmire(PLAIN, config, "encrypt");
    const result = reconcileSharedAlphabet(
      toValues(ciphertext),
      toValues(PLAIN),
      6,
    );
    expect(result).not.toBeNull();
    // Re-decrypting through the shared alphabet reproduces the plaintext.
    expect(result?.decrypt(toValues(ciphertext))).toEqual(toValues(PLAIN));
    expect(result?.alphabet).toHaveLength(26);
    expect([...(result?.alphabet ?? "")].sort().join("")).toBe(
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    );
  });

  it("tolerates a few wrong plaintext letters and still fits", () => {
    const config = {
      variant: 3,
      keyword: "PAULBRANDT",
      key: "TALE",
      indicator: "P",
    } as const;
    const ciphertext = quagmire(PLAIN, config, "encrypt");
    const cipher = toValues(ciphertext);
    const plain = toValues(PLAIN);
    // Corrupt 3% of the plaintext, as an imperfect general-solver output would.
    const noisy = [...plain];
    for (let i = 0; i < noisy.length; i += 33) {
      noisy[i] = (noisy[i] + 1) % 26;
    }
    const result = reconcileSharedAlphabet(cipher, noisy, 4);
    expect(result).not.toBeNull();
    expect(result?.decrypt(cipher)).toEqual(plain);
  });

  it("returns null when the columns use genuinely independent alphabets", () => {
    // Encrypt each column with its own unrelated scrambled alphabet.
    const plain = toValues(PLAIN);
    const alphabets = [
      "QWERTYUIOPASDFGHJKLZXCVBNM",
      "MNBVCXZLKJHGFDSAPOIUYTREWQ",
      "ZYXWVUTSRQPONMLKJIHGFEDCBA",
    ].map((a) => [...a].map((c) => c.charCodeAt(0) - 65));
    const cipher = plain.map((p, i) => alphabets[i % 3][p]);
    const result = reconcileSharedAlphabet(cipher, plain, 3);
    expect(result).toBeNull();
  });
});
