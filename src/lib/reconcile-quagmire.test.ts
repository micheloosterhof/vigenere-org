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

const LONG_PLAIN =
  PLAIN +
  " though not quickly enough to prevent a swirl of gritty dust from entering " +
  "along with him. The hallway smelt of boiled cabbage and old rag mats. At " +
  "one end of it a coloured poster, too large for indoor display, had been " +
  "tacked to the wall. It depicted simply an enormous face, more than a metre " +
  "wide: the face of a man of about forty-five, with a heavy black moustache " +
  "and ruggedly handsome features. Winston made for the stairs. It was no use " +
  "trying the lift. Even at the best of times it was seldom working, and at " +
  "present the electric current was cut off during daylight hours. It was " +
  "part of the economy drive in preparation for Hate Week. The flat was seven " +
  "flights up, and Winston, who was thirty-nine and had a varicose ulcer " +
  "above his right ankle, went slowly, resting several times on the way.";

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

  it("fits when some columns have a letter decrypted wrongly throughout", () => {
    const config = {
      variant: 3,
      keyword: "KRYPTOS",
      key: "PALIMPSEST",
      indicator: "K",
    } as const;
    const cipher = toValues(quagmire(LONG_PLAIN, config, "encrypt"));
    const plain = toValues(LONG_PLAIN);
    // The general solver errs by column: it takes one ciphertext letter of a
    // column for another plaintext letter at every place it occurs.
    const noisy = [...plain];
    const swapInColumn = (column: number, a: string, b: string): void => {
      const [first, second] = [a, b].map((c) => c.charCodeAt(0) - 65);
      let changed = 0;
      for (let i = column; i < plain.length; i += 10) {
        if (plain[i] === first || plain[i] === second) {
          noisy[i] = plain[i] === first ? second : first;
          changed += 1;
        }
      }
      // Each wrong pairing must recur, or it would be dropped as a stray.
      expect(changed).toBeGreaterThanOrEqual(4);
    };
    swapInColumn(1, "W", "Y");
    swapInColumn(4, "C", "U");
    swapInColumn(6, "G", "D");
    swapInColumn(9, "M", "C");
    const result = reconcileSharedAlphabet(cipher, noisy, 10);
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
