// ABOUTME: Detects the key period of a periodic cipher from per-column index of coincidence.
// ABOUTME: The shortest period whose columns look monoalphabetic wins, so the true period beats its multiples.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { toLetterValues } from "./solve";

const ALPHABET_SIZE = 26;

export const MAX_PERIOD = 20;
// English normalized IoC is near 1.73 and random near 1.0; a column at or above
// this looks monoalphabetic.
export const ENGLISH_IOC = 1.3;
// A curve whose peak barely rises above its baseline carries no period signal.
const SIGNAL = 0.1;
// How far above baseline, as a fraction of the peak's rise, a period must score
// to be accepted; the shortest such period wins so multiples lose.
const PEAK_FRACTION = 0.6;

/** Mean per-column normalized index of coincidence when split into `period` columns. */
function columnIoc(values: number[], period: number): number {
  let sum = 0;
  for (let column = 0; column < period; column += 1) {
    const counts = new Array<number>(ALPHABET_SIZE).fill(0);
    let total = 0;
    for (let i = column; i < values.length; i += period) {
      counts[values[i]] += 1;
      total += 1;
    }
    if (total >= 2) {
      let coincidences = 0;
      for (const count of counts) {
        coincidences += count * (count - 1);
      }
      sum += (ALPHABET_SIZE * coincidences) / (total * (total - 1));
    }
  }
  return sum / period;
}

export interface PeriodResult {
  /** Suggested key length; 1 means monoalphabetic. */
  period: number;
  /** Per-column IoC at the suggested period. */
  ioc: number;
  /** Per-column IoC for every candidate period, index 0 being period 1. */
  curve: number[];
}

/** Suggests the key period, returning the scoring curve alongside it. */
export function iocPerPeriod(
  text: string | number[],
  maxPeriod = MAX_PERIOD,
): PeriodResult {
  const values = typeof text === "string" ? toLetterValues(text) : text;
  const longest = Math.max(
    1,
    Math.min(maxPeriod, Math.floor(values.length / 20)),
  );
  const curve = Array.from({ length: longest }, (_, i) =>
    columnIoc(values, i + 1),
  );
  if (curve[0] >= ENGLISH_IOC) {
    return { period: 1, ioc: curve[0], curve };
  }
  const peak = Math.max(...curve);
  const baseline = [...curve].sort((a, b) => a - b)[
    Math.floor(curve.length / 2)
  ];
  const threshold =
    peak - baseline < SIGNAL
      ? peak
      : baseline + PEAK_FRACTION * (peak - baseline);
  const period = curve.findIndex((v) => v >= threshold) + 1;
  return { period, ioc: curve[period - 1], curve };
}
