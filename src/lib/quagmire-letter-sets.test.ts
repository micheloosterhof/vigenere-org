// ABOUTME: Tests for scoring the keyword letter set of a Quagmire alphabet.
// ABOUTME: The true set must outscore random sets on Kryptos K2 and on synthetic texts of every variant.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { seededRng } from "./anneal";
import { inverseAlphabet, mixedAlphabet } from "./cipher";
import { quagmire } from "./quagmire";
import {
  bestLetterSets,
  letterSetCount,
  letterSetScorer,
} from "./quagmire-letter-sets";
import { toLetterValues } from "./solve";

// Kryptos K2 as carved: Quagmire III, alphabet keyword KRYPTOS, period 8.
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

const lettersOf = (word: string): number[] =>
  [...new Set(toLetterValues(word))].sort((a, b) => a - b);

function randomSet(size: number, rng: () => number): number[] {
  const letters = new Set<number>();
  while (letters.size < size) {
    letters.add(Math.floor(rng() * 26));
  }
  return [...letters].sort((a, b) => a - b);
}

describe("letterSetScorer", () => {
  it("scores the true keyword letters of Kryptos K2 above random sets", () => {
    const scorer = letterSetScorer(toLetterValues(KRYPTOS_K2), 3, 8);
    const truth = scorer.score(lettersOf("KRYPTOS"));
    const rng = seededRng(11);
    for (let trial = 0; trial < 300; trial += 1) {
      expect(scorer.score(randomSet(7, rng))).toBeLessThan(truth);
    }
  });

  it("leaves nearly all the true shifts of Kryptos K2 for the true set", () => {
    const cipher = toLetterValues(KRYPTOS_K2);
    const scorer = letterSetScorer(cipher, 3, 8);
    scorer.score(lettersOf("KRYPTOS"));
    const alphabet = mixedAlphabet("KRYPTOS");
    const index = inverseAlphabet(alphabet);
    const opening = toLetterValues("ITWASTOTALLYINVISIBLEHOWSTHATPOSSIBLE");
    const right = opening.filter(
      (letter, i) =>
        alphabet[(index[cipher[i]] - scorer.shifts[i % 8] + 26) % 26] ===
        letter,
    ).length;
    // Each column picks its shift alone, so one of the eight may be off.
    expect(right / opening.length).toBeGreaterThan(0.8);
  });

  it("scores the true letters above random sets on variants I and II", () => {
    for (const variant of [1, 2] as const) {
      const cipher = toLetterValues(
        quagmire(
          PLAIN,
          { variant, keyword: "MACHINE", key: "WONDER", indicator: "A" },
          "encrypt",
        ),
      );
      const scorer = letterSetScorer(cipher, variant, 6);
      const truth = scorer.score(lettersOf("MACHINE"));
      const rng = seededRng(12 + variant);
      for (let trial = 0; trial < 300; trial += 1) {
        expect(scorer.score(randomSet(7, rng))).toBeLessThan(truth);
      }
    }
  });
});

describe("bestLetterSets", () => {
  const scorer = letterSetScorer(toLetterValues(KRYPTOS_K2), 3, 8);

  it("scores every set when the sample is 1", () => {
    expect(letterSetCount(2)).toBe(325);
    expect(letterSetCount(7)).toBe(657800);
    const all = bestLetterSets(scorer, 2, 400, 1, seededRng(1));
    expect(all.length).toBe(325);
    for (let i = 1; i < all.length; i += 1) {
      expect(all[i].score).toBeLessThanOrEqual(all[i - 1].score);
    }
    expect(all[0].score).toBe(scorer.score(all[0].letters));
  });

  it("keeps only the best", () => {
    const all = bestLetterSets(scorer, 2, 400, 1, seededRng(1));
    const few = bestLetterSets(scorer, 2, 10, 1, seededRng(1));
    expect(few).toEqual(all.slice(0, 10));
  });

  it("scores about the sampled share of the sets", () => {
    const half = bestLetterSets(scorer, 2, 400, 0.5, seededRng(1));
    expect(half.length).toBeGreaterThan(120);
    expect(half.length).toBeLessThan(205);
  });
});
