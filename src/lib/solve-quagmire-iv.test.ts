// ABOUTME: Tests for the Quagmire IV breaker, which recovers two different alphabet keywords.
// ABOUTME: A synthetic text must fall with both keywords, the period key and the plaintext recovered.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seededRng } from "./anneal";
import { quagmire } from "./quagmire";
import { toLetterValues } from "./solve";
import { breakQuagmireIv, runQuagmireIvJob } from "./solve-quagmire-iv";

const TABLE = new Uint8Array(
  readFileSync(
    new URL("../../public/data/english-quadgrams.bin", import.meta.url),
  ),
);

const PLAIN =
  "It was a bright cold day in April, and the clocks were striking thirteen. " +
  "Winston Smith, his chin nuzzled into his breast in an effort to escape " +
  "the vile wind, slipped quickly through the glass doors of Victory " +
  "Mansions, though not quickly enough to prevent a swirl of gritty dust " +
  "from entering along with him.";

const CIPHERTEXT = quagmire(
  PLAIN,
  {
    variant: 4,
    keyword: "MACHINE",
    keyword2: "JUPITER",
    key: "WONDER",
    indicator: "A",
  },
  "encrypt",
);

describe("runQuagmireIvJob", () => {
  it("solves one period and pair of keyword sizes", { timeout: 120000 }, () => {
    const job = { period: 6, plainSize: 7, cipherSize: 7, runs: 30 };
    const solution = runQuagmireIvJob(
      toLetterValues(CIPHERTEXT),
      job,
      TABLE,
      seededRng(1),
    );
    expect(solution).toMatchObject(job);
    expect(solution.fitness).toBeGreaterThan(-4.5);
    expect(solution.offsets).toHaveLength(6);
    expect(Number.isFinite(solution.score)).toBe(true);
    expect(solution.pairsCompleted).toBeGreaterThanOrEqual(1);
    expect(solution.pairsCompleted).toBeLessThan(30);
  });

  it("scores a wrong period below the true one", { timeout: 120000 }, () => {
    const cipher = toLetterValues(CIPHERTEXT);
    const sizes = { plainSize: 7, cipherSize: 7, runs: 10 };
    const right = runQuagmireIvJob(
      cipher,
      { period: 6, ...sizes },
      TABLE,
      seededRng(4),
    );
    const wrong = runQuagmireIvJob(
      cipher,
      { period: 5, ...sizes },
      TABLE,
      seededRng(4),
    );
    expect(wrong.fitness).toBeLessThan(-4.5);
    expect(wrong.score).toBeLessThan(right.score);
  });
});

describe("breakQuagmireIv", () => {
  it(
    "recovers both keywords, the key and the plaintext",
    { timeout: 120000 },
    () => {
      const result = breakQuagmireIv(CIPHERTEXT, TABLE, {
        periods: [6],
        sizes: [[7, 7]],
        runs: 30,
        rng: seededRng(1),
      });
      expect(result.found).toBe(true);
      expect(result.plainKeyword).toBe("MACHINE");
      expect(result.cipherKeyword).toBe("JUPITER");
      expect(result.plainAlphabet).toBe("MACHINEBDFGJKLOPQRSTUVWXYZ");
      expect(result.cipherAlphabet).toBe("JUPITERABCDFGHKLMNOQSVWXYZ");
      expect(result.period).toBe(6);
      expect(result.key).toBe("WONDER");
      expect(result.indicator).toBe("A");
      expect(result.plaintext).toBe(PLAIN);
    },
  );

  it("reports not found at a wrong period", { timeout: 120000 }, () => {
    const result = breakQuagmireIv(CIPHERTEXT, TABLE, {
      periods: [5],
      sizes: [[7, 7]],
      runs: 10,
      rng: seededRng(2),
    });
    expect(result.found).toBe(false);
  });

  it("reports each period and size pair as a step", { timeout: 120000 }, () => {
    const seen: [number, number][] = [];
    breakQuagmireIv(CIPHERTEXT, TABLE, {
      periods: [5, 7],
      sizes: [[7, 7]],
      runs: 4,
      rng: seededRng(3),
      onProgress: (done, total) => seen.push([done, total]),
    });
    expect(seen).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});
