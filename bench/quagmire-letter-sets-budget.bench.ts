// ABOUTME: Benchmark of how many letter sets the Quagmire letter-set scan must score for larger keywords.
// ABOUTME: The keyword size is guessed one too high, as the search does, and the same ciphertext is attacked at each budget.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { seededRng } from "../src/lib/anneal";
import { quagmire } from "../src/lib/quagmire";
import { toLetterValues } from "../src/lib/solve";
import {
  decryptWithAlphabet,
  runLetterSetJob,
} from "../src/lib/solve-quagmire-letter-sets";
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
  size: number;
  roomy: boolean;
  repeat: number;
  scored: number | undefined;
}

const trials: Trial[] = [];
for (const variant of [1, 2, 3] as const) {
  for (const size of [7, 9]) {
    for (const roomy of [false, true]) {
      for (let repeat = 0; repeat < 4; repeat += 1) {
        for (const scored of [5000, 15000, 40000, undefined]) {
          trials.push({ variant, size, roomy, repeat, scored });
        }
      }
    }
  }
}

it("quagmire letter-set scan scoring budget", () => {
  const period = 8;
  for (const { variant, size, roomy, repeat, scored } of ownTrials(trials)) {
    // The budget is left out of the seed, so each one attacks the same
    // ciphertext.
    const rng = seededRng(
      variant * 100000 + size * 1000 + (roomy ? 100 : 0) + repeat,
    );
    const perColumn = (variant === 3 ? 32 : 16) * (roomy ? 1.5 : 1);
    const keyword = keywordWith(size, rng);
    const plain = plaintextSlice(period * perColumn, rng);
    const key = randomKey(period, rng);
    const cipher = toLetterValues(
      quagmire(plain, { variant, keyword, key, indicator: "A" }, "encrypt"),
    );
    const start = performance.now();
    const solution = runLetterSetJob(
      cipher,
      { variant, period, size: size + 1, scored },
      TABLE,
      rng,
    );
    const recovered = decryptWithAlphabet(
      cipher,
      variant,
      solution.alphabet,
      solution.offsets,
    )
      .map((value) => String.fromCharCode(65 + value))
      .join("");
    record("quagmire-letter-sets-budget", {
      variant,
      size,
      perColumn,
      keyword,
      repeat,
      scored: scored ?? "default",
      accuracy: accuracy(recovered, plain).toFixed(2),
      fitness: solution.fitness.toFixed(2),
      setsCompleted: solution.setsCompleted,
      seconds: ((performance.now() - start) / 1000).toFixed(1),
    });
  }
});
