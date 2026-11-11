// ABOUTME: Unit tests for the simulated annealing core and its helpers.
// ABOUTME: Uses a toy problem with a known optimum, so the search itself is tested without cipher code.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  anneal,
  averageLog10,
  quadgramRaw,
  randomPermutation,
  seededRng,
  swapTwo,
} from "./anneal";
import { quadgramFitness } from "./quadgrams";
import { toLetterValues } from "./solve";

const TABLE = new Uint8Array(
  readFileSync(
    new URL("../../public/data/english-quadgrams.bin", import.meta.url),
  ),
);

describe("seededRng", () => {
  it("repeats its sequence for the same seed", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seededRng(1)()).not.toBe(seededRng(2)());
  });
});

describe("permutation helpers", () => {
  it("builds permutations and swaps exactly two entries", () => {
    const rng = seededRng(7);
    const order = randomPermutation(10, rng);
    expect([...order].sort((x, y) => x - y)).toEqual([...Array(10).keys()]);
    const swapped = swapTwo(order, rng);
    expect(swapped.filter((v, i) => v !== order[i])).toHaveLength(2);
    expect(order).not.toBe(swapped);
  });
});

describe("quadgramRaw", () => {
  it("agrees with quadgramFitness on letters and skips other symbols", () => {
    const values = toLetterValues("ATTACKATDAWN");
    const raw = quadgramRaw(values, values.length, TABLE);
    expect(averageLog10(raw, values.length - 3)).toBeCloseTo(
      quadgramFitness(values, TABLE),
      10,
    );
    const withGaps = [...values.slice(0, 6), 26, ...values.slice(6)];
    expect(quadgramRaw(withGaps, withGaps.length, TABLE)).toBe(raw);
  });
});

describe("anneal", () => {
  it("sorts a permutation when the score counts ordered neighbours", () => {
    const size = 12;
    const result = anneal(
      {
        random: (rng) => randomPermutation(size, rng),
        neighbour: swapTwo,
        score: (key) => key.reduce((sum, v, i) => sum + (v === i ? 1 : 0), 0),
      },
      { rng: seededRng(3), iterations: 20000, temperature: 2 },
    );
    expect(result.score).toBe(size);
  });

  it("stops early once the target is reached", () => {
    let evaluations = 0;
    anneal(
      {
        random: () => 0,
        neighbour: (key) => key + 1,
        score: (key) => {
          evaluations += 1;
          return key;
        },
      },
      { rng: seededRng(1), iterations: 1000, temperature: 1, target: 5 },
    );
    expect(evaluations).toBeLessThan(10);
  });
});
