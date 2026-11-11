// ABOUTME: Unit tests for the Bifid and Trifid breakers: period ranking and key recovery.
// ABOUTME: Recovery is asserted as an accuracy threshold; seeds are fixed so the runs are deterministic.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seededRng } from "./anneal";
import { bifid } from "./bifid";
import { trifid } from "./trifid";
import {
  breakFractionation,
  decryptWithGrid,
  rankPeriods,
} from "./solve-fractionation";

const TABLE = new Uint8Array(
  readFileSync(
    new URL("../../public/data/english-quadgrams.bin", import.meta.url),
  ),
);

// Orwell, Nineteen Eighty-Four; J folded into I to match the 5x5 square.
const LETTERS =
  "ITWASABRIGHTCOLDDAYINAPRILANDTHECLOCKSWERESTRIKINGTHIRTEENWINSTONSMITH" +
  "HISCHINNUZZLEDINTOHISBREASTINANEFFORTTOESCAPETHEVILEWINDSLIPPEDQUICKLY" +
  "THROUGHTHEGLASSDOORSOFVICTORYMANSIONSTHOUGHNOTQUICKLYENOUGHTOPREVENTA" +
  "SWIRLOFGRITTYDUSTFROMENTERINGALONGWITHHIMTHEHALLWAYSMELTOFBOILEDCABBA" +
  "GEANDOLDRAGMATSATONEENDOFITACOLOUREDPOSTERTOOLARGEFORINDOORDISPLAYHAD" +
  "BEENTACKEDTOTHEWALL";

function accuracy(found: string, expected: string): number {
  let same = 0;
  for (let i = 0; i < expected.length; i += 1) {
    if (found[i] === expected[i]) {
      same += 1;
    }
  }
  return same / expected.length;
}

describe("rankPeriods", () => {
  it("puts the true Bifid period first", () => {
    for (const period of [4, 5, 6, 7, 8, 10]) {
      const ciphertext = bifid(
        LETTERS.slice(0, 300),
        "KEYWORD",
        period,
        "encrypt",
      );
      expect(rankPeriods("bifid", ciphertext)[0]).toBe(period);
    }
  });

  it("keeps the true Trifid period among the finalists", () => {
    for (const period of [5, 7, 9]) {
      const ciphertext = trifid(LETTERS, "KEYWORD", period, "encrypt");
      expect(rankPeriods("trifid", ciphertext)).toContain(period);
    }
  });

  it("rejects text that is too short", () => {
    expect(() => rankPeriods("bifid", LETTERS.slice(0, 80))).toThrow(
      /at least 100 letters/,
    );
  });
});

describe("decryptWithGrid", () => {
  it("decrypts Bifid with the true square", () => {
    const ciphertext = bifid(LETTERS.slice(0, 60), "KEYWORD", 5, "encrypt");
    const square = "KEYWORDABCFGHILMNPQSTUVXZ";
    const symbols = "ABCDEFGHIKLMNOPQRSTUVWXYZ";
    const { plaintext } = decryptWithGrid(
      "bifid",
      [...ciphertext].map((c) => symbols.indexOf(c)),
      [...square].map((c) => symbols.indexOf(c)),
      5,
      TABLE,
    );
    expect(plaintext.map((v) => symbols[v]).join("")).toBe(
      LETTERS.slice(0, 60),
    );
  });
});

describe("breakFractionation", () => {
  it("recovers Bifid plaintext and period from 250 letters", () => {
    const plain = LETTERS.slice(0, 250);
    const ciphertext = bifid(plain, "SECRETKEYWORD", 7, "encrypt");
    const found = breakFractionation("bifid", ciphertext, TABLE, {
      rng: seededRng(11),
    });
    expect(found.period).toBe(7);
    expect(found.english).toBe(true);
    // Rare letters (Q, X, Z) can sit anywhere in the square without changing
    // the score much, so a few may come out wrong.
    expect(accuracy(found.plaintext, plain)).toBeGreaterThan(0.9);
    expect(bifid(ciphertext, found.key, 7, "decrypt")).toBe(found.plaintext);
  }, 120_000);

  it("recovers Trifid plaintext from a full page with the period given", () => {
    const ciphertext = trifid(LETTERS, "SECRETKEYWORD", 5, "encrypt");
    const found = breakFractionation("trifid", ciphertext, TABLE, {
      rng: seededRng(5),
      periods: [5],
    });
    expect(found.english).toBe(true);
    expect(accuracy(found.plaintext, LETTERS)).toBeGreaterThan(0.9);
    expect(trifid(ciphertext, found.key, 5, "decrypt")).toBe(found.plaintext);
  }, 120_000);

  it("returns its best attempt, marked not English, on random letters", () => {
    const rng = seededRng(99);
    const noise = Array.from({ length: 120 }, () =>
      String.fromCharCode(65 + Math.floor(rng() * 26)),
    )
      .join("")
      .replace(/J/g, "K");
    const found = breakFractionation("bifid", noise, TABLE, {
      rng: seededRng(1),
      periods: [5],
      restarts: 1,
      iterations: 5000,
    });
    expect(found.english).toBe(false);
  });
});
