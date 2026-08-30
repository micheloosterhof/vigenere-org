// ABOUTME: Tests for the Quagmire III solver built on the general polyalphabetic solver.
// ABOUTME: Confirms Quagmire ciphertext is recovered and identified; the general solver needs long text.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { quagmire } from "./quagmire";
import { breakQuagmire } from "./solve-quagmire";

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

// The general solver needs roughly two hundred letters per column, so the
// tests use a long, natural passage (from "Nineteen Eighty-Four").
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

describe("breakQuagmire", () => {
  it("breaks and identifies a Quagmire III cipher", { timeout: 120000 }, () => {
    const config = {
      variant: 3,
      keyword: "KRYPTOS",
      key: "TALE",
      indicator: "K",
    } as const;
    const ciphertext = quagmire(PLAIN, config, "encrypt");
    const result = breakQuagmire(ciphertext, TABLE, { rng: mulberry32(1) });
    expect(result.isQuagmire).toBe(true);
    expect(result.period).toBe(4);
    expect(result.plaintext).toBe(PLAIN);
    expect(result.alphabet).toBe("KRYPTOSABCDEFGHIJLMNQUVWXZ");
    expect(result.key).toBe("TALE");
    expect(result.indicator).toBe("K");
  });

  it(
    "recovers a Quagmire III with a different keyword and key",
    { timeout: 120000 },
    () => {
      const config = {
        variant: 3,
        keyword: "PALIMPSEST",
        key: "LEMON",
        indicator: "P",
      } as const;
      const ciphertext = quagmire(PLAIN, config, "encrypt");
      const result = breakQuagmire(ciphertext, TABLE, { rng: mulberry32(2) });
      expect(result.isQuagmire).toBe(true);
      expect(result.plaintext).toBe(PLAIN);
    },
  );
});
