// ABOUTME: Benchmark of the annealing breakers for Bifid, Trifid and double transposition by text length.
// ABOUTME: Each length gets true ciphertexts and a text with nothing to find, which must not come out reading as English.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { seededRng } from "../src/lib/anneal";
import { bifid } from "../src/lib/bifid";
import { breakDoubleTransposition } from "../src/lib/solve-double-transposition";
import { breakFractionation } from "../src/lib/solve-fractionation";
import { doubleTransposition } from "../src/lib/transposition";
import { trifid } from "../src/lib/trifid";
import {
  accuracy,
  ownTrials,
  plaintextSlice,
  randomKey,
  randomLetters,
  record,
  shuffledLetters,
  TABLE,
} from "./trials";

interface Trial {
  solver: "bifid" | "trifid" | "double-transposition";
  letters: number;
  /** Period of a Bifid or Trifid; length of the first key of a double transposition. */
  size: number;
  repeat: number;
}

const trials: Trial[] = [];
for (const solver of ["bifid", "trifid", "double-transposition"] as const) {
  for (const letters of [100, 150, 200, 300]) {
    for (const size of solver === "double-transposition" ? [5, 7] : [5, 9]) {
      for (let repeat = 0; repeat < 4; repeat += 1) {
        trials.push({ solver, letters, size, repeat });
      }
    }
  }
}

it("annealing breakers by text length", () => {
  for (const { solver, letters, size, repeat } of ownTrials(trials)) {
    const rng = seededRng(
      solver.length * 1000000 + letters * 1000 + size * 10 + repeat,
    );
    // Bifid has no J: its square merges it with I.
    const plain = plaintextSlice(letters, rng).replace(/J/g, "I");
    // Three trials hold a real ciphertext, the fourth has nothing to find.
    const real = repeat < 3;
    const secondSize = size + 2;
    let ciphertext: string;
    if (!real) {
      ciphertext =
        solver === "double-transposition"
          ? shuffledLetters(plain, rng)
          : randomLetters(letters, rng).replace(/J/g, "I");
    } else if (solver === "double-transposition") {
      ciphertext = doubleTransposition(
        plain,
        randomKey(size, rng),
        randomKey(secondSize, rng),
        "encrypt",
      );
    } else {
      const key = randomKey(10, rng);
      ciphertext =
        solver === "bifid"
          ? bifid(plain, key, size, "encrypt")
          : trifid(plain, key, size, "encrypt");
    }
    const start = performance.now();
    const result =
      solver === "double-transposition"
        ? breakDoubleTransposition(ciphertext, size, secondSize, TABLE, { rng })
        : breakFractionation(solver, ciphertext, TABLE, { rng });
    record("annealing-solvers", {
      solver,
      letters,
      size,
      kind: real ? "true" : "nothing",
      accuracy: real ? accuracy(result.plaintext, plain).toFixed(2) : "",
      fitness: result.fitness.toFixed(2),
      english: result.english ? 1 : 0,
      seconds: ((performance.now() - start) / 1000).toFixed(1),
    });
  }
});
