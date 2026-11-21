// ABOUTME: Web Worker running the Quagmire I-III solvers off the main thread.
// ABOUTME: Tries the keyword dictionary attacks and the letter-set scan, then falls back to the statistical solver.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { breakQuagmire } from "./solve-quagmire";
import { toLetterValues } from "./solve";
import {
  breakQuagmireDictionary,
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
import { meetsRequirements } from "./solver-requirements";
import {
  breakPolyalphabeticParallel,
  canSpawnWorkers,
} from "./polyalphabetic-pool";

interface Request {
  text: string;
  table: ArrayBuffer;
  words: string[];
  period?: number;
}

/** How a keyword was found: in the word list, or from the ciphertext alone. */
type Method = "dictionary" | "letter-sets";

// From this many letters the letter-set scan runs before the joint shifts.
const LETTER_SETS_FIRST = 100;

const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<Request>) => Promise<void>) | null;
};

scope.onmessage = async (event) => {
  const { text, table, words, period } = event.data;
  const bytes = new Uint8Array(table);
  try {
    const dictionary = breakQuagmireDictionary(text, words, bytes, {
      period,
      onProgress: (done, total) =>
        scope.postMessage({
          type: "progress",
          phase: "dictionary",
          done,
          total,
        }),
    });
    if (dictionary.found) {
      scope.postMessage({ type: "result", method: "dictionary", dictionary });
      return;
    }
    const letters = toLetterValues(text).length;
    // Text with few letters per column needs the keyword's shifts solved
    // together. The per-column figure is not checked: below it the attack is
    // less reliable but still the only one with a chance.
    const jointShifts = (): QuagmireDictionaryResult | null =>
      meetsRequirements(QUAGMIRE_DICTIONARY_JOINT_REQUIREMENTS, { letters })
        ? breakQuagmireDictionaryJoint(text, words, bytes, {
            period,
            onProgress: (done, total) =>
              scope.postMessage({
                type: "progress",
                phase: "shifts",
                done,
                total,
              }),
          })
        : null;
    // A keyword outside the word list is found from which letters it holds.
    const letterSets = (): QuagmireDictionaryResult | null =>
      meetsRequirements(QUAGMIRE_LETTER_SETS_REQUIREMENTS, { letters })
        ? breakQuagmireLetterSets(text, bytes, {
            periods: period === undefined ? undefined : [period],
            onProgress: (done, total) =>
              scope.postMessage({
                type: "progress",
                phase: "letter-sets",
                done,
                total,
              }),
          })
        : null;
    // Either may take a minute to give up. Longer text is more likely to have
    // the letters per column the letter-set scan needs, so it goes first
    // there; short text goes to the joint shifts first.
    const stages: [Method, () => QuagmireDictionaryResult | null][] =
      letters >= LETTER_SETS_FIRST
        ? [
            ["letter-sets", letterSets],
            ["dictionary", jointShifts],
          ]
        : [
            ["dictionary", jointShifts],
            ["letter-sets", letterSets],
          ];
    for (const [method, run] of stages) {
      const solved = run();
      if (solved?.found) {
        scope.postMessage({ type: "result", method, dictionary: solved });
        return;
      }
    }
    const result = await breakQuagmire(text, bytes, {
      period,
      onProgress: (progress) =>
        scope.postMessage({ type: "progress", phase: "general", ...progress }),
      // The general solve fans out to nested workers where the browser allows it.
      solvePolyalphabetic: canSpawnWorkers()
        ? breakPolyalphabeticParallel
        : undefined,
    });
    scope.postMessage({ type: "result", method: "general", result });
  } catch (cause) {
    scope.postMessage({
      type: "error",
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
};
