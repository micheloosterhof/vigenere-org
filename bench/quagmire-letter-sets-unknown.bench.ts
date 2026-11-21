// ABOUTME: Benchmark of the Quagmire letter-set scan when nothing is given: it must find variant, period and keyword size.
// ABOUTME: Also attacks texts with no keyword alphabet to find (random letters, a random alphabet, free alphabets), which must not be reported as found.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { randomPermutation, seededRng } from "../src/lib/anneal";
import { quagmire } from "../src/lib/quagmire";
import { breakQuagmireLetterSets } from "../src/lib/solve-quagmire-letter-sets";
import {
  accuracy,
  keywordWith,
  ownTrials,
  plaintextSlice,
  randomKey,
  record,
  TABLE,
} from "./trials";

type Kind = "keyword" | "random-letters" | "random-alphabet" | "free-alphabets";

interface Trial {
  kind: Kind;
  variant: 1 | 2 | 3;
  period: number;
  size: number;
  perColumn: number;
  repeat: number;
}

const trials: Trial[] = [];
for (const variant of [1, 2, 3] as const) {
  for (const period of [4, 6, 9, 12]) {
    for (const size of [5, 7, 9]) {
      for (const perColumn of [16, 24, 48]) {
        for (let repeat = 0; repeat < 2; repeat += 1) {
          trials.push({
            kind: "keyword",
            variant,
            period,
            size,
            perColumn,
            repeat,
          });
        }
      }
    }
  }
}
for (const kind of [
  "random-letters",
  "random-alphabet",
  "free-alphabets",
] as const) {
  for (const period of [5, 8]) {
    for (const perColumn of [12, 20, 40]) {
      for (let repeat = 0; repeat < 2; repeat += 1) {
        trials.push({ kind, variant: 3, period, size: 0, perColumn, repeat });
      }
    }
  }
}

const letterOf = (value: number): string => String.fromCharCode(65 + value);

/** The ciphertext of a trial: only the "keyword" kind has a keyword alphabet to find. */
function encrypt(trial: Trial, plain: string, rng: () => number): string {
  const { kind, variant, period, size } = trial;
  if (kind === "random-letters") {
    return Array.from(plain, () => letterOf(Math.floor(rng() * 26))).join("");
  }
  if (kind === "free-alphabets") {
    const alphabets = Array.from({ length: period }, () =>
      randomPermutation(26, rng),
    );
    return Array.from(plain, (letter, i) =>
      letterOf(alphabets[i % period][letter.charCodeAt(0) - 65]),
    ).join("");
  }
  const keyword =
    kind === "keyword"
      ? keywordWith(size, rng)
      : randomPermutation(26, rng).map(letterOf).join("");
  const key = randomKey(period, rng);
  return quagmire(plain, { variant, keyword, key, indicator: "A" }, "encrypt");
}

it("quagmire letter-set scan with nothing given", () => {
  for (const trial of ownTrials(trials)) {
    const { kind, variant, period, size, perColumn, repeat } = trial;
    const rng = seededRng(
      trials.indexOf(trial) * 7919 + period * 100 + perColumn + repeat,
    );
    const letters = period * perColumn;
    const plain = plaintextSlice(letters, rng);
    const ciphertext = encrypt(trial, plain, rng);
    const start = performance.now();
    const result = breakQuagmireLetterSets(ciphertext, TABLE, { rng });
    record("quagmire-letter-sets-unknown", {
      kind,
      variant,
      period,
      size,
      perColumn,
      letters,
      found: result.found ? 1 : 0,
      foundVariant: result.variant,
      foundPeriod: result.period,
      accuracy: accuracy(result.plaintext, plain).toFixed(2),
      fitness: result.fitness.toFixed(2),
      seconds: ((performance.now() - start) / 1000).toFixed(1),
    });
  }
});
