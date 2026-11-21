// ABOUTME: Tests for checking a ciphertext's length and period against a solver's stated requirements.
// ABOUTME: Covers total length, letters per column, the period ceiling, and limits left unstated.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import {
  meetsRequirements,
  type SolverRequirements,
} from "./solver-requirements";

const BASE: SolverRequirements = {
  id: "example",
  ciphers: ["Example"],
  assumes: ["periodic"],
  basis: "unmeasured",
};

describe("meetsRequirements", () => {
  it("accepts any text when no limits are stated", () => {
    expect(meetsRequirements(BASE, { letters: 1 })).toBe(true);
  });

  it("refuses text shorter than the minimum total length", () => {
    const solver = { ...BASE, minLetters: 26 };
    expect(meetsRequirements(solver, { letters: 25 })).toBe(false);
    expect(meetsRequirements(solver, { letters: 26 })).toBe(true);
  });

  it("refuses text with too few letters per column at the given period", () => {
    const solver = { ...BASE, minLettersPerColumn: 16 };
    expect(meetsRequirements(solver, { letters: 95, period: 6 })).toBe(false);
    expect(meetsRequirements(solver, { letters: 96, period: 6 })).toBe(true);
  });

  it("does not apply the per-column minimum when the period is unknown", () => {
    const solver = { ...BASE, minLettersPerColumn: 16 };
    expect(meetsRequirements(solver, { letters: 20 })).toBe(true);
  });

  it("refuses text longer than the solver is meant for", () => {
    const solver = { ...BASE, maxLetters: 384 };
    expect(meetsRequirements(solver, { letters: 385 })).toBe(false);
    expect(meetsRequirements(solver, { letters: 384 })).toBe(true);
  });

  it("refuses a period above the solver's ceiling", () => {
    const solver = { ...BASE, maxPeriod: 12 };
    expect(meetsRequirements(solver, { letters: 500, period: 13 })).toBe(false);
    expect(meetsRequirements(solver, { letters: 500, period: 12 })).toBe(true);
  });
});
