// ABOUTME: Tests for the dynamic-programming search of Quagmire column shifts under a known alphabet.
// ABOUTME: Checks the ring solution against the true key, against random shifts, and against the open chain.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { seededRng } from "./anneal";
import { caesar, inverseAlphabet, mixedAlphabet } from "./cipher";
import { quagmire } from "./quagmire";
import { chainScore, ringShifts, shiftTable } from "./quagmire-shifts";
import { scoreLetterValues, toLetterValues } from "./solve";

const PLAIN =
  "It was a bright cold day in April, and the clocks were striking thirteen. " +
  "Winston Smith, his chin nuzzled into his breast in an effort to escape " +
  "the vile wind.";

const IDENTITY = Array.from({ length: 26 }, (_, i) => i);
const ALPHABET = mixedAlphabet("SPRING");
const INDEX = inverseAlphabet(ALPHABET);

function decrypt(
  table: Uint8Array,
  length: number,
  shifts: number[],
): number[] {
  return Array.from(
    { length },
    (_, i) => table[i * 26 + shifts[i % shifts.length]],
  );
}

/** Summed bigram log10 probability over every adjacent pair of letters. */
function bigramTotal(values: number[]): number {
  return scoreLetterValues(values) * (values.length - 1);
}

describe("ringShifts", () => {
  const cipher = toLetterValues(
    quagmire(
      PLAIN,
      { variant: 3, keyword: "SPRING", key: "TALE", indicator: "A" },
      "encrypt",
    ),
  );
  const table = shiftTable(cipher, INDEX, ALPHABET);

  it("recovers the plaintext of a Quagmire III text given its alphabet", () => {
    const { shifts, score } = ringShifts(table, cipher.length, 4);
    const plain = decrypt(table, cipher.length, shifts);
    expect(plain).toEqual(toLetterValues(PLAIN));
    expect(score).toBeCloseTo(bigramTotal(plain), 6);
  });

  it("scores at least as well as any shifts picked at random", () => {
    const rng = seededRng(7);
    for (const period of [2, 3, 5, 7]) {
      const { shifts, score } = ringShifts(table, cipher.length, period);
      expect(score).toBeCloseTo(
        bigramTotal(decrypt(table, cipher.length, shifts)),
        6,
      );
      for (let trial = 0; trial < 200; trial += 1) {
        const random = Array.from({ length: period }, () =>
          Math.floor(rng() * 26),
        );
        expect(
          bigramTotal(decrypt(table, cipher.length, random)),
        ).toBeLessThanOrEqual(score + 1e-9);
      }
    }
  });

  it("solves a single column as a plain shift", () => {
    const shifted = toLetterValues(caesar(PLAIN, 3));
    const { shifts } = ringShifts(
      shiftTable(shifted, IDENTITY, IDENTITY),
      shifted.length,
      1,
    );
    expect(shifts).toEqual([3]);
  });
});

describe("chainScore", () => {
  const cipher = toLetterValues(
    quagmire(
      PLAIN,
      { variant: 3, keyword: "SPRING", key: "TALE", indicator: "A" },
      "encrypt",
    ),
  );
  const table = shiftTable(cipher, INDEX, ALPHABET);

  it("is the ring score with the links from the last column to the first left out", () => {
    const { shifts } = ringShifts(table, cipher.length, 4);
    const plain = decrypt(table, cipher.length, shifts);
    let open = 0;
    for (let i = 0; i + 1 < plain.length; i += 1) {
      if (i % 4 !== 3) {
        open += bigramTotal([plain[i], plain[i + 1]]);
      }
    }
    // The true shifts are also the open chain's best here.
    expect(chainScore(table, cipher.length, 4)).toBeCloseTo(open, 6);
  });

  it("equals the ring score for a single column", () => {
    expect(chainScore(table, cipher.length, 1)).toBeCloseTo(
      ringShifts(table, cipher.length, 1).score,
      6,
    );
  });

  it("ranks the true alphabet above the unmixed one", () => {
    const plainAlphabet = shiftTable(cipher, IDENTITY, IDENTITY);
    expect(chainScore(table, cipher.length, 4)).toBeGreaterThan(
      chainScore(plainAlphabet, cipher.length, 4),
    );
  });
});
