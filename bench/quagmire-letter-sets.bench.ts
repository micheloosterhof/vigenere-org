// ABOUTME: Benchmark of the Quagmire I-III letter-set scan over variant, period, keyword size and letters per column.
// ABOUTME: The solver is told the variant, period and keyword size; the keyword is a real word but no word list is used.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { seededRng } from "../src/lib/anneal";
import { quagmire } from "../src/lib/quagmire";
import { breakQuagmireLetterSets } from "../src/lib/solve-quagmire-letter-sets";
import {
  accuracy,
  keywordWith,
  ownTrials,
  plaintextSlice,
  randomKey,
  record,
  TABLE,
} from "./trials";

interface Trial {
  variant: 1 | 2 | 3;
  period: number;
  size: number;
  perColumn: number;
  repeat: number;
}

const trials: Trial[] = [];
for (const variant of [1, 2, 3] as const) {
  for (const period of [4, 6, 8, 12]) {
    for (const size of [5, 7, 9]) {
      for (const perColumn of [8, 12, 16, 24, 32, 48]) {
        for (let repeat = 0; repeat < 3; repeat += 1) {
          trials.push({ variant, period, size, perColumn, repeat });
        }
      }
    }
  }
}

it("quagmire letter-set scan grid", () => {
  for (const trial of ownTrials(trials)) {
    const { variant, period, size, perColumn, repeat } = trial;
    const rng = seededRng(
      variant * 10000000 +
        period * 100000 +
        size * 10000 +
        perColumn * 100 +
        repeat,
    );
    const keyword = keywordWith(size, rng);
    const letters = period * perColumn;
    const plain = plaintextSlice(letters, rng);
    const key = randomKey(period, rng);
    const ciphertext = quagmire(
      plain,
      { variant, keyword, key, indicator: "A" },
      "encrypt",
    );
    const start = performance.now();
    const result = breakQuagmireLetterSets(ciphertext, TABLE, {
      variants: [variant],
      periods: [period],
      sizes: [size],
      rng,
    });
    record("quagmire-letter-sets", {
      variant,
      period,
      size,
      perColumn,
      letters,
      keyword,
      found: result.found ? 1 : 0,
      accuracy: accuracy(result.plaintext, plain).toFixed(2),
      fitness: result.fitness.toFixed(2),
      seconds: ((performance.now() - start) / 1000).toFixed(1),
    });
  }
});
