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
 * the code, `measured` ones come from a benchmark under bench/, `estimate`
 * ones are a documented rule of thumb, and `unmeasured` means no limit is
 * stated.
 */
export type RequirementBasis =
  "enforced" | "measured" | "estimate" | "unmeasured";

export interface SolverRequirements {
  /** Stable identifier of the solver; the label a solver-choosing classifier predicts. */
  id: string;
  /** Display names of the ciphers the solver breaks. */
  ciphers: string[];
  assumes: KeyAssumption[];
  /**
   * Fewest letters at which an answer means anything. With less text a wrong
   * key decrypts to something that reads as well as the right one, so no
   * result can be believed.
   */
  minLetters?: number;
  /** The same floor counted per key position, for periodic ciphers. */
  minLettersPerColumn?: number;
  /** Fewest letters at which the solver recovers at least nine texts in ten. */
  reliableLetters?: number;
  /** The same reliable size counted per key position (per primer letter for autokey). */
  reliableLettersPerColumn?: number;
  /**
   * Average quadgram log10 probability an answer must reach to be believed,
   * where the usual level is not enough: a solver that searches a large key
   * space fits text with nothing to find closer to English than one that tries
   * a handful of keys.
   */
  readableQuadgram?: number;
  /** Most letters the solver is meant for: beyond this it only costs time, because a cheaper solver covers the text. */
  maxLetters?: number;
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

/**
 * True when the solver is meant for a ciphertext of this size and an answer
 * from it could be believed. It says nothing about how likely the solver is to
 * succeed: compare `reliableLettersPerColumn` for that.
 */
export function meetsRequirements(
  solver: SolverRequirements,
  shape: TextShape,
): boolean {
  if (solver.minLetters !== undefined && shape.letters < solver.minLetters) {
    return false;
  }
  if (solver.maxLetters !== undefined && shape.letters > solver.maxLetters) {
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
