// ABOUTME: Steepest-ascent hill climb over per-column letter mappings under quadgram scoring.
// ABOUTME: Scores each candidate swap from only the quadgram windows it changes, not the whole text.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { QUADGRAM_TABLE_SIZE } from "./data/english-quadgrams-meta";

const ALPHABET_SIZE = 26;
// A quadgram window ending at position `end` covers end-3..end.
const WINDOW_REACH = 3;

/**
 * Sum of quantized quadgram scores for the sample decrypted through the
 * mappings, one mapping per key position (a single mapping for a
 * monoalphabetic cipher).
 */
export function rawScore(
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
    if (i >= WINDOW_REACH) {
      sum += table[index];
    }
  }
  return sum;
}

/**
 * Keeps the decrypted sample and the score of every quadgram window in it,
 * so a letter swap in one column is scored from the windows that contain
 * an occurrence of either letter in that column.
 */
class SwapScorer {
  private readonly period: number;
  private readonly plain: Uint8Array;
  private readonly windowScore: Uint8Array;
  /** Sample positions grouped by (column, cipher letter), each group ascending. */
  private readonly positions: Int32Array;
  private readonly groupStart: Int32Array;
  /** Marks window ends already counted in the current evaluation. */
  private readonly seen: Int32Array;
  private tick = 0;
  total = 0;

  constructor(
    private readonly sample: number[],
    private readonly mappings: number[][],
    private readonly table: Uint8Array,
  ) {
    const n = sample.length;
    this.period = mappings.length;
    this.plain = new Uint8Array(n);
    this.windowScore = new Uint8Array(n);
    this.seen = new Int32Array(n);

    const groups = this.period * ALPHABET_SIZE;
    this.groupStart = new Int32Array(groups + 1);
    for (let i = 0; i < n; i += 1) {
      this.groupStart[this.group(i % this.period, sample[i]) + 1] += 1;
    }
    for (let g = 0; g < groups; g += 1) {
      this.groupStart[g + 1] += this.groupStart[g];
    }
    const fill = this.groupStart.slice(0, groups);
    this.positions = new Int32Array(n);
    for (let i = 0; i < n; i += 1) {
      const g = this.group(i % this.period, sample[i]);
      this.positions[fill[g]] = i;
      fill[g] += 1;
    }

    for (let i = 0; i < n; i += 1) {
      this.plain[i] = mappings[i % this.period][sample[i]];
    }
    for (let end = WINDOW_REACH; end < n; end += 1) {
      this.windowScore[end] = this.windowAt(end);
      this.total += this.windowScore[end];
    }
  }

  /** Score change if `first` and `second` were swapped in the column's mapping; leaves the state unchanged. */
  delta(column: number, first: number, second: number): number {
    const mapping = this.mappings[column];
    const firstPlain = mapping[first];
    const secondPlain = mapping[second];
    this.setPlain(column, first, secondPlain);
    this.setPlain(column, second, firstPlain);
    this.tick += 1;
    const delta =
      this.windowDelta(column, first) + this.windowDelta(column, second);
    this.setPlain(column, first, firstPlain);
    this.setPlain(column, second, secondPlain);
    return delta;
  }

  /** Swaps `first` and `second` in the column's mapping and brings the scores up to date. */
  apply(column: number, first: number, second: number): void {
    const mapping = this.mappings[column];
    [mapping[first], mapping[second]] = [mapping[second], mapping[first]];
    this.setPlain(column, first, mapping[first]);
    this.setPlain(column, second, mapping[second]);
    this.tick += 1;
    this.total += this.storeWindows(column, first);
    this.total += this.storeWindows(column, second);
  }

  private group(column: number, letter: number): number {
    return column * ALPHABET_SIZE + letter;
  }

  private windowAt(end: number): number {
    const p = this.plain;
    return this.table[
      ((p[end - 3] * ALPHABET_SIZE + p[end - 2]) * ALPHABET_SIZE + p[end - 1]) *
        ALPHABET_SIZE +
        p[end]
    ];
  }

  /** Writes the plaintext letter at every position of a cipher letter in a column. */
  private setPlain(column: number, letter: number, plain: number): void {
    const g = this.group(column, letter);
    for (let k = this.groupStart[g]; k < this.groupStart[g + 1]; k += 1) {
      this.plain[this.positions[k]] = plain;
    }
  }

  /** Sum of score changes over the windows containing a cipher letter in a column, each counted once per tick. */
  private windowDelta(column: number, letter: number): number {
    const g = this.group(column, letter);
    const n = this.sample.length;
    let delta = 0;
    for (let k = this.groupStart[g]; k < this.groupStart[g + 1]; k += 1) {
      const position = this.positions[k];
      const last = Math.min(position + WINDOW_REACH, n - 1);
      for (let end = Math.max(position, WINDOW_REACH); end <= last; end += 1) {
        if (this.seen[end] !== this.tick) {
          this.seen[end] = this.tick;
          delta += this.windowAt(end) - this.windowScore[end];
        }
      }
    }
    return delta;
  }

  /** Like windowDelta, but also records the new window scores. */
  private storeWindows(column: number, letter: number): number {
    const g = this.group(column, letter);
    const n = this.sample.length;
    let delta = 0;
    for (let k = this.groupStart[g]; k < this.groupStart[g + 1]; k += 1) {
      const position = this.positions[k];
      const last = Math.min(position + WINDOW_REACH, n - 1);
      for (let end = Math.max(position, WINDOW_REACH); end <= last; end += 1) {
        if (this.seen[end] !== this.tick) {
          this.seen[end] = this.tick;
          const score = this.windowAt(end);
          delta += score - this.windowScore[end];
          this.windowScore[end] = score;
        }
      }
    }
    return delta;
  }
}

/**
 * Steepest-ascent hill climb over the whole key: each step evaluates every
 * letter-pair swap in every column and applies the single best, so no column
 * converges against the others prematurely. Mutates the mappings in place and
 * returns the raw score they reach.
 */
export function climbMappings(
  sample: number[],
  mappings: number[][],
  table: Uint8Array,
): number {
  const scorer = new SwapScorer(sample, mappings, table);
  let improved = true;
  while (improved) {
    improved = false;
    let bestColumn = -1;
    let bestFirst = -1;
    let bestSecond = -1;
    let bestDelta = 0;
    for (let column = 0; column < mappings.length; column += 1) {
      for (let first = 0; first < ALPHABET_SIZE - 1; first += 1) {
        for (let second = first + 1; second < ALPHABET_SIZE; second += 1) {
          const delta = scorer.delta(column, first, second);
          if (delta > bestDelta) {
            bestDelta = delta;
            bestColumn = column;
            bestFirst = first;
            bestSecond = second;
          }
        }
      }
    }
    if (bestColumn >= 0) {
      scorer.apply(bestColumn, bestFirst, bestSecond);
      improved = true;
    }
  }
  return scorer.total;
}
