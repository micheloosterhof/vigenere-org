// ABOUTME: Benchmark of single Bifid and Trifid annealing jobs at the true period, by text length.
// ABOUTME: The share of jobs that reach English says how many jobs a period needs for a reliable solve.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { seededRng } from "../src/lib/anneal";
import { runJob } from "../src/lib/anneal-jobs";
import { bifid } from "../src/lib/bifid";
import { trifid } from "../src/lib/trifid";
import { ownTrials, plaintextSlice, randomKey, record, TABLE } from "./trials";

const JOBS_PER_TEXT = 16;

interface Trial {
  cipher: "bifid" | "trifid";
  letters: number;
  period: number;
  repeat: number;
}

const trials: Trial[] = [];
for (const cipher of ["bifid", "trifid"] as const) {
  for (const letters of [150, 200, 250, 300, 350, 400]) {
    for (const period of [5, 9]) {
      for (let repeat = 0; repeat < 5; repeat += 1) {
        trials.push({ cipher, letters, period, repeat });
      }
    }
  }
}

/** Fraction of positions where the recovered symbol is the true one. */
function sameSymbols(recovered: string, plain: string): number {
  let same = 0;
  for (let i = 0; i < plain.length; i += 1) {
    if (recovered[i] === plain[i]) {
      same += 1;
    }
  }
  return same / plain.length;
}

it("single fractionation jobs at the true period", () => {
  for (const { cipher, letters, period, repeat } of ownTrials(trials)) {
    const rng = seededRng(
      cipher.length * 1000000 + letters * 1000 + period * 10 + repeat,
    );
    // Bifid has no J: its square merges it with I.
    const plain = plaintextSlice(letters, rng).replace(/J/g, "I");
    const key = randomKey(10, rng);
    const ciphertext =
      cipher === "bifid"
        ? bifid(plain, key, period, "encrypt")
        : trifid(plain, key, period, "encrypt");
    for (let job = 0; job < JOBS_PER_TEXT; job += 1) {
      const start = performance.now();
      const result = runJob(
        { cipher, period, seed: Math.floor(rng() * 2 ** 31) },
        ciphertext,
        TABLE,
      );
      record("fractionation-jobs", {
        cipher,
        letters,
        period,
        repeat,
        job,
        english: result.english ? 1 : 0,
        accuracy: sameSymbols(result.plaintext, plain).toFixed(2),
        fitness: result.fitness.toFixed(2),
        seconds: ((performance.now() - start) / 1000).toFixed(1),
      });
    }
  }
});
