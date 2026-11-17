// ABOUTME: Tests for the list of every solver's requirements.
// ABOUTME: Checks the entries are well-formed and that enforced minimums match what the solvers refuse.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { SOLVER_REQUIREMENTS } from "./solver-registry";
import {
  AUTOKEY_MIN_LENGTH,
  CIPHERTEXT_AUTOKEY_REQUIREMENTS,
  breakCiphertextAutokey,
} from "./solve-autokey";
import {
  QUAGMIRE_DICTIONARY_REQUIREMENTS,
  breakQuagmireDictionary,
} from "./solve-quagmire-dictionary";

describe("SOLVER_REQUIREMENTS", () => {
  it("lists every solver once", () => {
    const ids = SOLVER_REQUIREMENTS.map((solver) => solver.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        "caesar",
        "affine",
        "periodic-shift",
        "porta",
        "substitution",
        "polyalphabetic",
        "quagmire-shared-alphabet",
        "quagmire-dictionary",
        "ciphertext-autokey",
        "plaintext-autokey",
        "rail-fence",
        "columnar-transposition",
        "route",
        "double-transposition",
        "fractionation",
      ]),
    );
  });

  it("names the ciphers and key assumptions of every solver", () => {
    for (const solver of SOLVER_REQUIREMENTS) {
      expect(solver.ciphers.length, solver.id).toBeGreaterThan(0);
      expect(solver.assumes.length, solver.id).toBeGreaterThan(0);
    }
  });

  it("states a limit exactly when the basis is not unmeasured", () => {
    for (const solver of SOLVER_REQUIREMENTS) {
      const stated =
        solver.minLetters !== undefined ||
        solver.minLettersPerColumn !== undefined;
      expect(stated, solver.id).toBe(solver.basis !== "unmeasured");
    }
  });
});

describe("enforced minimums", () => {
  const table = new Uint8Array(0);

  it("ciphertext autokey refuses text one letter short of its minimum", () => {
    expect(CIPHERTEXT_AUTOKEY_REQUIREMENTS.minLetters).toBe(AUTOKEY_MIN_LENGTH);
    expect(() =>
      breakCiphertextAutokey("A".repeat(AUTOKEY_MIN_LENGTH - 1), table),
    ).toThrow(/at least/);
  });

  it("the Quagmire dictionary attack refuses text one letter short of its minimum", () => {
    const min = QUAGMIRE_DICTIONARY_REQUIREMENTS.minLetters ?? 0;
    expect(min).toBeGreaterThan(0);
    expect(() =>
      breakQuagmireDictionary("A".repeat(min - 1), ["KEY"], table),
    ).toThrow(/at least/);
  });
});
