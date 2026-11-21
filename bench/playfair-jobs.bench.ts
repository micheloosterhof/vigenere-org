// ABOUTME: Benchmark of single Playfair annealing runs by text length, run length and the temperatures a run starts and ends at.
// ABOUTME: The share of runs that reach English says which settings the breaker's rounds should use.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { seededRng } from "../src/lib/anneal";
import { playfair } from "../src/lib/playfair";
import { annealPlayfair } from "../src/lib/solve-playfair";
import {
  ownTrials,
  plaintextSlice,
  randomKey,
  record,
  sameSymbols,
  TABLE,
} from "./trials";

const JOBS = 8;

// Temperatures per letter of text that a run starts and ends at.
const SCHEDULES: [start: number, end: number][] = [
  [0.4, 0],
  [1, 0],
  [2, 0],
  [4, 0],
  [1, 0.5],
  [1, 0.7],
  [1, 0.85],
  [1, 1],
  [1.2, 0.8],
  [0.9, 0.8],
  [0.7, 0.7],
  [0.5, 0.5],
];

interface Trial {
  letters: number;
  repeat: number;
  iterations: number;
  temperatureFactor: number;
  endTemperatureFactor: number;
}

const trials: Trial[] = [];
for (const letters of [150, 200, 300, 400]) {
  for (let repeat = 0; repeat < 4; repeat += 1) {
    for (const iterations of [300000, 1000000]) {
      for (const [temperatureFactor, endTemperatureFactor] of SCHEDULES) {
        trials.push({
          letters,
          repeat,
          iterations,
          temperatureFactor,
          endTemperatureFactor,
        });
      }
    }
  }
}

it("single playfair runs", () => {
  for (const trial of ownTrials(trials)) {
    const { letters, repeat, iterations } = trial;
    const { temperatureFactor, endTemperatureFactor } = trial;
    // The settings are left out of the seed, so they attack the same
    // ciphertexts from the same starts.
    const rng = seededRng(8 * 1000000 + letters * 1000 + repeat);
    const plain = plaintextSlice(letters, rng);
    const key = randomKey(10, rng);
    const ciphertext = playfair(plain, key, "encrypt");
    // The plaintext as the true key gives it back, fillers and all.
    const padded = playfair(ciphertext, key, "decrypt");
    for (let job = 0; job < JOBS; job += 1) {
      const start = performance.now();
      const result = annealPlayfair(ciphertext, TABLE, {
        rng: seededRng(Math.floor(rng() * 2 ** 31)),
        iterations,
        temperatureFactor,
        endTemperatureFactor,
      });
      record("playfair-jobs", {
        letters,
        repeat,
        iterations,
        temperatureFactor,
        endTemperatureFactor,
        job,
        english: result.english ? 1 : 0,
        accuracy: sameSymbols(result.plaintext, padded).toFixed(2),
        fitness: result.fitness.toFixed(2),
        seconds: ((performance.now() - start) / 1000).toFixed(1),
      });
    }
  }
});
