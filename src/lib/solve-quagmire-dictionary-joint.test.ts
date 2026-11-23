// ABOUTME: Tests for the Quagmire dictionary attack that solves the column shifts together.
// ABOUTME: Kryptos K1 is the case it exists for: 63 letters at period 10, six letters per column.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seededRng } from "./anneal";
import {
  annealJointFinalists,
  breakQuagmireDictionaryJoint,
  climbJointCandidates,
  decideJoint,
  distinctAlphabets,
  finishJoint,
  jointPeriods,
  jointShortlist,
  ringJointCandidates,
  scanJointCandidates,
} from "./solve-quagmire-dictionary-joint";

const TABLE = new Uint8Array(
  readFileSync(
    new URL("../../public/data/english-quadgrams.bin", import.meta.url),
  ),
);

const WORDS = readFileSync(
  new URL("../../public/data/english-words.txt", import.meta.url),
  "utf8",
)
  .split("\n")
  .filter((word) => word !== "");

// Kryptos K1 as carved: Quagmire III, alphabet keyword KRYPTOS, period key
// PALIMPSEST. The plaintext keeps Sanborn's misspelling IQLUSION.
const KRYPTOS_K1 =
  "EMUFPHZLRFAXYUSDJKZLDKRNSHGNFIVJYQTQUXQBQVYUVLLTREVJYQTMKYRDMFD";
const K1_PLAIN =
  "BETWEENSUBTLESHADINGANDTHEABSENCEOFLIGHTLIESTHENUANCEOFIQLUSION";

// A twentieth of the word list, for the tests that scan every period.
const FEW_WORDS = WORDS.filter((_, i) => i % 20 === 0);

describe("breakQuagmireDictionaryJoint", () => {
  it("breaks Kryptos K1 at its period", { timeout: 120000 }, () => {
    const result = breakQuagmireDictionaryJoint(KRYPTOS_K1, WORDS, TABLE, {
      period: 10,
      rng: seededRng(1),
    });
    expect(result.found).toBe(true);
    expect(result.variant).toBe(3);
    expect(result.keyword).toBe("KRYPTOS");
    expect(result.period).toBe(10);
    expect(result.plaintext).toBe(K1_PLAIN);
    expect(result.key).toBe("PALIMPSEST");
  });

  it("finds the period itself", { timeout: 120000 }, () => {
    const result = breakQuagmireDictionaryJoint(
      KRYPTOS_K1,
      [...FEW_WORDS, "KRYPTOS"],
      TABLE,
      // A seed for which a ranking that starts from random shifts loses the
      // keyword among the other periods' candidates.
      { rng: seededRng(6) },
    );
    expect(result.found).toBe(true);
    expect(result.keyword).toBe("KRYPTOS");
    expect(result.period).toBe(10);
    expect(result.plaintext).toBe(K1_PLAIN);
  });

  it(
    "reports not found when the keyword is outside the dictionary",
    { timeout: 120000 },
    () => {
      const result = breakQuagmireDictionaryJoint(
        KRYPTOS_K1,
        WORDS.filter((word) => word.toUpperCase() !== "KRYPTOS"),
        TABLE,
        { period: 10, rng: seededRng(3) },
      );
      expect(result.found).toBe(false);
    },
  );

  it("reports search progress", { timeout: 120000 }, () => {
    const words = WORDS.slice(0, 40);
    const seen: number[] = [];
    breakQuagmireDictionaryJoint(KRYPTOS_K1, words, TABLE, {
      period: 10,
      rng: seededRng(4),
      onProgress: (done, total) => {
        seen.push(done);
        expect(total).toBe(words.length);
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(words.length);
  });

  it("refuses text whose columns all hold enough letters for the per-column attack", () => {
    expect(() =>
      breakQuagmireDictionaryJoint(KRYPTOS_K1.repeat(7), WORDS, TABLE),
    ).toThrow(/too long/);
  });

  it("throws on text with too few letters", () => {
    expect(() => breakQuagmireDictionaryJoint("ABC", WORDS, TABLE)).toThrow();
  });
});

describe("the joint attack in parts", () => {
  it(
    "gives the same answer when the alphabets are scanned in separate parts",
    { timeout: 120000 },
    () => {
      const words = [...WORDS.filter((_, i) => i % 60 === 0), "KRYPTOS"];
      const whole = breakQuagmireDictionaryJoint(KRYPTOS_K1, words, TABLE, {
        period: 10,
        rng: seededRng(6),
      });
      const periods = jointPeriods(KRYPTOS_K1.length, { period: 10 });
      const alphabets = distinctAlphabets(words);
      const candidates = [0, 1, 2].flatMap((part) =>
        scanJointCandidates(
          KRYPTOS_K1,
          alphabets.filter((_, i) => i % 3 === part),
          periods,
        ),
      );
      const joined = finishJoint(KRYPTOS_K1, candidates, TABLE, {
        rng: seededRng(6),
      });
      expect(joined.keyword).toBe("KRYPTOS");
      expect(joined).toEqual(whole);
    },
  );

  it(
    "gives the same answer when the ring solutions are found, and the finalists annealed, in separate parts",
    { timeout: 120000 },
    () => {
      const words = [...WORDS.filter((_, i) => i % 60 === 0), "KRYPTOS"];
      const candidates = scanJointCandidates(
        KRYPTOS_K1,
        distinctAlphabets(words),
        jointPeriods(KRYPTOS_K1.length, {}),
      );
      const whole = finishJoint(KRYPTOS_K1, candidates, TABLE, {
        rng: seededRng(6),
      });
      const shortlist = jointShortlist(candidates);
      const ring = [1, 2, 0].flatMap((part) =>
        ringJointCandidates(
          KRYPTOS_K1,
          shortlist.filter((_, i) => i % 3 === part),
        ),
      );
      // Each finalist carries the seed of its own annealing runs, so it does
      // not matter where, or after which other finalists, it is annealed.
      const finalists = climbJointCandidates(KRYPTOS_K1, ring, TABLE, {
        rng: seededRng(6),
      });
      expect(finalists.length).toBeGreaterThan(3);
      const annealed = [2, 0, 1].flatMap((part) =>
        annealJointFinalists(
          KRYPTOS_K1,
          finalists.filter((_, i) => i % 3 === part),
          TABLE,
        ),
      );
      const joined = decideJoint(KRYPTOS_K1, annealed);
      expect(joined.keyword).toBe("KRYPTOS");
      expect(joined).toEqual(whole);
    },
  );

  it("lists every period that leaves few letters per column", () => {
    expect(jointPeriods(63, {})).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(jointPeriods(63, { period: 10 })).toEqual([10]);
  });
});
