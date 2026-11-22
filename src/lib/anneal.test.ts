// ABOUTME: Unit tests for the simulated annealing core and its helpers.
// ABOUTME: Uses a toy problem with a known optimum, so the search itself is tested without cipher code.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  anneal,
  averageLog10,
  climbBySwaps,
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

  it("cools to the end temperature when one is given, not to zero", () => {
    // Every neighbour scores one worse; a worse key is taken when the random
    // number, here always 0.5, is below exp(-1 / temperature): down to a
    // temperature of 1.45.
    const accepted = (endTemperature?: number): number => {
      let reached = 0;
      anneal(
        {
          random: () => 0,
          neighbour: (key) => {
            reached = Math.max(reached, key);
            return key + 1;
          },
          score: (key) => -key,
        },
        { rng: () => 0.5, iterations: 20, temperature: 10, endTemperature },
      );
      return reached;
    };
    // Falling from 10 to zero in twenty steps, the last two steps are too
    // cold, so the key stops at 18; ending at 5, every step is taken.
    expect(accepted()).toBe(18);
    expect(accepted(5)).toBe(19);
  });
});

describe("climbBySwaps", () => {
  // The score counts the entries that hold their own index.
  const inPlace = (key: number[]): number =>
    key.filter((value, index) => value === index).length;

  it("exchanges entries until no exchange scores higher", () => {
    const climbed = climbBySwaps(inPlace, [2, 0, 1, 4, 3]);
    expect(climbed.key).toEqual([0, 1, 2, 3, 4]);
    expect(climbed.score).toBe(5);
  });

  it("leaves the key it starts from as it was", () => {
    const start = [1, 0, 2];
    climbBySwaps(inPlace, start);
    expect(start).toEqual([1, 0, 2]);
  });
});
