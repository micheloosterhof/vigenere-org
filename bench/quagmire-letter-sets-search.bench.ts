// ABOUTME: Benchmark of what the Quagmire letter-set scan tolerates when its inputs are guesses.
// ABOUTME: Tries keyword sizes around the true one, counts the letter sets completed, and ranks the true period by column IoC.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { seededRng } from "../src/lib/anneal";
import { columnIoc } from "../src/lib/period";
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
  period: number;
  size: number;
  repeat: number;
  offset: number;
}

const trials: Trial[] = [];
for (const variant of [1, 2, 3] as const) {
  for (const period of [5, 8]) {
    for (const size of [5, 7, 9]) {
      for (let repeat = 0; repeat < 3; repeat += 1) {
        for (const offset of [-2, -1, 0, 1, 2]) {
          trials.push({ variant, period, size, repeat, offset });
        }
      }
    }
  }
}

it("quagmire letter-set scan with guessed inputs", () => {
  for (const { variant, period, size, repeat, offset } of ownTrials(trials)) {
    // The offset is left out of the seed, so every guessed size attacks the
    // same ciphertext.
    const rng = seededRng(
      variant * 1000000 + period * 10000 + size * 100 + repeat,
    );
    const perColumn = variant === 3 ? 48 : 24;
    const keyword = keywordWith(size, rng);
    const letters = period * perColumn;
    const plain = plaintextSlice(letters, rng);
    const key = randomKey(period, rng);
    const cipher = toLetterValues(
      quagmire(plain, { variant, keyword, key, indicator: "A" }, "encrypt"),
    );
    // Where the true period stands when periods 1 to 12 are ordered by
    // column index of coincidence, highest first.
    const iocs = Array.from({ length: 12 }, (_, i) => columnIoc(cipher, i + 1));
    const periodRank = iocs.filter((ioc) => ioc > iocs[period - 1]).length + 1;
    const start = performance.now();
    const solution = runLetterSetJob(
      cipher,
      { variant, period, size: size + offset },
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
    record("quagmire-letter-sets-search", {
      variant,
      period,
      size,
      perColumn,
      keyword,
      repeat,
      guessedSize: size + offset,
      accuracy: accuracy(recovered, plain).toFixed(2),
      fitness: solution.fitness.toFixed(2),
      setsCompleted: solution.setsCompleted,
      periodRank,
      seconds: ((performance.now() - start) / 1000).toFixed(1),
    });
  }
});
