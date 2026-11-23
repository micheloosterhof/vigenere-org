// ABOUTME: Benchmark of the shared-alphabet fit alone, given the true plaintext: how often it finds the alphabet of a Quagmire III and how often it claims one that is not there.
// ABOUTME: Covers shifts that are all even, which split the alphabet into two halves that no pair of letters connects, and one unrelated alphabet per column.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { randomPermutation, seededRng } from "../src/lib/anneal";
import { quagmire } from "../src/lib/quagmire";
import { reconcileSharedAlphabet } from "../src/lib/reconcile-quagmire";
import { toLetterValues } from "../src/lib/solve";
import { ownTrials, plaintextSlice, record } from "./trials";

// "shared": one random alphabet for every column, each column shifted a
// random number of places. "even": the same with every shift even.
// "independent": an unrelated random alphabet per column, where a fit is a
// false claim.
const KINDS = ["shared", "even", "independent"] as const;
type Kind = (typeof KINDS)[number];

const TEXTS: Record<Kind, number> = { shared: 25, even: 25, independent: 100 };

interface Trial {
  kind: Kind;
  period: number;
  perColumn: number;
  repeat: number;
}

const trials: Trial[] = [];
for (const kind of KINDS) {
  for (const period of [2, 3, 4, 5, 6, 8, 10, 12]) {
    for (const perColumn of [8, 12, 16, 24, 32, 50, 75, 100, 150, 200, 300]) {
      for (let repeat = 0; repeat < TEXTS[kind]; repeat += 1) {
        trials.push({ kind, period, perColumn, repeat });
      }
    }
  }
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

it("shared-alphabet fit on known plaintext", () => {
  for (const { kind, period, perColumn, repeat } of ownTrials(trials)) {
    const rng = seededRng(
      (((14 * 10 + KINDS.indexOf(kind)) * 100 + period) * 1000 + perColumn) *
        100 +
        repeat,
    );
    const letters = period * perColumn;
    const plain = plaintextSlice(letters, rng);
    let ciphertext: string;
    // The largest number that divides 26 and every shift: 2 when the shifts
    // are all even, 1 when the letters all connect.
    let common = 0;
    if (kind === "independent") {
      const alphabets = Array.from({ length: period }, () =>
        randomPermutation(26, rng),
      );
      ciphertext = [...plain]
        .map((letter, i) =>
          String.fromCharCode(
            65 + alphabets[i % period][letter.charCodeAt(0) - 65],
          ),
        )
        .join("");
    } else {
      // A keyword of all 26 letters is the alphabet itself.
      const alphabet = randomPermutation(26, rng)
        .map((value) => String.fromCharCode(65 + value))
        .join("");
      const shifts = Array.from({ length: period }, () =>
        kind === "even" ? 2 * Math.floor(rng() * 13) : Math.floor(rng() * 26),
      );
      common = shifts.reduce(gcd, 26);
      // A key letter stands its column's shift after the indicator.
      const indicator = alphabet.indexOf("A");
      const key = shifts
        .map((shift) => alphabet[(indicator + shift) % 26])
        .join("");
      ciphertext = quagmire(
        plain,
        { variant: 3, keyword: alphabet, key, indicator: "A" },
        "encrypt",
      );
    }
    const cipher = toLetterValues(ciphertext);
    const plainValues = toLetterValues(plain);
    // What the solver claims, with its bar on how many pairs a fit must
    // explain.
    const start = performance.now();
    const claimed = reconcileSharedAlphabet(cipher, plainValues, period);
    const milliseconds = performance.now() - start;
    // The fit with that bar off, to show what the bar keeps out.
    const fit = reconcileSharedAlphabet(cipher, plainValues, period, {
      pairsBeyondFree: -Infinity,
    });
    // A pair is a plaintext letter with its ciphertext letter in one column.
    const pairs = new Set<number>();
    const pairsExplained = new Set<number>();
    const explained = fit === null ? [] : fit.decrypt(cipher);
    for (let i = 0; i < letters; i += 1) {
      const pair = ((i % period) * 26 + plainValues[i]) * 26 + cipher[i];
      pairs.add(pair);
      if (explained[i] === plainValues[i]) {
        pairsExplained.add(pair);
      }
    }
    const same =
      claimed === null
        ? 0
        : claimed.decrypt(cipher).filter((value, i) => value === plainValues[i])
            .length;
    record("shared-alphabet-fit", {
      kind,
      period,
      perColumn,
      letters,
      repeat,
      common: kind === "independent" ? "" : common,
      pairs: pairs.size,
      fit: fit === null ? 0 : 1,
      fitCommon: fit === null ? "" : fit.offsets.reduce(gcd, 26),
      residual: fit === null ? "" : fit.residual.toFixed(3),
      pairsExplained: fit === null ? "" : pairsExplained.size,
      claimed: claimed === null ? 0 : 1,
      accuracy: claimed === null ? "" : (same / letters).toFixed(2),
      milliseconds: milliseconds.toFixed(1),
    });
  }
});
