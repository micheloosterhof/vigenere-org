// ABOUTME: Tests for the incremental quadgram hill climb shared by the substitution solvers.
// ABOUTME: Checks the incremental scorer against a full rescore on random keys and texts.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { QUADGRAM_TABLE_SIZE } from "./data/english-quadgrams-meta";
import { climbMappings, rawScore } from "./quadgram-climb";

const ALPHABET_SIZE = 26;

const TABLE = new Uint8Array(
  readFileSync(
    new URL("../../public/data/english-quadgrams.bin", import.meta.url),
  ),
);

/** Reference: rescores the whole sample from scratch through the mappings. */
function fullScore(
  sample: number[],
  mappings: number[][],
  table: Uint8Array,
): number {
  const period = mappings.length;
  let sum = 0;
  let index = 0;
  for (let i = 0; i < sample.length; i += 1) {
    index =
      (index * ALPHABET_SIZE + mappings[i % period][sample[i]]) %
      QUADGRAM_TABLE_SIZE;
    if (i >= 3) {
      sum += table[index];
    }
  }
  return sum;
}

/** Reference steepest ascent: applies the best full-rescored swap until none improves. */
function referenceClimb(
  sample: number[],
  mappings: number[][],
  table: Uint8Array,
): number {
  let best = fullScore(sample, mappings, table);
  let improved = true;
  while (improved) {
    improved = false;
    let bestColumn = -1;
    let bestFirst = -1;
    let bestSecond = -1;
    let bestScore = best;
    for (let column = 0; column < mappings.length; column += 1) {
      const mapping = mappings[column];
      for (let first = 0; first < ALPHABET_SIZE - 1; first += 1) {
        for (let second = first + 1; second < ALPHABET_SIZE; second += 1) {
          [mapping[first], mapping[second]] = [mapping[second], mapping[first]];
          const score = fullScore(sample, mappings, table);
          [mapping[first], mapping[second]] = [mapping[second], mapping[first]];
          if (score > bestScore) {
            bestScore = score;
            bestColumn = column;
            bestFirst = first;
            bestSecond = second;
          }
        }
      }
    }
    if (bestColumn >= 0) {
      const mapping = mappings[bestColumn];
      [mapping[bestFirst], mapping[bestSecond]] = [
        mapping[bestSecond],
        mapping[bestFirst],
      ];
      best = bestScore;
      improved = true;
    }
  }
  return best;
}

const letter = fc.integer({ min: 0, max: ALPHABET_SIZE - 1 });
const sample = fc.array(letter, { minLength: 4, maxLength: 60 });
const permutation = fc
  .shuffledSubarray(
    Array.from({ length: ALPHABET_SIZE }, (_, i) => i),
    { minLength: ALPHABET_SIZE, maxLength: ALPHABET_SIZE },
  )
  .map((p) => [...p]);
const mappings = fc.array(permutation, { minLength: 1, maxLength: 3 });

describe("rawScore", () => {
  it("matches a full rescore for any sample and mappings", () => {
    fc.assert(
      fc.property(sample, mappings, (s, m) => {
        expect(rawScore(s, m, TABLE)).toBe(fullScore(s, m, TABLE));
      }),
    );
  });

  it("scores a sample shorter than one quadgram as zero", () => {
    expect(rawScore([1, 2, 3], [[...Array(26).keys()]], TABLE)).toBe(0);
  });
});

describe("climbMappings", () => {
  // The climb must make exactly the choices a full rescore would make: same
  // final mappings, same score. Ties are broken by iteration order in both.
  it("reaches the same mappings and score as a full-rescore steepest ascent", () => {
    fc.assert(
      fc.property(sample, mappings, (s, m) => {
        const expected = m.map((mapping) => [...mapping]);
        const expectedScore = referenceClimb(s, expected, TABLE);
        const actual = m.map((mapping) => [...mapping]);
        const actualScore = climbMappings(s, actual, TABLE);
        expect(actualScore).toBe(expectedScore);
        expect(actual).toEqual(expected);
      }),
      { numRuns: 40 },
    );
  });

  it("returns a score equal to rescoring the climbed mappings", () => {
    fc.assert(
      fc.property(sample, mappings, (s, m) => {
        const score = climbMappings(s, m, TABLE);
        expect(score).toBe(fullScore(s, m, TABLE));
      }),
      { numRuns: 40 },
    );
  });
});
