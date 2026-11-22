// ABOUTME: Benchmark of the period ranking of the Bifid and Trifid breakers by text length and true period.
// ABOUTME: The rank the true period gets among the periods tried says how many periods the breakers must anneal.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { seededRng } from "../src/lib/anneal";
import { bifid } from "../src/lib/bifid";
import { DEFAULT_PERIODS, rankPeriods } from "../src/lib/solve-fractionation";
import { trifid } from "../src/lib/trifid";
import { ownTrials, plaintextSlice, randomKey, record } from "./trials";

interface Trial {
  cipher: "bifid" | "trifid";
  letters: number;
  period: number;
  repeat: number;
}

const trials: Trial[] = [];
for (const cipher of ["bifid", "trifid"] as const) {
  for (const letters of [150, 200, 300, 400]) {
    for (let period = 3; period <= 15; period += 1) {
      for (let repeat = 0; repeat < 20; repeat += 1) {
        trials.push({ cipher, letters, period, repeat });
      }
    }
  }
}

it("rank of the true period", () => {
  for (const { cipher, letters, period, repeat } of ownTrials(trials)) {
    const rng = seededRng(
      cipher.length * 10000000 + letters * 10000 + period * 100 + repeat,
    );
    // Bifid has no J: its square merges it with I.
    const plain = plaintextSlice(letters, rng).replace(/J/g, "I");
    const key = randomKey(10, rng);
    const ciphertext =
      cipher === "bifid"
        ? bifid(plain, key, period, "encrypt")
        : trifid(plain, key, period, "encrypt");
    const ranked = rankPeriods(
      cipher,
      ciphertext,
      DEFAULT_PERIODS,
      DEFAULT_PERIODS.length,
    );
    record("fractionation-periods", {
      cipher,
      letters,
      period,
      repeat,
      rank: ranked.indexOf(period) + 1,
      first: ranked[0],
    });
  }
});
