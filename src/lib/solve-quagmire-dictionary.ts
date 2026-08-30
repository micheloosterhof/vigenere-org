// ABOUTME: Quagmire III keyword dictionary attack: tries every wordlist keyword as the mixed alphabet.
// ABOUTME: With the alphabet fixed each column is a 26-way shift, so short texts break in seconds.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { inverseAlphabet, mixedAlphabet, substituteLetters } from "./cipher";
import { scoreLetterValues, toLetterValues } from "./solve";
import { ENGLISH_FREQUENCIES } from "./diagnostics";
import { recoverQuagmireKey } from "./keyword-alphabet";
import { quadgramFitness } from "./quadgrams";

const ALPHABET_SIZE = 26;
const CODE_A = 65;
const MAX_PERIOD = 12;
const MIN_LENGTH = 8;
const PROGRESS_EVERY = 500;

// A long period can shift every column freely, which inflates bigram fitness
// on short text into pseudo-English. Cheap bigram scoring therefore only
// shortlists candidates; quadgram rescoring makes the call, since overfit mush
// collapses under quadgrams while real English does not.
const SHORTLIST = 40;

// Average quadgram log10 probability separating English decryptions (about
// -4.2) from overfit pseudo-English (below -5).
const READABLE_QUADGRAM = -4.7;

// Finalists within this quadgram fitness of the best are ranked by period, so
// the true period beats longer ones that overfit.
const FITNESS_EPSILON = 0.1;

export interface QuagmireDictionaryResult {
  /** True when the best decryption reads as English. */
  found: boolean;
  /** The dictionary keyword whose alphabet produced the best decryption. */
  keyword: string;
  /** The keyword-mixed alphabet. */
  alphabet: string;
  period: number;
  offsets: number[];
  /** The period key as letters, read off with the best-scoring indicator. */
  key: string;
  indicator: string;
  plaintext: string;
  /** Average quadgram log10 probability of the decryption; comparable with the statistical solver. */
  fitness: number;
}

interface Options {
  /** Try only this key length instead of every length up to the maximum. */
  period?: number;
  maxPeriod?: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Breaks a Quagmire III by trying every dictionary word as the alphabet
 * keyword. For each keyword and period, every column's shift is chosen
 * independently against English letter frequencies — cheap enough to scan the
 * whole dictionary — then a bigram-scored shortlist is rescored with the
 * quadgram table, which decides the winner. Works on far shorter text than
 * the statistical solver, but only when the keyword really is in the list:
 * check `found`.
 */
export function breakQuagmireDictionary(
  text: string,
  words: string[],
  table: Uint8Array,
  options: Options = {},
): QuagmireDictionaryResult {
  const cipher = toLetterValues(text);
  if (cipher.length < MIN_LENGTH) {
    throw new Error(`text must contain at least ${MIN_LENGTH} letters`);
  }
  const longest = Math.max(
    1,
    Math.min(options.maxPeriod ?? MAX_PERIOD, Math.floor(cipher.length / 3)),
  );
  const shortest = Math.min(options.period ?? 1, longest);
  const cappedLongest = options.period === undefined ? longest : shortest;
  const logFreq = ENGLISH_FREQUENCIES.map(Math.log);

  // Letter histogram per column, shared by every keyword at that period.
  const countsAtPeriod: Int32Array[] = [];
  for (let period = shortest; period <= cappedLongest; period += 1) {
    const counts = new Int32Array(period * ALPHABET_SIZE);
    cipher.forEach((value, i) => {
      counts[(i % period) * ALPHABET_SIZE + value] += 1;
    });
    countsAtPeriod[period] = counts;
  }

  interface Candidate {
    word: string;
    period: number;
    offsets: number[];
    bigram: number;
  }
  const shortlist: Candidate[] = [];
  let worst = -Infinity;
  const shortlistAdd = (candidate: Candidate): void => {
    if (shortlist.length < SHORTLIST) {
      shortlist.push(candidate);
    } else if (candidate.bigram > worst) {
      let lowest = 0;
      for (let i = 1; i < shortlist.length; i += 1) {
        if (shortlist[i].bigram < shortlist[lowest].bigram) {
          lowest = i;
        }
      }
      shortlist[lowest] = candidate;
    } else {
      return;
    }
    worst = Math.min(...shortlist.map((entry) => entry.bigram));
  };

  words.forEach((word, wordCount) => {
    const alphabet = mixedAlphabet(word);
    const index = inverseAlphabet(alphabet);
    // English log-frequency of the plaintext letter at each alphabet position.
    const positionScore = new Float64Array(ALPHABET_SIZE);
    for (let position = 0; position < ALPHABET_SIZE; position += 1) {
      positionScore[position] = logFreq[alphabet[position]];
    }

    for (let period = shortest; period <= cappedLongest; period += 1) {
      const counts = countsAtPeriod[period];
      const offsets = new Array<number>(period);
      for (let column = 0; column < period; column += 1) {
        let bestOffset = 0;
        let bestScore = -Infinity;
        for (let offset = 0; offset < ALPHABET_SIZE; offset += 1) {
          let score = 0;
          for (let letter = 0; letter < ALPHABET_SIZE; letter += 1) {
            const count = counts[column * ALPHABET_SIZE + letter];
            if (count > 0) {
              score +=
                count *
                positionScore[
                  (index[letter] - offset + ALPHABET_SIZE) % ALPHABET_SIZE
                ];
            }
          }
          if (score > bestScore) {
            bestScore = score;
            bestOffset = offset;
          }
        }
        offsets[column] = bestOffset;
      }

      const plain = cipher.map(
        (value, i) =>
          alphabet[
            (index[value] - offsets[i % period] + ALPHABET_SIZE) % ALPHABET_SIZE
          ],
      );
      shortlistAdd({
        word,
        period,
        offsets,
        bigram: scoreLetterValues(plain),
      });
    }

    if (
      (wordCount + 1) % PROGRESS_EVERY === 0 ||
      wordCount + 1 === words.length
    ) {
      options.onProgress?.(wordCount + 1, words.length);
    }
  });

  const finalists = shortlist.map((candidate) => {
    const alphabet = mixedAlphabet(candidate.word);
    const index = inverseAlphabet(alphabet);
    const plain = cipher.map(
      (value, i) =>
        alphabet[
          (index[value] -
            candidate.offsets[i % candidate.period] +
            ALPHABET_SIZE) %
            ALPHABET_SIZE
        ],
    );
    return { ...candidate, fitness: quadgramFitness(plain, table) };
  });
  const top = Math.max(...finalists.map((finalist) => finalist.fitness));
  finalists.sort((a, b) => {
    const aNearTop = a.fitness >= top - FITNESS_EPSILON;
    const bNearTop = b.fitness >= top - FITNESS_EPSILON;
    if (aNearTop && bNearTop) {
      // Words sharing their unique letters build the same alphabet and tie
      // exactly; the shortest one is the keyword as the author wrote it.
      return (
        a.period - b.period ||
        b.fitness - a.fitness ||
        a.word.length - b.word.length
      );
    }
    if (aNearTop !== bNearTop) {
      return aNearTop ? -1 : 1;
    }
    return b.fitness - a.fitness;
  });
  const winner = finalists[0];

  const alphabet = mixedAlphabet(winner.word);
  const index = inverseAlphabet(alphabet);
  const alphabetText = alphabet
    .map((value) => String.fromCharCode(CODE_A + value))
    .join("");
  const recovered = recoverQuagmireKey(alphabetText, winner.offsets);
  const plaintext = substituteLetters(
    text,
    winner.offsets,
    (letter, offset) =>
      alphabet[(index[letter] - offset + ALPHABET_SIZE) % ALPHABET_SIZE],
  );
  return {
    found: winner.fitness >= READABLE_QUADGRAM,
    keyword: winner.word,
    alphabet: alphabetText,
    period: winner.period,
    offsets: winner.offsets,
    key: recovered.key,
    indicator: recovered.indicator,
    plaintext,
    fitness: winner.fitness,
  };
}
