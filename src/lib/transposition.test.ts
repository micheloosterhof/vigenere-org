// ABOUTME: Unit tests for the columnar transposition cipher and its breaker.
// ABOUTME: The encryption vector is the irregular-columnar ZEBRAS example from Wikipedia's "Transposition cipher".
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { breakColumnar, columnarTransposition } from "./transposition";

const PLAIN =
  "It was a bright cold day in April, and the clocks were striking thirteen. " +
  "Winston Smith, his chin nuzzled into his breast in an effort to escape the " +
  "vile wind, slipped quickly through the glass doors of Victory Mansions.";

describe("columnarTransposition", () => {
  it("encrypts the Wikipedia ZEBRAS test vector", () => {
    expect(
      columnarTransposition("WEAREDISCOVEREDFLEEATONCE", "ZEBRAS", "encrypt"),
    ).toBe("EVLNACDTESEAROFODEECWIREE");
  });

  it("decrypts the Wikipedia ZEBRAS test vector", () => {
    expect(
      columnarTransposition("EVLNACDTESEAROFODEECWIREE", "ZEBRAS", "decrypt"),
    ).toBe("WEAREDISCOVEREDFLEEATONCE");
  });

  it("round-trips text with punctuation and a repeated-letter key", () => {
    for (const key of ["BANANA", "SECRET", "AB"]) {
      const ciphertext = columnarTransposition(PLAIN, key, "encrypt");
      expect(columnarTransposition(ciphertext, key, "decrypt")).toBe(PLAIN);
    }
  });

  it("ranks repeated key letters left to right", () => {
    // BB reads the columns in writing order, so two columns swap nothing.
    expect(columnarTransposition("ABCD", "BB", "encrypt")).toBe("ACBD");
  });

  it("throws on a key with no letters", () => {
    expect(() => columnarTransposition("ABC", "", "encrypt")).toThrow();
  });
});

describe("breakColumnar", () => {
  // Spaces and punctuation are invisible to bigram fitness, so their placement
  // cannot be recovered; the breaker is exact only on letters-only ciphertext.
  const LETTERS = PLAIN.toUpperCase().replace(/[^A-Z]/g, "");

  it("recovers the column order and plaintext from English text", () => {
    const ciphertext = columnarTransposition(LETTERS, "SECRET", "encrypt");
    const [best] = breakColumnar(ciphertext);
    expect(best.plaintext).toBe(LETTERS);
    expect(best.keyLength).toBe(6);
    // The canonical key reproduces the same column order as SECRET.
    expect(best.key).toBe("EBADCF");
  });

  it("returns candidates the tool can decrypt with", () => {
    const ciphertext = columnarTransposition(LETTERS, "ZEBRAS", "encrypt");
    const [best] = breakColumnar(ciphertext);
    expect(columnarTransposition(ciphertext, best.key, "decrypt")).toBe(
      LETTERS,
    );
  });
});
