// ABOUTME: Benchmark of the Bifid and Trifid breakers on short real ciphertexts, 100 to 150 letters, with the period unknown.
// ABOUTME: Shows how often a short text is solved and how English the answer looks when it is not, which sets the least text the breakers accept.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { seededRng } from "../src/lib/anneal";
import { bifid } from "../src/lib/bifid";
import { breakFractionation } from "../src/lib/solve-fractionation";
import { trifid } from "../src/lib/trifid";
import {
  ownTrials,
  plaintextSlice,
  randomKey,
  record,
  sameSymbols,
  TABLE,
} from "./trials";

interface Trial {
  cipher: "bifid" | "trifid";
  letters: number;
  period: number;
  repeat: number;
}

const trials: Trial[] = [];
for (const cipher of ["bifid", "trifid"] as const) {
  for (const letters of [100, 125, 150]) {
    for (const period of [5, 9]) {
      for (let repeat = 0; repeat < 6; repeat += 1) {
        trials.push({ cipher, letters, period, repeat });
      }
    }
  }
}

it("fractionation breakers on short ciphertexts", () => {
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
    const start = performance.now();
    const result = breakFractionation(cipher, ciphertext, TABLE, { rng });
    record("fractionation-short", {
      cipher,
      letters,
      period,
      repeat,
      foundPeriod: result.period,
      english: result.english ? 1 : 0,
      accuracy: sameSymbols(result.plaintext, plain).toFixed(2),
      fitness: result.fitness.toFixed(2),
      seconds: ((performance.now() - start) / 1000).toFixed(1),
    });
  }
});
