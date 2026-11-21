// ABOUTME: Benchmark of the Playfair breaker on short ciphertexts, 100 to 150 letters, at several bars for reading as English.
// ABOUTME: Shows how English a wrong square can look on a short text, which sets the bar and the least text the breaker accepts.
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
  record,
  sameSymbols,
  TABLE,
} from "./trials";

interface Trial {
  letters: number;
  repeat: number;
  englishFitness: number;
}

const trials: Trial[] = [];
for (const letters of [100, 110, 125, 140, 150]) {
  for (let repeat = 0; repeat < 12; repeat += 1) {
    for (const englishFitness of [-4.7, -4.5]) {
      trials.push({ letters, repeat, englishFitness });
    }
  }
}

it("playfair breaker on short ciphertexts", () => {
  for (const { letters, repeat, englishFitness } of ownTrials(trials)) {
    // The bar is left out of the seed, so each bar meets the same ciphertexts
    // and the same runs.
    const rng = seededRng(10 * 1000000 + letters * 1000 + repeat);
    const plain = plaintextSlice(letters, rng);
    const key = randomKey(10, rng);
    const ciphertext = playfair(plain, key, "encrypt");
    // The plaintext as the true key gives it back, fillers and all.
    const padded = playfair(ciphertext, key, "decrypt");
    const start = performance.now();
    const result = breakPlayfair(ciphertext, TABLE, { rng, englishFitness });
    record("playfair-short", {
      letters,
      repeat,
      englishFitness,
      english: result.english ? 1 : 0,
      accuracy: sameSymbols(result.plaintext, padded).toFixed(2),
      fitness: result.fitness.toFixed(2),
      seconds: ((performance.now() - start) / 1000).toFixed(1),
    });
  }
});
