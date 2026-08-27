// ABOUTME: Unit tests for the general periodic polyalphabetic solver.
// ABOUTME: Generates Quagmire and random-alphabet ciphertexts and checks blind recovery.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { vigenere } from "./cipher";
import { quagmire } from "./quagmire";
import { breakPolyalphabetic, detectPeriod } from "./solve-polyalphabetic";

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
  "and ruggedly handsome features. Winston made for the stairs. It was no use " +
  "trying the lift. Even at the best of times it was seldom working, and at " +
  "present the electric current was cut off during daylight hours. It was " +
  "part of the economy drive in preparation for Hate Week. The flat was seven " +
  "flights up, and Winston, who was thirty-nine and had a varicose ulcer " +
  "above his right ankle, went slowly, resting several times on the way. On " +
  "each landing, opposite the lift shaft, the poster with the enormous face " +
  "gazed from the wall. It was one of those pictures which are so contrived " +
  "that the eyes follow you about when you move. Big Brother is watching you, " +
  "the caption beneath it ran.";

/** Encrypts with an arbitrary per-column substitution, the general cipher slippery attacks. */
function encryptRandomPolyalphabetic(
  text: string,
  alphabets: number[][],
): string {
  let column = 0;
  return [...text]
    .map((char) => {
      const upper = char.toUpperCase();
      if (upper < "A" || upper > "Z") {
        return char;
      }
      const cipherValue =
        alphabets[column % alphabets.length][upper.charCodeAt(0) - 65];
      column += 1;
      const output = String.fromCharCode(65 + cipherValue);
      return char === upper ? output : output.toLowerCase();
    })
    .join("");
}

function randomAlphabets(period: number, rng: () => number): number[][] {
  return Array.from({ length: period }, () => {
    const alphabet = Array.from({ length: 26 }, (_, i) => i);
    for (let i = alphabet.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [alphabet[i], alphabet[j]] = [alphabet[j], alphabet[i]];
    }
    return alphabet;
  });
}

describe("detectPeriod", () => {
  it("finds the period of a Quagmire III ciphertext", () => {
    const ciphertext = quagmire(
      PLAIN,
      { variant: 3, keyword: "PAULBRANDT", key: "BRANDT", indicator: "P" },
      "encrypt",
    );
    expect(detectPeriod(ciphertext)).toBe(6);
  });

  it("finds the true period on short ciphertext, not a multiple", () => {
    const short = PLAIN.slice(0, 360);
    expect(detectPeriod(vigenere(short, "LEMON", "encrypt"))).toBe(5);
  });

  it("reports period 1 for a monoalphabetic ciphertext", () => {
    expect(detectPeriod(PLAIN)).toBe(1);
  });

  it("throws when the text has too few letters", () => {
    expect(() => detectPeriod("abc")).toThrow();
  });
});

/**
 * Fraction of characters recovered correctly. Quadgram statistics cannot pin
 * genuinely ambiguous rare letters ("nuzzled" scores below "numbled"), so
 * exact recovery is not a fair bar; near-perfect is.
 */
function accuracy(recovered: string, expected: string): number {
  let matches = 0;
  for (let i = 0; i < expected.length; i += 1) {
    if (recovered[i] === expected[i]) {
      matches += 1;
    }
  }
  return matches / expected.length;
}

describe("breakPolyalphabetic", () => {
  it(
    "breaks a Quagmire III ciphertext without knowing the keywords",
    { timeout: 120000 },
    () => {
      const ciphertext = quagmire(
        PLAIN,
        { variant: 3, keyword: "PAULBRANDT", key: "TALE", indicator: "P" },
        "encrypt",
      );
      const result = breakPolyalphabetic(ciphertext, TABLE, {
        restarts: 3,
        rng: mulberry32(1),
      });
      expect(result.period).toBe(4);
      expect(
        result.plaintext.startsWith("It was a bright cold day in April"),
      ).toBe(true);
      expect(accuracy(result.plaintext, PLAIN)).toBeGreaterThan(0.98);
    },
  );

  it(
    "breaks a cipher with fully random independent alphabets",
    { timeout: 120000 },
    () => {
      const rng = mulberry32(2);
      const ciphertext = encryptRandomPolyalphabetic(
        PLAIN,
        randomAlphabets(3, rng),
      );
      const result = breakPolyalphabetic(ciphertext, TABLE, {
        restarts: 3,
        rng,
      });
      expect(result.period).toBe(3);
      expect(accuracy(result.plaintext, PLAIN)).toBeGreaterThan(0.98);
    },
  );

  it("honors a caller-supplied period", { timeout: 120000 }, () => {
    const ciphertext = quagmire(
      PLAIN,
      { variant: 3, keyword: "PAULBRANDT", key: "TALE", indicator: "P" },
      "encrypt",
    );
    const result = breakPolyalphabetic(ciphertext, TABLE, {
      period: 4,
      restarts: 3,
      rng: mulberry32(3),
    });
    expect(accuracy(result.plaintext, PLAIN)).toBeGreaterThan(0.98);
  });

  it("throws when the text has too few letters", () => {
    expect(() =>
      breakPolyalphabetic("abc", TABLE, { rng: mulberry32(4) }),
    ).toThrow();
  });
});
