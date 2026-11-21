// ABOUTME: Tests for the Quagmire IV breaker, which recovers two different alphabet keywords.
// ABOUTME: A synthetic text must fall with both keywords, the period key and the plaintext recovered.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seededRng } from "./anneal";
import { quagmire } from "./quagmire";
import { toLetterValues } from "./solve";
import {
  breakQuagmireIv,
  planQuagmireIvJobs,
  quagmireIvPeriods,
  quagmireIvResult,
  runQuagmireIvJob,
} from "./solve-quagmire-iv";

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

  it("completes only the best-scoring pairs", { timeout: 120000 }, () => {
    const solution = runQuagmireIvJob(
      toLetterValues(CIPHERTEXT),
      { period: 5, plainSize: 7, cipherSize: 7, runs: 40 },
      TABLE,
      seededRng(5),
    );
    expect(solution.pairsCompleted).toBe(20);
  });
});

describe("planQuagmireIvJobs", () => {
  const cipher = toLetterValues(CIPHERTEXT);

  it("plans the quick jobs of every period before any longer one", () => {
    const jobs = planQuagmireIvJobs(cipher, {
      periods: [5, 7],
      sizes: [
        [6, 6],
        [8, 8],
      ],
      rounds: [10, 40],
    });
    expect(jobs.map((job) => [job.runs, job.period])).toEqual([
      [10, 5],
      [10, 5],
      [10, 7],
      [10, 7],
      [40, 5],
      [40, 5],
      [40, 7],
      [40, 7],
    ]);
    expect(jobs[1]).toEqual({
      period: 5,
      plainSize: 8,
      cipherSize: 8,
      runs: 10,
    });
  });

  it("by default tries the likeliest periods that leave enough letters per column", () => {
    const periods = quagmireIvPeriods(cipher);
    expect(periods[0]).toBe(6);
    expect(periods.length).toBeLessThanOrEqual(2);
    for (const period of periods) {
      expect(cipher.length / period).toBeGreaterThanOrEqual(24);
    }
    const jobs = planQuagmireIvJobs(cipher);
    expect(new Set(jobs.map((job) => job.period))).toEqual(new Set(periods));
    expect(jobs[0].runs).toBeLessThan(jobs[jobs.length - 1].runs);
  });
});

describe("quagmireIvResult", () => {
  const solved = breakQuagmireIv(CIPHERTEXT, TABLE, {
    periods: [6],
    sizes: [[7, 7]],
    rounds: [30],
    rng: seededRng(1),
  });
  const values = (letters: string): number[] =>
    [...letters].map((letter) => letter.charCodeAt(0) - 65);
  const solution = {
    plainAlphabet: values(solved.plainAlphabet),
    cipherAlphabet: values(solved.cipherAlphabet),
    offsets: solved.offsets,
    fitness: solved.fitness,
  };

  it("reports the period itself for a solution at a multiple of it", () => {
    const result = quagmireIvResult(CIPHERTEXT, {
      ...solution,
      offsets: [...solved.offsets, ...solved.offsets],
    });
    expect(result.period).toBe(6);
    expect(result.key).toBe("WONDER");
    expect(result.plaintext).toBe(PLAIN);
  });

  it("names the keywords of alphabets that came out turned", () => {
    // Either alphabet turned by some places decrypts the same once every
    // shift is turned to match: with the plaintext alphabet, against the
    // ciphertext alphabet.
    const turned = (alphabet: number[], places: number): number[] =>
      alphabet.map((_, i) => alphabet[(i + places) % 26]);
    const result = quagmireIvResult(CIPHERTEXT, {
      ...solution,
      plainAlphabet: turned(solution.plainAlphabet, 25),
      cipherAlphabet: turned(solution.cipherAlphabet, 24),
      offsets: solved.offsets.map((offset) => (offset + 25 - 24 + 26) % 26),
    });
    expect(result.plaintext).toBe(PLAIN);
    expect(result.plainKeyword).toBe("MACHINE");
    expect(result.cipherKeyword).toBe("JUPITER");
    expect(result.key).toBe("WONDER");
  });
});

describe("breakQuagmireIv", () => {
  it(
    "finds the period and the keyword sizes itself",
    { timeout: 120000 },
    () => {
      const result = breakQuagmireIv(CIPHERTEXT, TABLE, { rng: seededRng(7) });
      expect(result.found).toBe(true);
      expect(result.plainKeyword).toBe("MACHINE");
      expect(result.cipherKeyword).toBe("JUPITER");
      expect(result.period).toBe(6);
      expect(result.key).toBe("WONDER");
      expect(result.plaintext).toBe(PLAIN);
    },
  );

  it(
    "decrypts the whole of a text longer than it searches",
    { timeout: 120000 },
    () => {
      const long = Array.from({ length: 5 }, () => PLAIN).join(" ");
      const ciphertext = quagmire(
        long,
        {
          variant: 4,
          keyword: "MACHINE",
          keyword2: "JUPITER",
          key: "WONDER",
          indicator: "A",
        },
        "encrypt",
      );
      const result = breakQuagmireIv(ciphertext, TABLE, {
        periods: [6],
        sizes: [[7, 7]],
        rounds: [30],
        rng: seededRng(1),
      });
      expect(result.found).toBe(true);
      expect(result.plaintext).toBe(long);
    },
  );

  it(
    "recovers both keywords, the key and the plaintext",
    { timeout: 120000 },
    () => {
      const result = breakQuagmireIv(CIPHERTEXT, TABLE, {
        periods: [6],
        sizes: [[7, 7]],
        rounds: [30],
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
      rounds: [10],
      rng: seededRng(2),
    });
    expect(result.found).toBe(false);
  });

  it("reports each period and size pair as a step", { timeout: 120000 }, () => {
    const seen: [number, number][] = [];
    breakQuagmireIv(CIPHERTEXT, TABLE, {
      periods: [5, 7],
      sizes: [[7, 7]],
      rounds: [4],
      rng: seededRng(3),
      onProgress: (done, total) => seen.push([done, total]),
    });
    expect(seen).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});
