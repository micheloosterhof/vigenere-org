// ABOUTME: Benchmark of the Quagmire IV breaker with nothing given: it must find the period and both keyword sizes itself.
// ABOUTME: Besides Quagmire IV texts it attacks texts without keyword alphabets, which must not be reported as found.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { randomPermutation, seededRng } from "../src/lib/anneal";
import { quagmire } from "../src/lib/quagmire";
import { breakQuagmireIv } from "../src/lib/solve-quagmire-iv";
import {
  accuracy,
  keywordWith,
  ownTrials,
  plaintextSlice,
  randomKey,
  randomLetters,
  record,
  TABLE,
} from "./trials";

type Kind = "quagmire-iv" | "random-alphabets" | "random-letters";

interface Trial {
  kind: Kind;
  period: number;
  plainSize: number;
  cipherSize: number;
  perColumn: number;
  repeat: number;
}

const trials: Trial[] = [];
for (const period of [4, 7, 10]) {
  for (const perColumn of [32, 48, 64, 96]) {
    for (const [plainSize, cipherSize] of [
      [5, 5],
      [7, 7],
      [5, 8],
      [8, 8],
      [9, 9],
    ]) {
      for (let repeat = 0; repeat < 2; repeat += 1) {
        trials.push({
          kind: "quagmire-iv",
          period,
          plainSize,
          cipherSize,
          perColumn,
          repeat,
        });
      }
    }
    for (const kind of ["random-alphabets", "random-letters"] as const) {
      trials.push({
        kind,
        period,
        plainSize: 0,
        cipherSize: 0,
        perColumn,
        repeat: 0,
      });
    }
  }
}

/** Enciphers with an unrelated random alphabet for each of `period` columns. */
function randomAlphabets(
  plain: string,
  period: number,
  rng: () => number,
): string {
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

it("quagmire IV breaker with nothing given", () => {
  for (const trial of ownTrials(trials)) {
    const { kind, period, plainSize, cipherSize, perColumn, repeat } = trial;
    const rng = seededRng(
      kind.length * 10000000 +
        period * 1000000 +
        plainSize * 100000 +
        cipherSize * 10000 +
        perColumn * 10 +
        repeat,
    );
    const letters = period * perColumn;
    const plain = plaintextSlice(letters, rng);
    let keyword = "";
    let keyword2 = "";
    let ciphertext: string;
    if (kind === "quagmire-iv") {
      keyword = keywordWith(plainSize, rng);
      keyword2 = keywordWith(cipherSize, rng);
      ciphertext = quagmire(
        plain,
        {
          variant: 4,
          keyword,
          keyword2,
          key: randomKey(period, rng),
          indicator: "A",
        },
        "encrypt",
      );
    } else if (kind === "random-alphabets") {
      ciphertext = randomAlphabets(plain, period, rng);
    } else {
      ciphertext = randomLetters(letters, rng);
    }
    let jobs = 0;
    const start = performance.now();
    const result = breakQuagmireIv(ciphertext, TABLE, {
      rng,
      onProgress: (done) => {
        jobs = done;
      },
    });
    record("quagmire-iv-unknown", {
      kind,
      period,
      plainSize,
      cipherSize,
      perColumn,
      letters,
      keyword,
      keyword2,
      repeat,
      found: result.found ? 1 : 0,
      foundPeriod: result.period,
      accuracy:
        kind === "random-letters"
          ? ""
          : accuracy(result.plaintext, plain).toFixed(2),
      fitness: result.fitness.toFixed(2),
      jobs,
      seconds: ((performance.now() - start) / 1000).toFixed(1),
    });
  }
});
