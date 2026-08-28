// ABOUTME: Breaks Quagmire III by solving it as a general polyalphabetic cipher, then fitting one shared alphabet.
// ABOUTME: The shared-alphabet fit both confirms it is Quagmire III and cleans up the general solver's stray errors.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { substituteLetters } from "./cipher";
import { toLetterValues } from "./solve";
import {
  breakPolyalphabetic,
  type PolyalphabeticProgress,
} from "./solve-polyalphabetic";
import { reconcileSharedAlphabet } from "./reconcile-quagmire";

const CODE_A = 65;

export interface QuagmireSolveResult {
  period: number;
  /** True when one shared mixed alphabet explains every column: the mark of Quagmire III. */
  isQuagmire: boolean;
  /** The shared mixed alphabet when it is Quagmire III, otherwise the empty string. */
  alphabet: string;
  /** Per-column shift on top of the shared alphabet, when Quagmire III. */
  offsets: number[];
  plaintext: string;
  /** Average quadgram log10 probability of the decryption; higher is more English-like. */
  fitness: number;
}

interface Options {
  period?: number;
  rng?: () => number;
  onProgress?: (progress: PolyalphabeticProgress) => void;
}

/**
 * Breaks a periodic cipher and reports whether it is Quagmire III. The general
 * polyalphabetic solver recovers each column, then a shared-alphabet fit checks
 * whether all columns are one mixed alphabet plus per-column shifts; when they
 * are, its cleaned-up decryption is used. The table is the quantized quadgram
 * data served at QUADGRAM_TABLE_URL. Needs enough text for the general solver
 * (roughly two hundred letters per column).
 */
export function breakQuagmire(
  text: string,
  table: Uint8Array,
  options: Options = {},
): QuagmireSolveResult {
  const general = breakPolyalphabetic(text, table, {
    period: options.period,
    rng: options.rng,
    onProgress: options.onProgress,
  });
  const cipherValues = toLetterValues(text);
  const plainValues = toLetterValues(general.plaintext);
  const fit = reconcileSharedAlphabet(
    cipherValues,
    plainValues,
    general.period,
  );

  if (fit === null) {
    return {
      period: general.period,
      isQuagmire: false,
      alphabet: "",
      offsets: [],
      plaintext: general.plaintext,
      fitness: general.fitness,
    };
  }

  // Re-decrypt through the shared alphabet, which repairs the general solver's
  // stray per-column errors, preserving case and punctuation.
  const indexOf = new Array<number>(26);
  [...fit.alphabet].forEach((letter, position) => {
    indexOf[letter.charCodeAt(0) - CODE_A] = position;
  });
  const plaintext = substituteLetters(
    text,
    fit.offsets,
    (letter, offset) =>
      fit.alphabet.charCodeAt((((indexOf[letter] - offset) % 26) + 26) % 26) -
      CODE_A,
  );
  return {
    period: general.period,
    isQuagmire: true,
    alphabet: fit.alphabet,
    offsets: fit.offsets,
    plaintext,
    fitness: general.fitness,
  };
}
