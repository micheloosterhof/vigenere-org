// ABOUTME: Benchmark of the Playfair breaker by text length, with nothing given.
// ABOUTME: Each length gets true ciphertexts and texts of random letters, which must not come out reading as English.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { seededRng } from "../src/lib/anneal";
import { playfair } from "../src/lib/playfair";
import { breakPlayfair } from "../src/lib/solve-playfair";
import {
  ownTrials,
  plaintextSlice,
  randomKey,
  randomLetters,
  record,
  sameSymbols,
  TABLE,
} from "./trials";

interface Trial {
  letters: number;
  kind: "true" | "nothing";
  repeat: number;
}

const trials: Trial[] = [];
for (const letters of [100, 125, 150, 200, 300]) {
  for (let repeat = 0; repeat < 8; repeat += 1) {
    trials.push({ letters, kind: "true", repeat });
  }
  for (let repeat = 0; repeat < 3; repeat += 1) {
    trials.push({ letters, kind: "nothing", repeat });
  }
}

it("playfair breaker by text length", () => {
  for (const { letters, kind, repeat } of ownTrials(trials)) {
    const rng = seededRng(
      9 * 1000000 + letters * 1000 + (kind === "true" ? 0 : 500) + repeat,
    );
    const plain = plaintextSlice(letters, rng);
    const key = randomKey(10, rng);
    // Encryption splits doubled letters and pads, so the ciphertext is a
    // little longer than the plaintext, and always even.
    const ciphertext =
      kind === "true"
        ? playfair(plain, key, "encrypt")
        : randomLetters(letters + (letters % 2), rng);
    // The plaintext as the true key gives it back, fillers and all.
    const padded = kind === "true" ? playfair(ciphertext, key, "decrypt") : "";
    const start = performance.now();
    const result = breakPlayfair(ciphertext, TABLE, { rng });
    record("playfair", {
      letters,
      kind,
      repeat,
      ciphertextLetters: ciphertext.length,
      english: result.english ? 1 : 0,
      accuracy:
        kind === "true" ? sameSymbols(result.plaintext, padded).toFixed(2) : "",
      fitness: result.fitness.toFixed(2),
      seconds: ((performance.now() - start) / 1000).toFixed(1),
    });
  }
});
