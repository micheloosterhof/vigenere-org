// ABOUTME: Tests for the Quagmire I-III breaker that needs no word list: it scans keyword letter sets.
// ABOUTME: Kryptos K2 and synthetic texts under an unlisted keyword must fall with the keyword read off the alphabet.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seededRng } from "./anneal";
import { quagmire } from "./quagmire";
import {
  breakQuagmireLetterSets,
  keywordOfAlphabet,
} from "./solve-quagmire-letter-sets";

const TABLE = new Uint8Array(
  readFileSync(
    new URL("../../public/data/english-quadgrams.bin", import.meta.url),
  ),
);

// Kryptos K2 as carved: Quagmire III, alphabet keyword KRYPTOS, key ABSCISSA.
const KRYPTOS_K2 =
  "VFPJUDEEHZWETZYVGWHKKQETGFQJNCEGGWHKKDQMCPFQZDQMMIAGPFXHQRLG" +
  "TIMVMZJANQLVKQEDAGDVFRPJUNGEUNAQZGZLECGYUXUEENJTBJLBQCRTBJDFHRR" +
  "YIZETKZEMVDUFKSJHKFWHKUWQLSZFTIHHDDDUVHDWKBFUFPWNTDFIYCUQZERE" +
  "EVLDKFEZMOQQJLTTUGSYQPFEUNLAVIDXFLGGTEZFKZBSFDQVGOGIPUFXHHDRKF" +
  "FHQNTGPUAECNUVPDJMQCLQUMUNEDFQELZZVRRGKFFVOEEXBDMVPNFQXEZLGRE" +
  "DNQFMPNZGLFLPMRJQYALMGNUVPDXVKPDQUMEBEDMHDAFMJGZNUPLGEWJLLAETG";

const PLAIN =
  "It was a bright cold day in April, and the clocks were striking thirteen. " +
  "Winston Smith, his chin nuzzled into his breast in an effort to escape " +
  "the vile wind, slipped quickly through the glass doors of Victory " +
  "Mansions, though not quickly enough to prevent a swirl of gritty dust " +
  "from entering along with him.";

describe("keywordOfAlphabet", () => {
  it("reads the keyword off a keyword-mixed alphabet", () => {
    expect(keywordOfAlphabet("KRYPTOSABCDEFGHIJLMNQUVWXZ")).toBe("KRYPTOS");
    expect(keywordOfAlphabet("MACHINEBDFGJKLOPQRSTUVWXYZ")).toBe("MACHINE");
  });

  it("stops where the keyword runs into the ordered tail", () => {
    // ZEBRA and ZEBR build the same alphabet.
    expect(keywordOfAlphabet("ZEBRACDFGHIJKLMNOPQSTUVWXY")).toBe("ZEBR");
  });
});

describe("breakQuagmireLetterSets", () => {
  it(
    "breaks Kryptos K2 with no word list, given its variant, period and keyword size",
    { timeout: 120000 },
    () => {
      const result = breakQuagmireLetterSets(KRYPTOS_K2, TABLE, {
        variants: [3],
        periods: [8],
        sizes: [7],
        rng: seededRng(1),
      });
      expect(result.found).toBe(true);
      expect(result.variant).toBe(3);
      expect(result.keyword).toBe("KRYPTOS");
      expect(result.alphabet).toBe("KRYPTOSABCDEFGHIJLMNQUVWXZ");
      expect(result.period).toBe(8);
      expect(result.plaintext.startsWith("ITWASTOTALLYINVISIBLE")).toBe(true);
    },
  );

  it(
    "breaks Quagmire I and II under a keyword no dictionary holds",
    { timeout: 120000 },
    () => {
      for (const variant of [1, 2] as const) {
        const ciphertext = quagmire(
          PLAIN,
          { variant, keyword: "VORTIGEN", key: "WONDER", indicator: "A" },
          "encrypt",
        );
        const result = breakQuagmireLetterSets(ciphertext, TABLE, {
          variants: [variant],
          periods: [6],
          sizes: [8],
          rng: seededRng(2),
        });
        expect(result.found).toBe(true);
        expect(result.keyword).toBe("VORTIGEN");
        expect(result.plaintext).toBe(PLAIN);
        expect(result.key).toBe("WONDER");
      }
    },
  );

  it(
    "puts keyword letters right that bigrams alone leave swapped",
    { timeout: 120000 },
    () => {
      // Quagmire I under ADOPTION: with I and O exchanged in the keyword the
      // text still pairs up plausibly (TI for TO, FIRM for FORM).
      const plain =
        "RSINSUCHFORMASTOTHEMSHALLSEEMMOSTLIKELYTOEFFECTTHEIRSAFETYANDHAPPINESS" +
        "TOSHERLOCKHOLMESSHEISALWAYSTHEWOMANIHAVESELDOMHEARDHIMMENTIONHERUNDER" +
        "ANYOT";
      const ciphertext = quagmire(
        plain,
        { variant: 1, keyword: "ADOPTION", key: "VYKVDW", indicator: "A" },
        "encrypt",
      );
      const result = breakQuagmireLetterSets(ciphertext, TABLE, {
        variants: [1],
        periods: [6],
        sizes: [7],
        rng: seededRng(5),
      });
      expect(result.found).toBe(true);
      expect(result.plaintext).toBe(plain);
    },
  );

  it(
    "tries the variants, periods and sizes it is given in turn",
    { timeout: 120000 },
    () => {
      const ciphertext = quagmire(
        PLAIN,
        { variant: 2, keyword: "VORTIGEN", key: "WONDER", indicator: "A" },
        "encrypt",
      );
      const seen: number[] = [];
      const result = breakQuagmireLetterSets(ciphertext, TABLE, {
        variants: [1, 2],
        periods: [6],
        sizes: [8],
        rng: seededRng(3),
        onProgress: (done, total) => {
          seen.push(done);
          expect(total).toBe(2);
        },
      });
      expect(result.found).toBe(true);
      expect(result.variant).toBe(2);
      expect(result.plaintext).toBe(PLAIN);
      expect(seen).toEqual([1, 2]);
    },
  );

  it(
    "reports not found when no keyword alphabet fits",
    { timeout: 120000 },
    () => {
      const ciphertext = quagmire(
        PLAIN,
        { variant: 3, keyword: "VORTIGEN", key: "WONDER", indicator: "A" },
        "encrypt",
      );
      // The wrong period leaves nothing to find.
      const result = breakQuagmireLetterSets(ciphertext, TABLE, {
        variants: [3],
        periods: [5],
        sizes: [8],
        rng: seededRng(4),
      });
      expect(result.found).toBe(false);
    },
  );
});
