// ABOUTME: Word segmentation: puts spaces back into runs of letters, such as a decrypted ATTACKATDAWN.
// ABOUTME: Dynamic programming over word costs from frequency rank (Zipf), with inflections and unknown chunks.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause

/**
 * The keyword list holds words of three letters or more, so the commonest short
 * words are added here, each at its approximate rank in English frequency.
 */
const SHORT_WORDS: ReadonlyArray<[word: string, rank: number]> = [
  ["OF", 2],
  ["TO", 3],
  ["A", 4],
  ["IN", 5],
  ["IS", 8],
  ["IT", 9],
  ["I", 12],
  ["ON", 14],
  ["BE", 15],
  ["AS", 16],
  ["AT", 18],
  ["BY", 20],
  ["HE", 22],
  ["OR", 25],
  ["WE", 30],
  ["AN", 35],
  ["DO", 40],
  ["SO", 42],
  ["IF", 45],
  ["UP", 48],
  ["NO", 50],
  ["MY", 55],
  ["ME", 60],
  ["US", 70],
  ["GO", 80],
  ["AM", 90],
];

/** Endings that turn a listed word into one the list may lack: SHADE to SHADING. */
const INFLECTIONS = ["S", "ES", "ED", "D", "ING", "ER", "ERS", "LY", "EST"];
const INFLECTION_PENALTY = 1.5;

// An unknown chunk costs more per letter than any common word, so known words
// win wherever they fit, but less than a run of single-letter guesses, so a
// name or a misspelling (IQLUSION) stays in one piece.
const UNKNOWN_BASE = 2;
const UNKNOWN_PER_LETTER = 3;
const MAX_UNKNOWN_LENGTH = 24;

/** Runs this short are left alone: they are most likely words already. */
const MIN_RUN_LENGTH = 8;

/** A run is split only when known words cover at least this share of its letters. */
const MIN_KNOWN_FRACTION = 0.75;

export interface WordModel {
  cost: Map<string, number>;
  maxLength: number;
}

/**
 * Builds the segmentation model from words ranked most common first. A word at
 * rank r costs log(r · ln N), the Zipf estimate of its negative log probability.
 */
export function buildWordModel(rankedWords: readonly string[]): WordModel {
  const ranked = rankedWords.map((word) => word.toUpperCase());
  for (const [word, rank] of SHORT_WORDS) {
    if (!ranked.includes(word)) {
      ranked.splice(rank - 1, 0, word);
    }
  }
  const logN = Math.log(ranked.length);
  const cost = new Map<string, number>();
  ranked.forEach((word, index) => {
    if (!cost.has(word)) {
      cost.set(word, Math.log((index + 1) * logN));
    }
  });
  // Inflected forms only fill gaps, so the listed spelling keeps its own cost.
  // Stems shorter than four letters inflect into junk (HAD to HADING).
  // A snapshot: forms added below must not themselves be inflected.
  for (const [word, base] of Array.from(cost)) {
    if (word.length < 4) {
      continue;
    }
    for (const ending of INFLECTIONS) {
      const stem =
        word.endsWith("E") && /^[EI]/.test(ending) ? word.slice(0, -1) : word;
      const form = stem + ending;
      if (!cost.has(form)) {
        cost.set(form, base + INFLECTION_PENALTY);
      }
    }
  }
  let maxLength = 0;
  for (const word of cost.keys()) {
    maxLength = Math.max(maxLength, word.length);
  }
  return { cost, maxLength };
}

export interface Segmentation {
  words: string[];
  /** Share of the letters that fall in known words rather than unknown chunks. */
  knownFraction: number;
}

/** Splits a string of letters (any case) into its most probable words. */
export function segment(letters: string, model: WordModel): Segmentation {
  const upper = letters.toUpperCase();
  const n = upper.length;
  const best = new Float64Array(n + 1).fill(Infinity);
  const from = new Int32Array(n + 1);
  const known = new Uint8Array(n + 1);
  best[0] = 0;
  for (let end = 1; end <= n; end += 1) {
    const longest = Math.max(model.maxLength, MAX_UNKNOWN_LENGTH);
    for (let start = Math.max(0, end - longest); start < end; start += 1) {
      if (best[start] === Infinity) {
        continue;
      }
      const length = end - start;
      const word =
        length <= model.maxLength
          ? model.cost.get(upper.slice(start, end))
          : undefined;
      if (word !== undefined && best[start] + word < best[end]) {
        best[end] = best[start] + word;
        from[end] = start;
        known[end] = 1;
      }
      if (length <= MAX_UNKNOWN_LENGTH) {
        const unknown =
          best[start] + UNKNOWN_BASE + UNKNOWN_PER_LETTER * length;
        if (unknown < best[end]) {
          best[end] = unknown;
          from[end] = start;
          known[end] = 0;
        }
      }
    }
  }
  const words: string[] = [];
  let knownLetters = 0;
  for (let end = n; end > 0; end = from[end]) {
    words.push(letters.slice(from[end], end));
    if (known[end] === 1) {
      knownLetters += end - from[end];
    }
  }
  words.reverse();
  return { words, knownFraction: n === 0 ? 1 : knownLetters / n };
}

/**
 * Inserts spaces into every long run of letters that reads as English words,
 * keeping case, punctuation, and existing spacing. Runs that are a single
 * known word, or that do not segment into mostly known words (ciphertext),
 * are left as they are.
 */
export function splitWords(text: string, model: WordModel): string {
  return text.replace(/[A-Za-z]+/g, (run) => {
    if (run.length < MIN_RUN_LENGTH || model.cost.has(run.toUpperCase())) {
      return run;
    }
    const { words, knownFraction } = segment(run, model);
    return knownFraction >= MIN_KNOWN_FRACTION ? words.join(" ") : run;
  });
}
