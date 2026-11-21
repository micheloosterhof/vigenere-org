// ABOUTME: Benchmark of the statistical Quagmire III solver over period and letters per column, with the period given.
// ABOUTME: The shared alphabet is built from a keyword or is a random arrangement; a third of the texts have an unrelated alphabet per column, where no shared one must be found.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { randomPermutation, seededRng } from "../src/lib/anneal";
import { quagmire } from "../src/lib/quagmire";
import { breakQuagmire } from "../src/lib/solve-quagmire";
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
  perColumn: number;
  alphabet: "keyword" | "random" | "independent";
  repeat: number;
}

const trials: Trial[] = [];
for (const period of [3, 5, 8, 12]) {
  for (const perColumn of [75, 100, 150, 200, 300]) {
    for (const alphabet of ["keyword", "random", "independent"] as const) {
      for (let repeat = 0; repeat < 5; repeat += 1) {
        trials.push({ period, perColumn, alphabet, repeat });
      }
    }
  }
}

it("statistical Quagmire III solver grid", async () => {
  for (const { period, perColumn, alphabet, repeat } of ownTrials(trials)) {
    const rng = seededRng(
      period * 100000 +
        perColumn * 100 +
        { keyword: 0, random: 50, independent: 70 }[alphabet] +
        repeat,
    );
    const letters = period * perColumn;
    const plain = plaintextSlice(letters, rng);
    let ciphertext: string;
    if (alphabet === "independent") {
      const alphabets = Array.from({ length: period }, () =>
        randomPermutation(26, rng),
      );
      ciphertext = [...plain]
        .map((letter, i) =>
          String.fromCharCode(
            65 + alphabets[i % period][letter.charCodeAt(0) - 65],
          ),
        )
        .join("");
    } else {
      // A keyword of all 26 letters is the alphabet itself.
      const keyword =
        alphabet === "keyword"
          ? keywordWith(7, rng)
          : randomPermutation(26, rng)
              .map((value) => String.fromCharCode(65 + value))
              .join("");
      ciphertext = quagmire(
        plain,
        { variant: 3, keyword, key: randomKey(period, rng), indicator: "A" },
        "encrypt",
      );
    }
    const start = performance.now();
    const result = await breakQuagmire(ciphertext, TABLE, { period, rng });
    record("quagmire-shared-alphabet", {
      period,
      perColumn,
      letters,
      alphabet,
      repeat,
      shared: result.isQuagmire ? 1 : 0,
      accuracy: accuracy(result.plaintext, plain).toFixed(2),
      fitness: result.fitness.toFixed(2),
      seconds: ((performance.now() - start) / 1000).toFixed(1),
    });
  }
});
