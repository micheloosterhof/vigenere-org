// ABOUTME: Benchmark of single restarts of the general polyalphabetic solver, with the period given.
// ABOUTME: Records each restart's fitness and accuracy, to show at which fitness a restart has the answer and the rest can be skipped.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { randomPermutation, seededRng } from "../src/lib/anneal";
import { breakPolyalphabetic, RESTARTS } from "../src/lib/solve-polyalphabetic";
import { accuracy, ownTrials, plaintextSlice, record, TABLE } from "./trials";

interface Trial {
  period: number;
  perColumn: number;
  repeat: number;
}

const trials: Trial[] = [];
for (const period of [2, 3, 5, 8, 12]) {
  for (const perColumn of [50, 75, 100, 150, 200, 300]) {
    for (let repeat = 0; repeat < 10; repeat += 1) {
      trials.push({ period, perColumn, repeat });
    }
  }
}

/** Enciphers with an unrelated random alphabet for each of `period` columns. */
function encrypt(plain: string, period: number, rng: () => number): string {
  const alphabets = Array.from({ length: period }, () =>
    randomPermutation(26, rng),
  );
  return [...plain]
    .map((letter, i) =>
      String.fromCharCode(
        65 + alphabets[i % period][letter.charCodeAt(0) - 65],
      ),
    )
    .join("");
}

it("polyalphabetic solver restarts", () => {
  for (const { period, perColumn, repeat } of ownTrials(trials)) {
    const rng = seededRng(period * 100000 + perColumn * 100 + repeat);
    const letters = period * perColumn;
    const plain = plaintextSlice(letters, rng);
    const ciphertext = encrypt(plain, period, rng);
    // The solver's restarts one at a time: the first from the frequency seed,
    // the others from random keys.
    for (let restart = 0; restart < RESTARTS; restart += 1) {
      const start = performance.now();
      const result = breakPolyalphabetic(ciphertext, TABLE, {
        period,
        restarts: 1,
        seedFromFrequency: restart === 0,
        rng,
      });
      record("polyalphabetic-restarts", {
        period,
        perColumn,
        letters,
        repeat,
        restart,
        accuracy: accuracy(result.plaintext, plain).toFixed(2),
        fitness: result.fitness.toFixed(3),
        seconds: ((performance.now() - start) / 1000).toFixed(2),
      });
    }
  }
});
