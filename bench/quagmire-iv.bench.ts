// ABOUTME: Benchmark of the Quagmire IV breaker over period, keyword sizes and letters per column, with the period given.
// ABOUTME: Each ciphertext is attacked with the true keyword sizes and with both sizes guessed one too large.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { seededRng } from "../src/lib/anneal";
import { quagmire } from "../src/lib/quagmire";
import { breakQuagmireIv } from "../src/lib/solve-quagmire-iv";
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
  period: number;
  plainSize: number;
  cipherSize: number;
  perColumn: number;
  repeat: number;
  guess: number;
}

const trials: Trial[] = [];
for (const period of [4, 6, 8]) {
  for (const [plainSize, cipherSize] of [
    [5, 5],
    [7, 7],
    [9, 9],
    [5, 8],
  ]) {
    for (const perColumn of [24, 32, 48, 64]) {
      for (let repeat = 0; repeat < 2; repeat += 1) {
        for (const guess of [0, 1]) {
          trials.push({
            period,
            plainSize,
            cipherSize,
            perColumn,
            repeat,
            guess,
          });
        }
      }
    }
  }
}

it("quagmire IV breaker grid", () => {
  for (const trial of ownTrials(trials)) {
    const { period, plainSize, cipherSize, perColumn, repeat, guess } = trial;
    // The guess is left out of the seed, so both attack the same ciphertext.
    const rng = seededRng(
      period * 1000000 +
        plainSize * 100000 +
        cipherSize * 10000 +
        perColumn * 10 +
        repeat,
    );
    const keyword = keywordWith(plainSize, rng);
    const keyword2 = keywordWith(cipherSize, rng);
    const letters = period * perColumn;
    const plain = plaintextSlice(letters, rng);
    const key = randomKey(period, rng);
    const ciphertext = quagmire(
      plain,
      { variant: 4, keyword, keyword2, key, indicator: "A" },
      "encrypt",
    );
    const start = performance.now();
    const result = breakQuagmireIv(ciphertext, TABLE, {
      periods: [period],
      sizes: [[plainSize + guess, cipherSize + guess]],
      rng,
    });
    record("quagmire-iv", {
      period,
      plainSize,
      cipherSize,
      perColumn,
      letters,
      keyword,
      keyword2,
      repeat,
      guess,
      found: result.found ? 1 : 0,
      accuracy: accuracy(result.plaintext, plain).toFixed(2),
      fitness: result.fitness.toFixed(2),
      seconds: ((performance.now() - start) / 1000).toFixed(1),
    });
  }
});
