// ABOUTME: Unit tests for the double transposition breaker and its index permutations.
// ABOUTME: Recovery is asserted as an accuracy threshold; seeds are fixed so the runs are deterministic.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seededRng } from "./anneal";
import { columnarTransposition, doubleTransposition } from "./transposition";
import {
  breakDoubleTransposition,
  columnarSource,
  orderToKeyword,
} from "./solve-double-transposition";

const TABLE = new Uint8Array(
  readFileSync(
    new URL("../../public/data/english-quadgrams.bin", import.meta.url),
  ),
);

const LETTERS =
  "ITWASABRIGHTCOLDDAYINAPRILANDTHECLOCKSWERESTRIKINGTHIRTEENWINSTONSMITH" +
  "HISCHINNUZZLEDINTOHISBREASTINANEFFORTTOESCAPETHEVILEWINDSLIPPEDQUICKLY" +
  "THROUGHTHEGLASSDOORSOFVICTORYMANSIONSTHOUGHNOTQUICKLYENOUGHTOPREVENTA" +
  "SWIRLOFGRITTYDUSTFROMENTERINGALONGWITHHIMTHEHALLWAYSMELTOFBOILEDCABBA";

describe("columnarSource", () => {
  it("reproduces columnar decryption as an index map", () => {
    const ciphertext = columnarTransposition(
      LETTERS.slice(0, 47),
      "ZEBRAS",
      "encrypt",
    );
    // ZEBRAS reads columns 4 (A), 2 (B), 1 (E), 3 (R), 5 (S), 0 (Z).
    const src = columnarSource(47, [4, 2, 1, 3, 5, 0]);
    expect(Array.from(src, (i) => ciphertext[i]).join("")).toBe(
      LETTERS.slice(0, 47),
    );
  });

  it("names a column order by its canonical keyword", () => {
    expect(orderToKeyword([4, 2, 1, 3, 5, 0])).toBe("FCBDAE");
    expect(columnarTransposition("WEAREDISCOVERED", "FCBDAE", "encrypt")).toBe(
      columnarTransposition("WEAREDISCOVERED", "ZEBRAS", "encrypt"),
    );
  });
});

describe("breakDoubleTransposition", () => {
  it("recovers the plaintext with keys of five and seven columns", () => {
    const plain = LETTERS.slice(0, 250);
    const ciphertext = doubleTransposition(
      plain,
      "ZEBRA",
      "CIPHERS",
      "encrypt",
    );
    const found = breakDoubleTransposition(ciphertext, 5, 7, TABLE, {
      rng: seededRng(3),
    });
    expect(found.english).toBe(true);
    expect(found.plaintext).toBe(plain);
    expect(
      doubleTransposition(
        ciphertext,
        found.firstKey,
        found.secondKey,
        "decrypt",
      ),
    ).toBe(plain);
  }, 120_000);

  it("refuses text too short to solve reliably", () => {
    expect(() =>
      breakDoubleTransposition(LETTERS.slice(0, 80), 3, 4, TABLE, {
        rng: seededRng(1),
      }),
    ).toThrow(/at least 100 letters/);
  });

  it("rejects key lengths outside 2-20", () => {
    expect(() =>
      breakDoubleTransposition(LETTERS, 1, 5, TABLE, { rng: seededRng(1) }),
    ).toThrow(/key lengths/);
  });
});
