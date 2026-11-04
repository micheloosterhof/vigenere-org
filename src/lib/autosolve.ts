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
  type PolyalphabeticSolver,
} from "./solve-polyalphabetic";
import {
  AUTOKEY_MIN_LENGTH,
  breakCiphertextAutokey,
  breakPlaintextAutokey,
} from "./solve-autokey";
import { analyze, type Diagnostics } from "./diagnostics";
import { shareSearch } from "./share-url";

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
  /** Deep link to the tool page with the ciphertext and recovered key filled in. */
  href: string;
}

/**
 * Deep link to a tool page: `decrypt` opens its form showing the plaintext,
 * `break` opens its breaker on the ciphertext when the key cannot be filled in.
 */
function deepLink(
  page: string,
  text: string,
  fields: ReadonlyArray<[name: string, value: string]>,
  mode: "decrypt" | "break",
): string {
  return `/${page}/${shareSearch([["text", text], ...fields, ["mode", mode]])}`;
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
  /** Runs the polyalphabetic fallback; defaults to the sequential solver on this thread. */
  solvePolyalphabetic?: PolyalphabeticSolver;
}

const QUAGMIRE_NAME: Record<DictionaryVariant, string> = {
  1: "Quagmire I",
  2: "Quagmire II",
  3: "Quagmire III",
};

/**
 * Breaks ciphertext without being told the cipher. The cheap attacks (Caesar
 * and Atbash when the text looks monoalphabetic, Vigenère and Beaufort
 * always) run first; the index of coincidence then chooses the slow fallback
 * when nothing reads as English: the substitution climb for monoalphabetic
 * text, the general polyalphabetic attack for periodic text.
 */
export async function autosolve(
  text: string,
  table: Uint8Array,
  options: Options = {},
): Promise<AutosolveResult> {
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
      href: deepLink("autokey", text, [], "break"),
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
      href: deepLink(
        "railfence",
        text,
        [["rails", String(rail.rails)]],
        "decrypt",
      ),
    });
    const [columnar] = breakColumnar(text);
    attempts.push({
      cipher: "Columnar transposition",
      keyLabel: columnar.key,
      fitness: columnar.fitness,
      plaintext: columnar.plaintext,
      href: deepLink("transposition", text, [["key", columnar.key]], "decrypt"),
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
      href: deepLink(
        "caesar",
        text,
        [["shift", String(shift.shift)]],
        "decrypt",
      ),
    });
    const atbashPlain = atbash(text);
    attempts.push({
      cipher: "Atbash",
      keyLabel: "none",
      fitness: scoreText(atbashPlain),
      plaintext: atbashPlain,
      href: deepLink("atbash", text, [], "decrypt"),
    });
  }

  // The periodic breakers search every key length themselves and are cheap,
  // so they run whatever the period estimate says: on short text the index
  // of coincidence can call a Vigenère monoalphabetic. A key of length 1 ties
  // with Caesar on fitness and loses to it on simplicity.
  const periodic = { quadgrams: table };
  const [vigenereBest] = breakPeriodic(text, vigenereDecrypt, periodic);
  const vigenerePlain = vigenere(text, vigenereBest.key, "decrypt");
  attempts.push({
    cipher: "Vigenère",
    keyLabel: vigenereBest.key,
    fitness: scoreText(vigenerePlain),
    plaintext: vigenerePlain,
    href: deepLink("vigenere", text, [["key", vigenereBest.key]], "decrypt"),
  });
  const [beaufortBest] = breakPeriodic(text, beaufortDecrypt, periodic);
  const beaufortPlain = beaufort(text, beaufortBest.key);
  attempts.push({
    cipher: "Beaufort",
    keyLabel: beaufortBest.key,
    fitness: scoreText(beaufortPlain),
    plaintext: beaufortPlain,
    href: deepLink("beaufort", text, [["key", beaufortBest.key]], "decrypt"),
  });

  if (period === 1 && !readable()) {
    const recovered = breakSubstitution(text, table, { rng: options.rng });
    const plain = substitution(text, recovered.key, "decrypt");
    attempts.push({
      cipher: "Substitution",
      keyLabel: recovered.key,
      fitness: scoreText(plain),
      plaintext: plain,
      href: deepLink("substitution", text, [["key", recovered.key]], "decrypt"),
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
      href: deepLink("autokey", text, [], "break"),
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
        href: deepLink(
          "quagmire",
          text,
          [
            ["variant", String(dictionary.variant)],
            ["keyword", dictionary.keyword],
            ["key", dictionary.key],
            ["indicator", dictionary.indicator],
          ],
          "decrypt",
        ),
      });
    }
  }

  if (period > 1 && !readable()) {
    const solve: PolyalphabeticSolver =
      options.solvePolyalphabetic ??
      (async (t, tb, o) =>
        breakPolyalphabetic(t, tb, { ...o, rng: options.rng }));
    const recovered = await solve(text, table, {
      period,
      restarts: options.restarts,
      onProgress: options.onProgress,
    });
    attempts.push({
      cipher: "Polyalphabetic",
      keyLabel: `period ${recovered.period}`,
      fitness: scoreText(recovered.plaintext),
      plaintext: recovered.plaintext,
      href: deepLink(
        "polyalphabetic",
        text,
        [["period", String(recovered.period)]],
        "break",
      ),
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
