// ABOUTME: Breaks Quagmire III by solving it as a general polyalphabetic cipher, then fitting one shared alphabet.
// ABOUTME: The shared-alphabet fit both confirms it is Quagmire III and cleans up the general solver's stray errors.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import {
  meetsRequirements,
  type SolverRequirements,
} from "./solver-requirements";
import { substituteLetters } from "./cipher";
import { toLetterValues } from "./solve";
import {
  POLYALPHABETIC_REQUIREMENTS,
  breakPolyalphabetic,
  type PolyalphabeticProgress,
  type PolyalphabeticSolver,
} from "./solve-polyalphabetic";
import { reconcileSharedAlphabet } from "./reconcile-quagmire";
import {
  normalizeQuagmireSolution,
  recoverQuagmireKey,
} from "./keyword-alphabet";

const CODE_A = 65;

export interface QuagmireSolveResult {
  period: number;
  /** True when one shared mixed alphabet explains every column: the mark of Quagmire III. */
  isQuagmire: boolean;
  /** The shared mixed alphabet when it is Quagmire III, rotated into keyword form; otherwise empty. */
  alphabet: string;
  /** Per-column shift on top of the shared alphabet, when Quagmire III. */
  offsets: number[];
  /** The period key as letters, read off with the best-scoring indicator; empty when not Quagmire III. */
  key: string;
  /** Indicator letter whose key reads most like English; empty when not Quagmire III. */
  indicator: string;
  plaintext: string;
  /** Average quadgram log10 probability of the decryption; higher is more English-like. */
  fitness: number;
}

interface Options {
  period?: number;
  rng?: () => number;
  onProgress?: (progress: PolyalphabeticProgress) => void;
  /** Runs the general solve; defaults to the sequential solver on this thread. */
  solvePolyalphabetic?: PolyalphabeticSolver;
}

/**
 * Breaks a periodic cipher and reports whether it is Quagmire III. The general
 * polyalphabetic solver recovers each column, then a shared-alphabet fit checks
 * whether all columns are one mixed alphabet plus per-column shifts; when they
 * are, its cleaned-up decryption is used. The table is the quantized quadgram
 * data served at QUADGRAM_TABLE_URL. Needs enough text for the general solver
 * (roughly two hundred letters per column).
 */
export async function breakQuagmire(
  text: string,
  table: Uint8Array,
  options: Options = {},
): Promise<QuagmireSolveResult> {
  const solve: PolyalphabeticSolver =
    options.solvePolyalphabetic ??
    (async (t, tb, o) =>
      breakPolyalphabetic(t, tb, { ...o, rng: options.rng }));
  const general = await solve(text, table, {
    period: options.period,
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
      key: "",
      indicator: "",
      plaintext: general.plaintext,
      fitness: general.fitness,
    };
  }

  // The fit only pins the alphabet up to an affine reindexing (decimations and
  // rotations decrypt identically), so rewrite it into the author's keyword
  // form and read the offsets back as key letters.
  const { alphabet, offsets } = normalizeQuagmireSolution(
    fit.alphabet,
    fit.offsets,
  );
  const recovered = recoverQuagmireKey(alphabet, offsets);

  // Re-decrypt through the shared alphabet, which repairs the general solver's
  // stray per-column errors, preserving case and punctuation.
  const indexOf = new Array<number>(26);
  [...alphabet].forEach((letter, position) => {
    indexOf[letter.charCodeAt(0) - CODE_A] = position;
  });
  const plaintext = substituteLetters(
    text,
    offsets,
    (letter, offset) =>
      alphabet.charCodeAt((((indexOf[letter] - offset) % 26) + 26) % 26) -
      CODE_A,
  );
  return {
    period: general.period,
    isQuagmire: true,
    alphabet,
    offsets,
    key: recovered.key,
    indicator: recovered.indicator,
    plaintext,
    fitness: general.fitness,
  };
}

/**
 * Whether a result of `letters` letters can be believed: one shared alphabet
 * explains it, or the general decryption reads as English on enough letters
 * per column for that to mean something.
 */
export function canBeBelieved(
  result: QuagmireSolveResult,
  letters: number,
): boolean {
  // Without a stated bar the fitness alone would never be believed.
  return (
    result.isQuagmire ||
    (meetsRequirements(POLYALPHABETIC_REQUIREMENTS, {
      letters,
      period: result.period,
    }) &&
      result.fitness >= (POLYALPHABETIC_REQUIREMENTS.readableQuadgram ?? 0))
  );
}

/**
 * What the shared-alphabet Quagmire III attack needs. It starts from the
 * general polyalphabetic solution, so that solver's floor applies. In
 * bench/results/quagmire-shared-alphabet.tsv, with the period given, it
 * recovers 37 of 40 texts at 200 letters per column, 16 of 40 at 150 and
 * none at 100, whether the shared alphabet comes from a keyword or is a
 * random arrangement. The shared-alphabet fit is never claimed on a wrong
 * decryption, nor on any of 100 texts with an unrelated alphabet per column.
 * Given the true plaintext, the fit alone is claimed on none of 8,800 texts
 * of 16 to 3,600 letters with an unrelated alphabet per column
 * (bench/results/shared-alphabet-fit.tsv).
 * It is missed on 6 of the 93 right decryptions, which are then reported as
 * a general polyalphabetic cipher: 4 whose shifts are all even, which splits
 * the alphabet into two halves that no pair of letters connects, and 2 with
 * too many wrong letters.
 */
export const QUAGMIRE_REQUIREMENTS: SolverRequirements = {
  id: "quagmire-shared-alphabet",
  ciphers: ["Quagmire III"],
  assumes: ["periodic", "shared-alphabet"],
  minLettersPerColumn: POLYALPHABETIC_REQUIREMENTS.minLettersPerColumn,
  reliableLettersPerColumn: 200,
  maxPeriod: POLYALPHABETIC_REQUIREMENTS.maxPeriod,
  basis: "measured",
};
