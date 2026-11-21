// ABOUTME: States what a solver needs from a ciphertext: the key structure it assumes and the least text it can work with.
// ABOUTME: Plain data, so a router or a trained classifier can match a ciphertext's statistics to a solver.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause

/** A property of the key or cipher that a solver relies on. */
export type KeyAssumption =
  /** Every cipher alphabet is the unmixed A-Z, shifted or paired in a fixed way. */
  | "standard-alphabet"
  /** One substitution alphabet enciphers the whole text. */
  | "single-alphabet"
  /** The key repeats with a fixed period. */
  | "periodic"
  /** All columns use one mixed alphabet, each at its own shift. */
  | "shared-alphabet"
  /** A mixed alphabet is a keyword followed by the remaining letters in A-Z order. */
  | "keyword-alphabet"
  /** The alphabet keyword is a word in the site's word list. */
  | "keyword-in-word-list"
  /** Letters are moved, not substituted. */
  | "transposition"
  /** The key stream continues with the text itself. */
  | "autokey"
  /** Letters are split into coordinates that are regrouped. */
  | "fractionation";

/**
 * Where a solver's length limits come from: `enforced` limits are refused by
 * the code, `measured` ones are the smallest size at which a benchmark under
 * bench/ solved at least nine trials in ten, `estimate` ones are a documented
 * rule of thumb, and `unmeasured` means no limit is stated.
 */
export type RequirementBasis =
  "enforced" | "measured" | "estimate" | "unmeasured";

export interface SolverRequirements {
  /** Stable identifier of the solver; the label a solver-choosing classifier predicts. */
  id: string;
  /** Display names of the ciphers the solver breaks. */
  ciphers: string[];
  assumes: KeyAssumption[];
  /** Least number of letters in the whole ciphertext. */
  minLetters?: number;
  /** Least number of letters per key position, for periodic ciphers. */
  minLettersPerColumn?: number;
  /** Longest key period the solver tries. */
  maxPeriod?: number;
  basis: RequirementBasis;
}

/** The measurable shape of a ciphertext that requirements are checked against. */
export interface TextShape {
  letters: number;
  /** Key period, when one is known or estimated. */
  period?: number;
}

/** True when the ciphertext is long enough, and its period short enough, for the solver. */
export function meetsRequirements(
  solver: SolverRequirements,
  shape: TextShape,
): boolean {
  if (solver.minLetters !== undefined && shape.letters < solver.minLetters) {
    return false;
  }
  if (shape.period === undefined) {
    return true;
  }
  if (solver.maxPeriod !== undefined && shape.period > solver.maxPeriod) {
    return false;
  }
  return (
    solver.minLettersPerColumn === undefined ||
    shape.letters / shape.period >= solver.minLettersPerColumn
  );
}
