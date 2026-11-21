// ABOUTME: The trial grid shared by the Quagmire dictionary attack benchmarks: variant, period and letters per column.
// ABOUTME: Each cell has three listed keywords and one random unlisted keyword, which must not be reported as found.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { seededRng } from "../src/lib/anneal";
import { quagmire } from "../src/lib/quagmire";
import type { QuagmireDictionaryResult } from "../src/lib/solve-quagmire-dictionary";
import {
  accuracy,
  keywordWith,
  ownTrials,
  plaintextSlice,
  randomKey,
  record,
  TABLE,
  WORDS,
} from "./trials";

type Solver = (
  text: string,
  words: string[],
  table: Uint8Array,
  options: { rng: () => number },
) => QuagmireDictionaryResult;

/** Seven random different letters, as a keyword no word list contains. */
function unlistedKeyword(rng: () => number): string {
  const letters = new Set<string>();
  while (letters.size < 7) {
    letters.add(String.fromCharCode(65 + Math.floor(rng() * 26)));
  }
  return [...letters].join("");
}

/** Runs this process's share of the grid and records one row per trial. */
export function runDictionaryGrid(
  benchmark: string,
  solver: Solver,
  periods: number[],
  perColumns: number[],
): void {
  const trials: {
    variant: 1 | 2 | 3;
    period: number;
    perColumn: number;
    repeat: number;
  }[] = [];
  for (const variant of [1, 2, 3] as const) {
    for (const period of periods) {
      for (const perColumn of perColumns) {
        for (let repeat = 0; repeat < 4; repeat += 1) {
          trials.push({ variant, period, perColumn, repeat });
        }
      }
    }
  }
  for (const { variant, period, perColumn, repeat } of ownTrials(trials)) {
    const rng = seededRng(
      variant * 1000000 + period * 10000 + perColumn * 100 + repeat,
    );
    const listed = repeat < 3;
    const keyword = listed
      ? keywordWith([5, 7, 9][repeat], rng)
      : unlistedKeyword(rng);
    const letters = period * perColumn;
    const plain = plaintextSlice(letters, rng);
    const key = randomKey(period, rng);
    const ciphertext = quagmire(
      plain,
      { variant, keyword, key, indicator: "A" },
      "encrypt",
    );
    const start = performance.now();
    const result = solver(ciphertext, WORDS, TABLE, { rng });
    record(benchmark, {
      variant,
      period,
      perColumn,
      letters,
      listed: listed ? 1 : 0,
      keyword,
      found: result.found ? 1 : 0,
      foundPeriod: result.period,
      accuracy: accuracy(result.plaintext, plain).toFixed(2),
      fitness: result.fitness.toFixed(2),
      seconds: ((performance.now() - start) / 1000).toFixed(1),
    });
  }
}
