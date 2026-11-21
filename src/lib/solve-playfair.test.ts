// ABOUTME: Unit tests for the Playfair breaker: annealing over 5x5 squares scored by quadgrams.
// ABOUTME: Recovery is asserted as an accuracy threshold; seeds are fixed so the runs are deterministic.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seededRng } from "./anneal";
import { playfair } from "./playfair";
import {
  annealPlayfair,
  breakPlayfair,
  englishFitness,
  keywordSquare,
  MIN_LETTERS,
  playfairIterations,
  settleSquare,
} from "./solve-playfair";

const TABLE = new Uint8Array(
  readFileSync(
    new URL("../../public/data/english-quadgrams.bin", import.meta.url),
  ),
);

// Orwell, Nineteen Eighty-Four.
const LETTERS =
  "ITWASABRIGHTCOLDDAYINAPRILANDTHECLOCKSWERESTRIKINGTHIRTEENWINSTONSMITH" +
  "HISCHINNUZZLEDINTOHISBREASTINANEFFORTTOESCAPETHEVILEWINDSLIPPEDQUICKLY" +
  "THROUGHTHEGLASSDOORSOFVICTORYMANSIONSTHOUGHNOTQUICKLYENOUGHTOPREVENTA" +
  "SWIRLOFGRITTYDUSTFROMENTERINGALONGWITHHIMTHEHALLWAYSMELTOFBOILEDCABBA" +
  "GEANDOLDRAGMATSATONEENDOFITACOLOUREDPOSTERTOOLARGEFORINDOORDISPLAYHAD" +
  "BEENTACKEDTOTHEWALL";

// Lincoln, the Gettysburg Address.
const GETTYSBURG =
  "FOURSCOREANDSEVENYEARSAGOOURFATHERSBROUGHTFORTHONTHISCONTINENTANEWNATION" +
  "CONCEIVEDINLIBERTYANDDEDICATEDTOTHEPROPOSITIONTHATALLMENARECREATEDEQUAL" +
  "NOWWEAREENGAGEDINAGREATCIVILWARTESTINGWHETHERTHATNATIONORANYNATIONSO" +
  "CONCEIVEDANDSODEDICATEDCANLONGENDUREWEAREMETONAGREATBATTLEFIELDOFTHATWAR" +
  "WEHAVECOMETODEDICATE";

function accuracy(found: string, expected: string): number {
  let same = 0;
  for (let i = 0; i < expected.length; i += 1) {
    if (found[i] === expected[i]) {
      same += 1;
    }
  }
  return same / expected.length;
}

describe("breakPlayfair", () => {
  const ciphertext = playfair(LETTERS, "MONARCHY", "encrypt");
  // What decrypting with the true key gives: the plaintext with its fillers.
  const padded = playfair(ciphertext, "MONARCHY", "decrypt");

  it("recovers the plaintext and a square that decrypts to it", () => {
    const found = breakPlayfair(ciphertext, TABLE, { rng: seededRng(2) });
    expect(found.english).toBe(true);
    expect(accuracy(found.plaintext, padded)).toBeGreaterThan(0.98);
    expect(playfair(ciphertext, found.key, "decrypt")).toBe(found.plaintext);
  }, 120_000);

  it("starts again when a run finds nothing", () => {
    // With this seed the first two runs of this length find nothing and the
    // third finds the key.
    const attack = (runs: number): boolean =>
      breakPlayfair(ciphertext, TABLE, {
        rng: seededRng(2),
        runs,
        iterations: 100000,
      }).english;
    expect(attack(2)).toBe(false);
    expect(attack(3)).toBe(true);
  }, 120_000);

  it("returns its best attempt, marked not English, on random letters", () => {
    const rng = seededRng(99);
    const noise = Array.from({ length: 200 }, () =>
      String.fromCharCode(65 + Math.floor(rng() * 26)),
    ).join("");
    const found = breakPlayfair(noise, TABLE, {
      rng: seededRng(3),
      runs: 1,
      iterations: 5000,
    });
    expect(found.english).toBe(false);
    expect(found.key).toHaveLength(25);
  });
});

describe("annealPlayfair", () => {
  it("ends on the right square, not just the first one that reads as English", () => {
    const ciphertext = playfair(
      GETTYSBURG.slice(0, 300),
      "MONARCHY",
      "encrypt",
    );
    const padded = playfair(ciphertext, "MONARCHY", "decrypt");
    const found = annealPlayfair(ciphertext, TABLE, {
      rng: seededRng(2),
      iterations: 1000000,
    });
    expect(found.english).toBe(true);
    expect(accuracy(found.plaintext, padded)).toBeGreaterThan(0.98);
  }, 120_000);

  it("does not call a wrong square English on a short text", () => {
    // Thoreau, Walden. On a hundred letters a wrong square can decrypt to
    // text that scores -4.6 to -4.7, where the right one scores -4.19.
    const plain =
      "TITHADTOTEACHANDNOTWHENICAMETODIEDISCOVERTHATIHADNOTLIVEDIDIDNOT" +
      "WISHTOLIVEWHATWASNOTLIFELIVINGISSODE";
    const ciphertext = playfair(plain, "ZLEQENJGWO", "encrypt");
    const padded = playfair(ciphertext, "ZLEQENJGWO", "decrypt");
    const found = annealPlayfair(ciphertext, TABLE, {
      rng: seededRng(4),
      iterations: 400000,
    });
    expect(found.english && accuracy(found.plaintext, padded) < 0.5).toBe(
      false,
    );
  }, 120_000);

  it("rejects ciphertext with an odd number of letters", () => {
    expect(() =>
      annealPlayfair(LETTERS.slice(0, 201), TABLE, { rng: seededRng(1) }),
    ).toThrow(/even number of letters/);
  });

  it("rejects text that is too short", () => {
    expect(() =>
      annealPlayfair(LETTERS.slice(0, MIN_LETTERS - 2), TABLE, {
        rng: seededRng(1),
      }),
    ).toThrow(new RegExp(`at least ${MIN_LETTERS} letters`));
  });
});

describe("englishFitness", () => {
  it("asks more of a short text before calling it English", () => {
    expect(englishFitness(100)).toBeGreaterThan(englishFitness(125));
    expect(englishFitness(125)).toBe(englishFitness(400));
  });
});

describe("playfairIterations", () => {
  it("gives a shorter text more steps, for the same time in all", () => {
    expect(playfairIterations(150)).toBe(2 * playfairIterations(300));
    expect(playfairIterations(300)).toBe(2 * playfairIterations(600));
  });
});

describe("settleSquare", () => {
  it("puts letters left in the wrong cells back by swapping pairs", () => {
    const ciphertext = playfair(LETTERS, "MONARCHY", "encrypt");
    const padded = playfair(ciphertext, "MONARCHY", "decrypt");
    // The true square with two pairs of letters exchanged, as a run that
    // stopped at the first English decryption leaves it.
    const nearly = "MONARCHYBDEFGIKLPQSTUVWXZ"
      .replace("B", "#")
      .replace("K", "B")
      .replace("#", "K")
      .replace("P", "#")
      .replace("W", "P")
      .replace("#", "W");
    expect(playfair(ciphertext, nearly, "decrypt")).not.toBe(padded);
    const settled = settleSquare(ciphertext, nearly, TABLE);
    expect(playfair(ciphertext, settled, "decrypt")).toBe(padded);
  });
});

describe("keywordSquare", () => {
  it("turns a square to the form that starts with its keyword", () => {
    // Moving whole rows or columns round the square leaves the cipher as it
    // is, so a search can end on any of the 25 turns of the true square.
    const square = "MONARCHYBDEFGIKLPQSTUVWXZ";
    const rows = [0, 1, 2, 3, 4].map((r) => square.slice(r * 5, r * 5 + 5));
    const turned = [3, 4, 0, 1, 2]
      .map((r) => rows[r].slice(2) + rows[r].slice(0, 2))
      .join("");
    expect(turned).not.toBe(square);
    expect(keywordSquare(turned)).toBe(square);
    expect(playfair("HELLOWORLD", keywordSquare(turned), "encrypt")).toBe(
      playfair("HELLOWORLD", turned, "encrypt"),
    );
  });
});
