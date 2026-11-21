// ABOUTME: Benchmark of the Bifid and Trifid breakers on random letters, where there is nothing to find.
// ABOUTME: Shows how English the best wrong decryption looks at each length, which sets the least text the breakers accept.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { seededRng } from "../src/lib/anneal";
import { breakFractionation } from "../src/lib/solve-fractionation";
import { ownTrials, randomLetters, record, TABLE } from "./trials";

interface Trial {
  cipher: "bifid" | "trifid";
  letters: number;
  repeat: number;
}

const trials: Trial[] = [];
for (const cipher of ["bifid", "trifid"] as const) {
  for (const letters of [100, 125, 150]) {
    for (let repeat = 0; repeat < 12; repeat += 1) {
      trials.push({ cipher, letters, repeat });
    }
  }
}

it("fractionation breakers on random letters", () => {
  for (const { cipher, letters, repeat } of ownTrials(trials)) {
    const rng = seededRng(cipher.length * 1000000 + letters * 1000 + repeat);
    // Bifid has no J: its square merges it with I.
    const ciphertext = randomLetters(letters, rng).replace(/J/g, "I");
    const start = performance.now();
    const result = breakFractionation(cipher, ciphertext, TABLE, { rng });
    record("fractionation-noise", {
      cipher,
      letters,
      repeat,
      english: result.english ? 1 : 0,
      fitness: result.fitness.toFixed(2),
      seconds: ((performance.now() - start) / 1000).toFixed(1),
    });
  }
});
