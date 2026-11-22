// ABOUTME: Benchmark of how low the bar for reading as English can go for the Playfair breaker on 100 and 110 letters.
// ABOUTME: Records every run of every text at each bar, so a run that stops on a wrong square shows up.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { seededRng } from "../src/lib/anneal";
import { playfair } from "../src/lib/playfair";
import {
  annealPlayfair,
  PLAYFAIR_RUNS,
  type PlayfairCandidate,
} from "../src/lib/solve-playfair";
import {
  englishFitness,
  ownTrials,
  plaintextSlice,
  randomKey,
  record,
  sameSymbols,
  TABLE,
} from "./trials";

// From the lowest bar up, so that a run under one bar is under the next too.
const BARS = [-4.6, -4.55, -4.5];

const TEXTS = 100;

interface Trial {
  letters: number;
  repeat: number;
}

const trials: Trial[] = [];
for (const letters of [100, 110]) {
  for (let repeat = 0; repeat < TEXTS; repeat += 1) {
    trials.push({ letters, repeat });
  }
}

it("playfair bar for english on short ciphertexts", () => {
  for (const { letters, repeat } of ownTrials(trials)) {
    const rng = seededRng(13 * 1000000 + letters * 1000 + repeat);
    const plain = plaintextSlice(letters, rng);
    const key = randomKey(10, rng);
    const ciphertext = playfair(plain, key, "encrypt");
    // The plaintext as the true key gives it back, fillers and all.
    const padded = playfair(ciphertext, key, "decrypt");
    const trueFitness = englishFitness(padded).quadgram.toFixed(2);
    for (let job = 0; job < PLAYFAIR_RUNS; job += 1) {
      // Every bar meets the same run: the bar only says when the run stops.
      const seed = Math.floor(rng() * 2 ** 31);
      let result: PlayfairCandidate | null = null;
      let seconds = 0;
      for (const bar of BARS) {
        // A run that stayed under the bar before is the same run at this one.
        if (result === null || result.english) {
          const start = performance.now();
          result = annealPlayfair(ciphertext, TABLE, {
            rng: seededRng(seed),
            englishFitness: bar,
          });
          seconds = (performance.now() - start) / 1000;
        }
        record("playfair-bar", {
          letters,
          repeat,
          job,
          bar,
          ciphertextLetters: ciphertext.length,
          trueFitness,
          english: result.english ? 1 : 0,
          accuracy: sameSymbols(result.plaintext, padded).toFixed(2),
          fitness: result.fitness.toFixed(2),
          seconds: seconds.toFixed(1),
        });
      }
    }
  }
});
