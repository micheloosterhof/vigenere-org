// ABOUTME: Benchmark of the general polyalphabetic solver over period and letters per column, with the period given.
// ABOUTME: Besides true ciphertexts it attacks random letters and a text of another period, to see how English a wrong answer looks.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { randomPermutation, seededRng } from "../src/lib/anneal";
import { breakPolyalphabetic } from "../src/lib/solve-polyalphabetic";
import { accuracy, ownTrials, plaintextSlice, record, TABLE } from "./trials";

type Kind = "true" | "random" | "other-period";

interface Trial {
  period: number;
  perColumn: number;
  kind: Kind;
  repeat: number;
}

const trials: Trial[] = [];
for (const period of [2, 3, 5, 8, 12]) {
  for (const perColumn of [25, 50, 75, 100, 125, 150, 200, 300]) {
    for (let repeat = 0; repeat < 20; repeat += 1) {
      const kind =
        repeat < 10 ? "true" : repeat < 15 ? "random" : "other-period";
      trials.push({ period, perColumn, kind, repeat });
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

it("polyalphabetic solver grid", () => {
  for (const { period, perColumn, kind, repeat } of ownTrials(trials)) {
    const rng = seededRng(period * 100000 + perColumn * 100 + repeat);
    const letters = period * perColumn;
    const plain = plaintextSlice(letters, rng);
    const ciphertext =
      kind === "random"
        ? Array.from({ length: letters }, () =>
            String.fromCharCode(65 + Math.floor(rng() * 26)),
          ).join("")
        : encrypt(plain, kind === "true" ? period : period + 1, rng);
    const start = performance.now();
    const result = breakPolyalphabetic(ciphertext, TABLE, { period, rng });
    record("polyalphabetic", {
      period,
      perColumn,
      letters,
      kind,
      accuracy:
        kind === "true" ? accuracy(result.plaintext, plain).toFixed(2) : "",
      fitness: result.fitness.toFixed(2),
      seconds: ((performance.now() - start) / 1000).toFixed(1),
    });
  }
});
