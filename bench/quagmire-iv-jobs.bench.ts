// ABOUTME: Benchmark of single Quagmire IV jobs with guessed keyword sizes and periods, at several numbers of annealing runs.
// ABOUTME: Shows which guesses solve a text, how soon, and whether the best letter-set score points at the right guess.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { seededRng } from "../src/lib/anneal";
import { quagmire } from "../src/lib/quagmire";
import { decryptWithAlphabets } from "../src/lib/quagmire-key-climb";
import { toLetterValues } from "../src/lib/solve";
import { runQuagmireIvJob } from "../src/lib/solve-quagmire-iv";
import { readableFitness } from "../src/lib/solve-quagmire-letter-sets";
import {
  accuracy,
  keywordWith,
  ownTrials,
  plaintextSlice,
  randomKey,
  record,
  TABLE,
} from "./trials";

const GUESSED_SIZES = [6, 8, 10];
const RUNS = [30, 100];

interface Trial {
  period: number;
  plainSize: number;
  cipherSize: number;
  perColumn: number;
  repeat: number;
  guessPeriod: number;
  guessPlain: number;
  guessCipher: number;
  runs: number;
}

/** The smallest guessed size that holds a keyword of `size` different letters. */
const fitting = (size: number): number =>
  GUESSED_SIZES.find((guess) => guess >= size) ?? size;

const trials: Trial[] = [];
for (const period of [4, 6, 8]) {
  for (const [plainSize, cipherSize] of [
    [5, 5],
    [7, 7],
    [9, 9],
    [5, 8],
  ]) {
    for (const perColumn of [48, 64, 96]) {
      for (let repeat = 0; repeat < 2; repeat += 1) {
        const text = { period, plainSize, cipherSize, perColumn, repeat };
        for (const runs of RUNS) {
          // Every pair of guessed sizes at the true period.
          for (const guessPlain of GUESSED_SIZES) {
            for (const guessCipher of GUESSED_SIZES) {
              trials.push({
                ...text,
                guessPeriod: period,
                guessPlain,
                guessCipher,
                runs,
              });
            }
          }
          // The fitting sizes at a wrong period and at twice the period.
          for (const guessPeriod of [period + 1, 2 * period]) {
            trials.push({
              ...text,
              guessPeriod,
              guessPlain: fitting(plainSize),
              guessCipher: fitting(cipherSize),
              runs,
            });
          }
        }
      }
    }
  }
}

it("quagmire IV jobs with guessed sizes and periods", () => {
  for (const trial of ownTrials(trials)) {
    const { period, plainSize, cipherSize, perColumn, repeat } = trial;
    // The guesses are left out of the seed, so they attack the same ciphertext.
    const rng = seededRng(
      period * 1000000 +
        plainSize * 100000 +
        cipherSize * 10000 +
        perColumn * 10 +
        repeat,
    );
    const keyword = keywordWith(plainSize, rng);
    const keyword2 = keywordWith(cipherSize, rng);
    const letters = period * perColumn;
    const plain = plaintextSlice(letters, rng);
    const key = randomKey(period, rng);
    const cipher = toLetterValues(
      quagmire(
        plain,
        { variant: 4, keyword, keyword2, key, indicator: "A" },
        "encrypt",
      ),
    );
    const start = performance.now();
    const solution = runQuagmireIvJob(
      cipher,
      {
        period: trial.guessPeriod,
        plainSize: trial.guessPlain,
        cipherSize: trial.guessCipher,
        runs: trial.runs,
      },
      TABLE,
      rng,
    );
    const recovered = decryptWithAlphabets(
      cipher,
      solution.plainAlphabet,
      solution.cipherAlphabet,
      solution.offsets,
    )
      .map((value) => String.fromCharCode(65 + value))
      .join("");
    record("quagmire-iv-jobs", {
      period,
      plainSize,
      cipherSize,
      perColumn,
      repeat,
      guessPeriod: trial.guessPeriod,
      guessPlain: trial.guessPlain,
      guessCipher: trial.guessCipher,
      runs: trial.runs,
      found: solution.fitness >= readableFitness(letters) ? 1 : 0,
      accuracy: accuracy(recovered, plain).toFixed(2),
      fitness: solution.fitness.toFixed(2),
      score: solution.score.toFixed(1),
      pairsCompleted: solution.pairsCompleted,
      seconds: ((performance.now() - start) / 1000).toFixed(1),
    });
  }
});
