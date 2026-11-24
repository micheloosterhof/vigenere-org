// ABOUTME: Identifies and breaks pasted ciphertext automatically for the homepage.
// ABOUTME: Routes by index of coincidence, escalating from Caesar and affine to the general polyalphabetic attack.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import {
  atbash,
  beaufort,
  caesar,
  porta,
  substitution,
  vigenere,
} from "./cipher";
import { AFFINE_REQUIREMENTS, breakAffine } from "./affine";
import { ROUTE_REQUIREMENTS, breakRoute, routeCipher } from "./route";
import {
  CAESAR_REQUIREMENTS,
  PERIODIC_REQUIREMENTS,
  PORTA_REQUIREMENTS,
  beaufortDecrypt,
  breakPeriodic,
  caesarCandidates,
  breakPorta,
  READABLE_BIGRAM,
  scoreText,
  toLetterValues,
  vigenereDecrypt,
} from "./solve";
import { quadgramFitness } from "./quadgrams";
import { RAIL_FENCE_REQUIREMENTS, breakRailFence } from "./railfence";
import { COLUMNAR_REQUIREMENTS, breakColumnar } from "./transposition";
import {
  breakQuagmireDictionary,
  type DictionaryVariant,
  type QuagmireDictionaryResult,
} from "./solve-quagmire-dictionary";
import {
  breakQuagmireDictionaryJoint,
  QUAGMIRE_DICTIONARY_JOINT_REQUIREMENTS,
} from "./solve-quagmire-dictionary-joint";
import {
  breakQuagmireLetterSets,
  QUAGMIRE_LETTER_SETS_REQUIREMENTS,
} from "./solve-quagmire-letter-sets";
import type { LetterSetsSolver } from "./letter-sets-pool";
import type { JointShiftsSolver } from "./joint-shifts-pool";
import type { DictionarySolver } from "./quagmire-dictionary-pool";
import { breakQuagmireIv, QUAGMIRE_IV_REQUIREMENTS } from "./solve-quagmire-iv";
import type { QuagmireIvSolver } from "./quagmire-iv-pool";
import {
  breakPlayfair,
  couldBePlayfair,
  PLAYFAIR_REQUIREMENTS,
} from "./solve-playfair";
import {
  breakFractionation,
  FRACTIONATION_REQUIREMENTS,
  type FractionationCipher,
} from "./solve-fractionation";
import type { FractionationSolver, PlayfairSolver } from "./anneal-pool";
import { TRIFID_EXTRA } from "./trifid";
import {
  SUBSTITUTION_REQUIREMENTS,
  breakSubstitution,
} from "./solve-substitution";
import {
  POLYALPHABETIC_REQUIREMENTS,
  breakPolyalphabetic,
  type PolyalphabeticProgress,
  type PolyalphabeticSolver,
} from "./solve-polyalphabetic";
import {
  CIPHERTEXT_AUTOKEY_REQUIREMENTS,
  PLAINTEXT_AUTOKEY_REQUIREMENTS,
  TABLEAU_NAME,
  breakCiphertextAutokey,
  breakPlaintextAutokey,
} from "./solve-autokey";
import { analyze, type Diagnostics } from "./diagnostics";
import { shareSearch } from "./share-url";
import {
  meetsRequirements,
  type SolverRequirements,
  type TextShape,
} from "./solver-requirements";

// Average quadgram log10 probability a decryption must reach, besides the
// bigram level, to count as read. A long key on short text fits bigrams to
// pseudo-English (a 13-letter Vigenère key reaches -2.46 on the 63 letters of
// Kryptos K1, whose true plaintext scores -2.44) but stays far from English
// on quadgrams (-5.0 against -4.4).
const READABLE_QUADGRAM = -4.7;

// From this many letters the letter-set scan runs before the joint shifts.
const LETTER_SETS_FIRST = 100;

// Attempts within this fitness of each other are ranked by cipher simplicity.
const SIMPLER_EPSILON = 0.05;
// The same for attempts that do not read as English, in quadgram fitness.
const UNREAD_EPSILON = 0.1;

const COMPLEXITY: Record<string, number> = {
  Atbash: 0,
  Caesar: 0,
  Affine: 1,
  "Rail fence": 1,
  Route: 1,
  Vigenère: 1,
  Beaufort: 1,
  Porta: 1,
  "Columnar transposition": 2,
  Substitution: 2,
  Playfair: 2,
  "Quagmire I": 2,
  "Quagmire II": 2,
  "Quagmire III": 2,
  "Quagmire IV": 2,
  "Ciphertext autokey": 2,
  "Plaintext autokey": 3,
  Polyalphabetic: 3,
  Bifid: 3,
  Trifid: 3,
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
  /** True when the best attempt reads as English; otherwise it is only the closest guess. */
  solved: boolean;
  alreadyEnglish: boolean;
}

interface Options {
  rng?: () => number;
  /** Restart count for the polyalphabetic fallback. */
  restarts?: number;
  /** Keyword list enabling the Quagmire dictionary attack. */
  words?: string[];
  onProgress?: (progress: PolyalphabeticProgress) => void;
  /** Called with the cipher each slow search is for, as the search starts. */
  onStage?: (cipher: string) => void;
  /** Runs the polyalphabetic fallback; defaults to the sequential solver on this thread. */
  solvePolyalphabetic?: PolyalphabeticSolver;
  /** Runs the Quagmire keyword dictionary attack; defaults to the sequential solver on this thread. */
  solveDictionary?: DictionarySolver;
  /** Runs the Quagmire letter-set scan; defaults to the sequential solver on this thread. */
  solveLetterSets?: LetterSetsSolver;
  /** Runs the joint-shift Quagmire dictionary attack; defaults to the sequential solver on this thread. */
  solveJointShifts?: JointShiftsSolver;
  /** Runs the Quagmire IV search for two keywords; defaults to the sequential solver on this thread. */
  solveQuagmireIv?: QuagmireIvSolver;
  /** Runs the Playfair search; defaults to the sequential solver on this thread. */
  solvePlayfair?: PlayfairSolver;
  /** Runs the Bifid and Trifid searches; defaults to the sequential solver on this thread. */
  solveFractionation?: FractionationSolver;
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
  // The solver behind each attempt, with the key period it found: its
  // requirements decide whether the attempt can be believed.
  const solvers = new Map<
    Attempt,
    { requirements?: SolverRequirements; period?: number }
  >();
  const add = (
    attempt: Attempt,
    requirements?: SolverRequirements,
    period?: number,
  ): void => {
    attempts.push(attempt);
    solvers.set(attempt, { requirements, period });
  };
  /** Average quadgram log10 probability of an attempt's decryption; text too short to have one passes. */
  const quadgram = (attempt: Attempt): number => {
    const values = toLetterValues(attempt.plaintext);
    return values.length < 4 ? 0 : quadgramFitness(values, table);
  };
  /** False when the text is less than the attempt's solver can be believed on. */
  const believable = (attempt: Attempt): boolean => {
    const { requirements, period } = solvers.get(attempt) ?? {};
    return (
      requirements === undefined ||
      meetsRequirements(requirements, { letters: shape.letters, period })
    );
  };
  const reads = (attempt: Attempt): boolean => {
    if (attempt.fitness < READABLE_BIGRAM || !believable(attempt)) {
      return false;
    }
    const { requirements } = solvers.get(attempt) ?? {};
    return (
      quadgram(attempt) >= (requirements?.readableQuadgram ?? READABLE_QUADGRAM)
    );
  };
  const readable = (): boolean => attempts.some(reads);
  // Both autokey attacks need more text than the others; short text gets the
  // attacks it can support rather than an error.
  const shape: TextShape = { letters: diagnostics.length };

  // Ciphertext autokey has no period, so the statistics flag it directly.
  if (
    meetsRequirements(CIPHERTEXT_AUTOKEY_REQUIREMENTS, shape) &&
    diagnostics.likelyFamily === "ciphertext-autokey"
  ) {
    const recovered = breakCiphertextAutokey(text, table);
    add(
      {
        cipher: "Ciphertext autokey",
        keyLabel: `primer length ${recovered.primerLength}, ${TABLEAU_NAME[recovered.tableau]} tableau, opening ~${recovered.primerLength} letters approximate`,
        fitness: scoreText(recovered.plaintext),
        plaintext: recovered.plaintext,
        href: deepLink("autokey", text, [], "break"),
      },
      CIPHERTEXT_AUTOKEY_REQUIREMENTS,
    );
  }

  // English-frequency letters that do not read as English were moved, not
  // substituted; both transposition attacks are cheap exhaustive searches.
  if (diagnostics.likelyFamily === "transposition") {
    const [rail] = breakRailFence(text);
    add(
      {
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
      },
      RAIL_FENCE_REQUIREMENTS,
    );
    // A prime letter count fits no grid, so the route attack has nothing to try.
    const letterCount = text.toUpperCase().replace(/[^A-Z]/g, "").length;
    const fitsGrid = Array.from(
      { length: Math.max(0, Math.floor(letterCount / 2) - 1) },
      (_, i) => i + 2,
    ).some((columns) => letterCount % columns === 0);
    if (fitsGrid) {
      const [route] = breakRoute(text);
      const routePlain = routeCipher(
        text,
        route.columns,
        route.fill,
        route.route,
        "decrypt",
      );
      add(
        {
          cipher: "Route",
          keyLabel: `${route.columns} columns, ${route.fill}, ${route.route}`,
          fitness: scoreText(routePlain),
          plaintext: routePlain,
          href: deepLink(
            "route",
            text,
            [
              ["columns", String(route.columns)],
              ["fill", route.fill],
              ["route", route.route],
            ],
            "decrypt",
          ),
        },
        ROUTE_REQUIREMENTS,
      );
    }
    const [columnar] = breakColumnar(text);
    add(
      {
        cipher: "Columnar transposition",
        keyLabel: columnar.key,
        fitness: columnar.fitness,
        plaintext: columnar.plaintext,
        href: deepLink(
          "transposition",
          text,
          [["key", columnar.key]],
          "decrypt",
        ),
      },
      COLUMNAR_REQUIREMENTS,
    );
  }

  if (period === 1) {
    const [shift] = caesarCandidates(text);
    const shiftPlain = caesar(text, -shift.shift);
    add(
      {
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
      },
      CAESAR_REQUIREMENTS,
    );
    // Affine keys with a = 1 are Caesar shifts and a = b = 25 is Atbash; those
    // are already covered by the simpler attempts.
    const [affineBest] = breakAffine(text);
    const isCaesar = affineBest.a === 1;
    const isAtbash = affineBest.a === 25 && affineBest.b === 25;
    if (!isCaesar && !isAtbash) {
      add(
        {
          cipher: "Affine",
          keyLabel: `a = ${affineBest.a}, b = ${affineBest.b}`,
          fitness: scoreText(affineBest.plaintext),
          plaintext: affineBest.plaintext,
          href: deepLink(
            "affine",
            text,
            [
              ["a", String(affineBest.a)],
              ["b", String(affineBest.b)],
            ],
            "decrypt",
          ),
        },
        AFFINE_REQUIREMENTS,
      );
    }
    const atbashPlain = atbash(text);
    add({
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
  add(
    {
      cipher: "Vigenère",
      keyLabel: vigenereBest.key,
      fitness: scoreText(vigenerePlain),
      plaintext: vigenerePlain,
      href: deepLink("vigenere", text, [["key", vigenereBest.key]], "decrypt"),
    },
    PERIODIC_REQUIREMENTS,
  );
  const [beaufortBest] = breakPeriodic(text, beaufortDecrypt, periodic);
  const beaufortPlain = beaufort(text, beaufortBest.key);
  add(
    {
      cipher: "Beaufort",
      keyLabel: beaufortBest.key,
      fitness: scoreText(beaufortPlain),
      plaintext: beaufortPlain,
      href: deepLink("beaufort", text, [["key", beaufortBest.key]], "decrypt"),
    },
    PERIODIC_REQUIREMENTS,
  );

  const [portaBest] = breakPorta(text, periodic);
  const portaPlain = porta(text, portaBest.key);
  add(
    {
      cipher: "Porta",
      keyLabel: portaBest.key,
      fitness: scoreText(portaPlain),
      plaintext: portaPlain,
      href: deepLink("porta", text, [["key", portaBest.key]], "decrypt"),
    },
    PORTA_REQUIREMENTS,
  );

  if (period === 1 && !readable()) {
    const recovered = breakSubstitution(text, table, { rng: options.rng });
    const plain = substitution(text, recovered.key, "decrypt");
    add(
      {
        cipher: "Substitution",
        keyLabel: recovered.key,
        fitness: scoreText(plain),
        plaintext: plain,
        href: deepLink(
          "substitution",
          text,
          [["key", recovered.key]],
          "decrypt",
        ),
      },
      SUBSTITUTION_REQUIREMENTS,
    );
  }

  // Plaintext autokey leaves no passive signature, so it is an active fallback.
  // It is cheap, so it runs before the slow general polyalphabetic attack.
  if (meetsRequirements(PLAINTEXT_AUTOKEY_REQUIREMENTS, shape) && !readable()) {
    const recovered = breakPlaintextAutokey(text, table, { rng: options.rng });
    add(
      {
        cipher: "Plaintext autokey",
        keyLabel: `primer length ${recovered.primerLength}, ${TABLEAU_NAME[recovered.tableau]} tableau`,
        fitness: scoreText(recovered.plaintext),
        plaintext: recovered.plaintext,
        href: deepLink("autokey", text, [], "break"),
      },
      PLAINTEXT_AUTOKEY_REQUIREMENTS,
    );
  }

  // The Playfair search takes up to a minute to give up, so it runs only on
  // text with the marks of the cipher: pairs that never hold a letter twice,
  // and no J. Of 1200 texts of other ciphers with an even number of letters,
  // 46 have them at 100 letters, 3 at 200 and none at 300
  // (bench/results/cipher-marks.tsv). The statistics call half of all
  // Playfair texts periodic, so the search goes before the slow periodic ones.
  if (
    !readable() &&
    meetsRequirements(PLAYFAIR_REQUIREMENTS, shape) &&
    couldBePlayfair(text)
  ) {
    const solve: PlayfairSolver =
      options.solvePlayfair ??
      (async (t, tb) =>
        breakPlayfair(t, tb, { rng: options.rng ?? Math.random }));
    options.onStage?.("Playfair");
    const solved = await solve(text, table);
    if (solved.english) {
      add(
        {
          cipher: "Playfair",
          keyLabel: `square ${solved.key}`,
          fitness: scoreText(solved.plaintext),
          plaintext: solved.plaintext,
          href: deepLink("playfair", text, [["key", solved.key]], "decrypt"),
        },
        PLAYFAIR_REQUIREMENTS,
      );
    }
  }

  /** Searches for a Bifid square or a Trifid cube at every period; `grid` names the key in the attempt. */
  const tryFractionation = async (
    cipher: FractionationCipher,
    name: string,
    grid: string,
  ): Promise<void> => {
    const solve: FractionationSolver =
      options.solveFractionation ??
      (async (c, t, tb) =>
        breakFractionation(c, t, tb, { rng: options.rng ?? Math.random }));
    options.onStage?.(name);
    const solved = await solve(cipher, text, table);
    if (solved.english) {
      add(
        {
          cipher: name,
          keyLabel: `${grid} ${solved.key}, period ${solved.period}`,
          fitness: scoreText(solved.plaintext),
          plaintext: solved.plaintext,
          href: deepLink(
            cipher,
            text,
            [
              ["key", solved.key],
              ["period", String(solved.period)],
            ],
            "decrypt",
          ),
        },
        FRACTIONATION_REQUIREMENTS,
      );
    }
  };

  // Bifid works on a square without J, so its ciphertext has none. Text with
  // English letter frequencies is left out: it mostly has no J either, and
  // only 10 of 1000 Bifid texts keep those frequencies. Of 800 texts of
  // Vigenère, Trifid, transposition and random letters, 24 pass at 100
  // letters, 5 at 150 and 2 at 200 (bench/results/cipher-marks.tsv). The
  // statistics call most Bifid texts periodic, so the search goes before the
  // slow periodic ones.
  if (
    !readable() &&
    meetsRequirements(FRACTIONATION_REQUIREMENTS, shape) &&
    diagnostics.likelyFamily !== "transposition" &&
    !/j/i.test(text)
  ) {
    await tryFractionation("bifid", "Bifid", "square");
  }

  // Trifid works on a cube of 27 symbols, the alphabet and "+", so only its
  // ciphertext holds a "+" among the letters: 199 of 200 Trifid texts of 300
  // letters have one, and no text of another cipher
  // (bench/results/cipher-marks.tsv). The search takes a minute to give up.
  if (
    !readable() &&
    meetsRequirements(FRACTIONATION_REQUIREMENTS, shape) &&
    text.includes(TRIFID_EXTRA)
  ) {
    await tryFractionation("trifid", "Trifid", "cube");
  }

  const pushQuagmire = (dictionary: QuagmireDictionaryResult): void => {
    add({
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
  };

  // The keyword dictionary attack covers the Quagmire family on far shorter
  // text than the general attack, and is much cheaper, so it goes first.
  if (options.words !== undefined && !readable()) {
    options.onStage?.("Quagmire");
    const solve: DictionarySolver =
      options.solveDictionary ??
      (async (t, words, tb) => breakQuagmireDictionary(t, words, tb));
    const dictionary = await solve(text, options.words, table, {});
    if (dictionary.found) {
      pushQuagmire(dictionary);
    }
  }

  let polyalphabeticTried = false;
  const tryPolyalphabetic = async (): Promise<void> => {
    polyalphabeticTried = true;
    const solve: PolyalphabeticSolver =
      options.solvePolyalphabetic ??
      (async (t, tb, o) =>
        breakPolyalphabetic(t, tb, { ...o, rng: options.rng }));
    const recovered = await solve(text, table, {
      period,
      restarts: options.restarts,
      onProgress: options.onProgress,
    });
    const attempt: Attempt = {
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
    };
    // A free alphabet per column fits short columns to pseudo-English, which
    // the requirements' letters per column guard against.
    add(attempt, POLYALPHABETIC_REQUIREMENTS, recovered.period);
  };

  // With enough letters per column to be believed, the general attack takes
  // seconds, so it goes before the slower Quagmire searches.
  if (
    period > 1 &&
    !readable() &&
    meetsRequirements(POLYALPHABETIC_REQUIREMENTS, { ...shape, period })
  ) {
    await tryPolyalphabetic();
  }

  // The two slower Quagmire searches run only on text the statistics call
  // periodic and that nothing cheaper has read. With few letters per column
  // the dictionary keywords need their shifts solved together; a keyword
  // outside the word list is found from which letters it holds.
  const jointShifts = async (): Promise<void> => {
    if (
      options.words !== undefined &&
      meetsRequirements(QUAGMIRE_DICTIONARY_JOINT_REQUIREMENTS, shape)
    ) {
      const solve: JointShiftsSolver =
        options.solveJointShifts ??
        (async (t, words, tb) =>
          breakQuagmireDictionaryJoint(t, words, tb, { rng: options.rng }));
      const joint = await solve(text, options.words, table, {});
      if (joint.found) {
        pushQuagmire(joint);
      }
    }
  };
  const letterSets = async (): Promise<void> => {
    if (meetsRequirements(QUAGMIRE_LETTER_SETS_REQUIREMENTS, shape)) {
      const solve: LetterSetsSolver =
        options.solveLetterSets ??
        (async (t, tb, o) =>
          breakQuagmireLetterSets(t, tb, { ...o, rng: options.rng }));
      const solved = await solve(text, table, {});
      if (solved.found) {
        pushQuagmire(solved);
      }
    }
  };
  // Either may take a minute to give up. Longer text is more likely to have
  // the letters per column the letter-set scan needs, so it goes first there.
  const searches =
    shape.letters >= LETTER_SETS_FIRST
      ? [letterSets, jointShifts]
      : [jointShifts, letterSets];
  for (const search of searches) {
    if (period > 1 && !readable()) {
      options.onStage?.("Quagmire");
      await search();
    }
  }

  // Two different keywords (Quagmire IV) are the last keyword search: no
  // single keyword fits, and the general attack has not read the text.
  if (
    period > 1 &&
    !readable() &&
    meetsRequirements(QUAGMIRE_IV_REQUIREMENTS, shape)
  ) {
    const solve: QuagmireIvSolver =
      options.solveQuagmireIv ??
      (async (t, tb, o) => breakQuagmireIv(t, tb, { ...o, rng: options.rng }));
    options.onStage?.("Quagmire IV");
    const solved = await solve(text, table, {});
    if (solved.found) {
      add({
        cipher: "Quagmire IV",
        keyLabel: `keywords ${solved.plainKeyword} and ${solved.cipherKeyword}, key ${solved.key}`,
        fitness: scoreText(solved.plaintext),
        plaintext: solved.plaintext,
        href: deepLink(
          "quagmire",
          text,
          [
            ["variant", "4"],
            ["keyword", solved.plainKeyword],
            ["keyword2", solved.cipherKeyword],
            ["key", solved.key],
            ["indicator", solved.indicator],
          ],
          "decrypt",
        ),
      });
    }
  }

  // Last resort: the general attack on text too short to believe its answer.
  if (period > 1 && !readable() && !polyalphabeticTried) {
    await tryPolyalphabetic();
  }

  attempts.sort((a, b) => {
    if (reads(a) !== reads(b)) {
      return reads(a) ? -1 : 1;
    }
    if (believable(a) !== believable(b)) {
      return believable(a) ? -1 : 1;
    }
    // Among attempts that do not read as English the closest guess is the
    // one nearest English on quadgrams: bigrams are what a long key fits.
    if (!reads(a)) {
      if (Math.abs(quadgram(a) - quadgram(b)) <= UNREAD_EPSILON) {
        return COMPLEXITY[a.cipher] - COMPLEXITY[b.cipher];
      }
      return quadgram(b) - quadgram(a);
    }
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
    solved: reads(attempts[0]),
    alreadyEnglish: scoreText(text) >= READABLE_BIGRAM,
  };
}
