// ABOUTME: Tests for the local search that completes Quagmire keyword letter sets into a key.
// ABOUTME: Starts from the true letter sets in A-Z order and checks the keyword order and shifts are recovered.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seededRng } from "./anneal";
import { quagmire } from "./quagmire";
import { completeKey, decryptWithAlphabets } from "./quagmire-key-climb";
import { letterSetPairScorer } from "./quagmire-letter-sets";
import { toLetterValues } from "./solve";

const TABLE = new Uint8Array(
  readFileSync(
    new URL("../../public/data/english-quadgrams.bin", import.meta.url),
  ),
);

const PLAIN =
  "It was a bright cold day in April, and the clocks were striking thirteen. " +
  "Winston Smith, his chin nuzzled into his breast in an effort to escape " +
  "the vile wind, slipped quickly through the glass doors of Victory " +
  "Mansions, though not quickly enough to prevent a swirl of gritty dust " +
  "from entering along with him.";

const lettersOf = (word: string): number[] =>
  [...new Set(toLetterValues(word))].sort((a, b) => a - b);
const text = (values: number[]): string =>
  values.map((value) => String.fromCharCode(65 + value)).join("");

describe("completeKey", () => {
  it("orders both keywords of a Quagmire IV from their letter sets", () => {
    const cipher = toLetterValues(
      quagmire(
        PLAIN,
        {
          variant: 4,
          keyword: "MACHINE",
          keyword2: "JUPITER",
          key: "WONDER",
          indicator: "A",
        },
        "encrypt",
      ),
    );
    const scorer = letterSetPairScorer(cipher, 6);
    scorer.setCipherLetters(lettersOf("JUPITER"));
    scorer.score(lettersOf("MACHINE"));
    const key = completeKey(
      cipher,
      6,
      {
        plain: lettersOf("MACHINE"),
        cipher: lettersOf("JUPITER"),
        shared: false,
      },
      scorer.shifts,
      TABLE,
      seededRng(1),
    );
    expect(text(key.plainAlphabet)).toBe("MACHINEBDFGJKLOPQRSTUVWXYZ");
    expect(text(key.cipherAlphabet)).toBe("JUPITERABCDFGHKLMNOQSVWXYZ");
    expect(
      text(
        decryptWithAlphabets(
          cipher,
          key.plainAlphabet,
          key.cipherAlphabet,
          key.offsets,
        ),
      ),
    ).toBe(text(toLetterValues(PLAIN)));
  });

  it("repairs a letter set that is one letter off", () => {
    const cipher = toLetterValues(
      quagmire(
        PLAIN,
        { variant: 3, keyword: "MACHINE", key: "WONDER", indicator: "A" },
        "encrypt",
      ),
    );
    // X stands in for the keyword's N.
    const nearly = lettersOf("MACHIXE");
    const scorer = letterSetPairScorer(cipher, 6);
    scorer.setCipherLetters(nearly);
    scorer.score(nearly);
    const key = completeKey(
      cipher,
      6,
      { plain: nearly, cipher: nearly, shared: true },
      scorer.shifts,
      TABLE,
      seededRng(2),
    );
    expect(text(key.plainAlphabet)).toBe("MACHINEBDFGJKLOPQRSTUVWXYZ");
    expect(key.cipherAlphabet).toEqual(key.plainAlphabet);
  });
});
