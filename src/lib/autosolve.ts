// ABOUTME: Identifies and breaks pasted ciphertext automatically for the homepage.
// ABOUTME: Routes by index of coincidence, escalating from Caesar to the general polyalphabetic attack.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { atbash, beaufort, caesar, substitution, vigenere } from "./cipher";
import {
  beaufortDecrypt,
  breakPeriodic,
  caesarCandidates,
  READABLE_BIGRAM,
  scoreText,
  vigenereDecrypt,
} from "./solve";
import { breakRailFence } from "./railfence";
import { breakColumnar } from "./transposition";
import {
  breakQuagmireDictionary,
  type DictionaryVariant,
} from "./solve-quagmire-dictionary";
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

// Attempts within this fitness of each other are ranked by cipher simplicity.
const SIMPLER_EPSILON = 0.05;

const COMPLEXITY: Record<string, number> = {
  Atbash: 0,
  Caesar: 0,
  "Rail fence": 1,
  Vigenère: 1,
  Beaufort: 1,
  "Columnar transposition": 2,
  Substitution: 2,
  "Quagmire I": 2,
  "Quagmire II": 2,
  "Quagmire III": 2,
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
  /** Keyword list enabling the Quagmire dictionary attack. */
  words?: string[];
  onProgress?: (progress: PolyalphabeticProgress) => void;
}

const QUAGMIRE_NAME: Record<DictionaryVariant, string> = {
  1: "Quagmire I",
  2: "Quagmire II",
  3: "Quagmire III",
};

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
  const readable = (): boolean =>
    attempts.some((a) => a.fitness >= READABLE_BIGRAM);
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

  // English-frequency letters that do not read as English were moved, not
  // substituted; both transposition attacks are cheap exhaustive searches.
  if (diagnostics.likelyFamily === "transposition") {
    const [rail] = breakRailFence(text);
    attempts.push({
      cipher: "Rail fence",
      keyLabel: `${rail.rails} rails`,
      fitness: rail.fitness,
      plaintext: rail.plaintext,
      href: "/railfence",
    });
    const [columnar] = breakColumnar(text);
    attempts.push({
      cipher: "Columnar transposition",
      keyLabel: columnar.key,
      fitness: columnar.fitness,
      plaintext: columnar.plaintext,
      href: "/transposition",
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
    const atbashPlain = atbash(text);
    attempts.push({
      cipher: "Atbash",
      keyLabel: "none",
      fitness: scoreText(atbashPlain),
      plaintext: atbashPlain,
      href: "/atbash",
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

  // The keyword dictionary attack covers the Quagmire family on far shorter
  // text than the general attack, and is much cheaper, so it goes first.
  if (options.words !== undefined && !readable()) {
    const dictionary = breakQuagmireDictionary(text, options.words, table);
    if (dictionary.found) {
      attempts.push({
        cipher: QUAGMIRE_NAME[dictionary.variant],
        keyLabel: `keyword ${dictionary.keyword}, key ${dictionary.key}`,
        fitness: scoreText(dictionary.plaintext),
        plaintext: dictionary.plaintext,
        href: "/quagmire",
      });
    }
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
    alreadyEnglish: scoreText(text) >= READABLE_BIGRAM,
  };
}
