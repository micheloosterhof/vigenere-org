// ABOUTME: Identifies and breaks pasted ciphertext automatically for the homepage.
// ABOUTME: Routes by index of coincidence, escalating from Caesar to the general polyalphabetic attack.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { beaufort, caesar, substitution, vigenere } from "./cipher";
import {
  beaufortDecrypt,
  breakPeriodic,
  caesarCandidates,
  scoreText,
  vigenereDecrypt,
} from "./solve";
import { breakSubstitution } from "./solve-substitution";
import {
  breakPolyalphabetic,
  type PolyalphabeticProgress,
} from "./solve-polyalphabetic";
import {
  AUTOKEY_MIN_LENGTH,
  breakCiphertextAutokey,
  breakPlaintextAutokey,
} from "./solve-autokey";
import { analyze, type Diagnostics } from "./diagnostics";

// A decryption whose average bigram log10 probability reaches this reads as
// English; correct decryptions land near -2.4, wrong ones below -2.6.
const READABLE = -2.55;

// Attempts within this fitness of each other are ranked by cipher simplicity.
const SIMPLER_EPSILON = 0.05;

const COMPLEXITY: Record<string, number> = {
  Caesar: 0,
  Vigenère: 1,
  Beaufort: 1,
  Substitution: 2,
  "Ciphertext autokey": 2,
  "Plaintext autokey": 3,
  Polyalphabetic: 3,
};

export interface Attempt {
  cipher: string;
  keyLabel: string;
  /** Average bigram log10 probability of the decryption, comparable across all attempts. */
  fitness: number;
  plaintext: string;
  href: string;
}

export interface AutosolveResult {
  /** Key period suggested by the index of coincidence; 1 means monoalphabetic. */
  period: number;
  /** The statistical diagnostics that chose the route. */
  diagnostics: Diagnostics;
  best: Attempt;
  attempts: Attempt[];
  alreadyEnglish: boolean;
}

interface Options {
  rng?: () => number;
  /** Restart count for the polyalphabetic fallback. */
  restarts?: number;
  onProgress?: (progress: PolyalphabeticProgress) => void;
}

/**
 * Breaks ciphertext without being told the cipher. The index of coincidence
 * chooses between the monoalphabetic route (Caesar, then substitution) and
 * the periodic route (Vigenère and Beaufort, then the general polyalphabetic
 * attack when neither reads as English).
 */
export function autosolve(
  text: string,
  table: Uint8Array,
  options: Options = {},
): AutosolveResult {
  const diagnostics = analyze(text);
  const period = diagnostics.period;
  const attempts: Attempt[] = [];
  const readable = (): boolean => attempts.some((a) => a.fitness >= READABLE);
  // Both autokey attacks need more text than the others; short text gets the
  // attacks it can support rather than an error.
  const longEnoughForAutokey = diagnostics.length >= AUTOKEY_MIN_LENGTH;

  // Ciphertext autokey has no period, so the statistics flag it directly.
  if (
    longEnoughForAutokey &&
    diagnostics.likelyFamily === "ciphertext-autokey"
  ) {
    const recovered = breakCiphertextAutokey(text, table);
    attempts.push({
      cipher: "Ciphertext autokey",
      keyLabel: `primer length ${recovered.primerLength}, opening ~${recovered.primerLength} letters approximate`,
      fitness: scoreText(recovered.plaintext),
      plaintext: recovered.plaintext,
      href: "/autokey",
    });
  }

  if (period === 1) {
    const [shift] = caesarCandidates(text);
    const shiftPlain = caesar(text, -shift.shift);
    attempts.push({
      cipher: "Caesar",
      keyLabel: `shift ${shift.shift}`,
      fitness: scoreText(shiftPlain),
      plaintext: shiftPlain,
      href: "/caesar",
    });
    if (!readable()) {
      const recovered = breakSubstitution(text, table, { rng: options.rng });
      const plain = substitution(text, recovered.key, "decrypt");
      attempts.push({
        cipher: "Substitution",
        keyLabel: recovered.key,
        fitness: scoreText(plain),
        plaintext: plain,
        href: "/substitution",
      });
    }
  } else {
    const [vigenereBest] = breakPeriodic(text, vigenereDecrypt);
    const vigenerePlain = vigenere(text, vigenereBest.key, "decrypt");
    attempts.push({
      cipher: "Vigenère",
      keyLabel: vigenereBest.key,
      fitness: scoreText(vigenerePlain),
      plaintext: vigenerePlain,
      href: "/vigenere",
    });
    const [beaufortBest] = breakPeriodic(text, beaufortDecrypt);
    const beaufortPlain = beaufort(text, beaufortBest.key);
    attempts.push({
      cipher: "Beaufort",
      keyLabel: beaufortBest.key,
      fitness: scoreText(beaufortPlain),
      plaintext: beaufortPlain,
      href: "/beaufort",
    });
  }

  // Plaintext autokey leaves no passive signature, so it is an active fallback.
  // It is cheap, so it runs before the slow general polyalphabetic attack.
  if (longEnoughForAutokey && !readable()) {
    const recovered = breakPlaintextAutokey(text, table, { rng: options.rng });
    attempts.push({
      cipher: "Plaintext autokey",
      keyLabel: `primer length ${recovered.primerLength}`,
      fitness: scoreText(recovered.plaintext),
      plaintext: recovered.plaintext,
      href: "/autokey",
    });
  }

  if (period > 1 && !readable()) {
    const recovered = breakPolyalphabetic(text, table, {
      period,
      restarts: options.restarts,
      rng: options.rng,
      onProgress: options.onProgress,
    });
    attempts.push({
      cipher: "Polyalphabetic",
      keyLabel: `period ${recovered.period}`,
      fitness: scoreText(recovered.plaintext),
      plaintext: recovered.plaintext,
      href: "/polyalphabetic",
    });
  }

  attempts.sort((a, b) => {
    if (Math.abs(a.fitness - b.fitness) <= SIMPLER_EPSILON) {
      return COMPLEXITY[a.cipher] - COMPLEXITY[b.cipher];
    }
    return b.fitness - a.fitness;
  });
  return {
    period,
    diagnostics,
    best: attempts[0],
    attempts,
    alreadyEnglish: scoreText(text) >= READABLE,
  };
}
