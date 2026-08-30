// ABOUTME: Tests for keyword-mixed alphabet normalization and Quagmire key recovery.
// ABOUTME: Uses the Kryptos KRYPTOS/PALIMPSEST alphabet as the reference vector.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import {
  normalizeMixedAlphabet,
  normalizeQuagmireSolution,
  recoverQuagmireKey,
} from "./keyword-alphabet";

const KRYPTOS = "KRYPTOSABCDEFGHIJLMNQUVWXZ";

function rotate(alphabet: string, by: number): string {
  return alphabet.slice(by) + alphabet.slice(0, by);
}

describe("normalizeMixedAlphabet", () => {
  it("restores the keyword form from any rotation", () => {
    for (const by of [0, 1, 7, 13, 25]) {
      expect(normalizeMixedAlphabet(rotate(KRYPTOS, by))).toBe(KRYPTOS);
    }
  });

  it("leaves the straight alphabet unchanged", () => {
    const straight = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    expect(normalizeMixedAlphabet(rotate(straight, 9))).toBe(straight);
  });
});

describe("normalizeQuagmireSolution", () => {
  it("undoes a decimated, rotated equivalent of the true solution", () => {
    // A solver can return any affine reindexing of the alphabet: decimating by
    // a unit m and dividing the offsets by m leaves the decryption unchanged.
    const indicatorIndex = KRYPTOS.indexOf("K");
    const offsets = [..."PALIMPSEST"].map(
      (letter) => (KRYPTOS.indexOf(letter) - indicatorIndex + 26) % 26,
    );
    const m = 3;
    const mInverse = 9; // 3 * 9 = 27 = 1 (mod 26)
    const decimated = Array.from(
      { length: 26 },
      (_, i) => KRYPTOS[(m * i + 5) % 26],
    ).join("");
    const equivalentOffsets = offsets.map((o) => (mInverse * o) % 26);

    const solution = normalizeQuagmireSolution(decimated, equivalentOffsets);
    expect(solution.alphabet).toBe(KRYPTOS);
    expect(solution.offsets).toEqual(offsets);
    expect(recoverQuagmireKey(solution.alphabet, solution.offsets).key).toBe(
      "PALIMPSEST",
    );
  });
});

describe("recoverQuagmireKey", () => {
  it("turns the K1 offsets back into PALIMPSEST", () => {
    // offset[col] = index(keyLetter) - index(indicator) in the mixed alphabet,
    // as produced by the shared-alphabet fit for Kryptos K1.
    const indicatorIndex = KRYPTOS.indexOf("K");
    const offsets = [..."PALIMPSEST"].map(
      (letter) => (KRYPTOS.indexOf(letter) - indicatorIndex + 26) % 26,
    );
    const recovered = recoverQuagmireKey(KRYPTOS, offsets);
    expect(recovered.key).toBe("PALIMPSEST");
    expect(recovered.indicator).toBe("K");
  });

  it("recovers the key from a rotated alphabet too", () => {
    const rotated = rotate(KRYPTOS, 11);
    const indicatorIndex = rotated.indexOf("K");
    const offsets = [..."PALIMPSEST"].map(
      (letter) => (rotated.indexOf(letter) - indicatorIndex + 26) % 26,
    );
    expect(recoverQuagmireKey(rotated, offsets).key).toBe("PALIMPSEST");
  });

  it("falls back to indicator A for a one-letter key", () => {
    const recovered = recoverQuagmireKey(KRYPTOS, [3]);
    expect(recovered.indicator).toBe("A");
    expect(recovered.key).toHaveLength(1);
  });
});
