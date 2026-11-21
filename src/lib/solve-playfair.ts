// ABOUTME: Breaks the Playfair cipher from ciphertext alone by simulated annealing over 5x5 squares.
// ABOUTME: Each square is scored by the English quadgram statistics of its decryption; several long runs start from different squares.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import {
  anneal,
  averageLog10,
  quadgramRaw,
  randomPermutation,
  type AnnealProblem,
} from "./anneal";
import {
  QUADGRAM_LOG10_SCALE,
  QUADGRAM_MIN_LOG10,
} from "./data/english-quadgrams-meta";
import { letter, toSquareValues } from "./playfair";
import type { AnnealRunOptions } from "./solve-fractionation";
import type { SolverRequirements } from "./solver-requirements";

const SIDE = 5;
const CELLS = SIDE * SIDE;

// Text shorter than this must read better to count as English.
const SHORT_TEXT = 125;

/**
 * Average quadgram log10 probability from which a decryption of `letters`
 * letters counts as English; a run that reaches it has found the key and
 * stops. Right squares score between -4.0 and -4.9, by the text. From 125
 * letters every one of 68 texts that reached -4.7 was right
 * (bench/results/playfair.tsv and playfair-short.tsv). On shorter text a
 * wrong square can reach -4.6 to -4.7, and 2 of 20 texts of 100 letters ended
 * on one; at -4.5 none of 24 texts of 100 and 110 letters did.
 */
export function englishFitness(letters: number): number {
  return letters < SHORT_TEXT ? -4.5 : -4.7;
}

// Shorter text is refused: no benchmark covers it, and already at 100 letters
// a wrong square can read nearly as well as the right one.
export const MIN_LETTERS = 100;

/** Runs of a search, each from another random square. */
export const PLAYFAIR_RUNS = 8;

// Steps of a run times letters of text. A step costs time in proportion to
// the text, so every run takes about as long, and a shorter text, which
// needs more steps, gets them.
const LETTER_STEPS = 3e9;

/** Steps of one run on a text of `letters` letters. */
export function playfairIterations(letters: number): number {
  return Math.round(LETTER_STEPS / letters);
}

// Temperature of a run per letter of text, in raw quadgram units. It stays
// the same through the run: in bench/results/playfair-jobs.tsv runs held
// between 0.8 and 1 solve the most texts, cooling to zero from 1 fewer, and
// runs that start at 0.4 or below almost none.
const TEMPERATURE = 1;

// Steps of the cooling pass that follows a run which reached English. The run
// stops at the first square that reads as English, which often still has a
// few letters in the wrong cells; cooling from there to zero ends on the
// square itself.
const COOLING_STEPS = 100000;

// The share of moves that swap two letters of the square. The others move
// whole lines, which no run of single swaps does without passing through
// worse squares: swap two rows or two columns, reverse the square, or mirror
// its rows or its columns.
const SWAP_SHARE = 0.9;

export interface PlayfairCandidate {
  /** The square as 25 letters, row by row; it works as the tool's key. */
  key: string;
  /** The decryption, with the fillers that split doubled letters left in. */
  plaintext: string;
  /** Average quadgram log10 probability of the decryption. */
  fitness: number;
  /** True when the decryption reads as English. */
  english: boolean;
}

export interface PlayfairRunOptions extends AnnealRunOptions {
  /** Average quadgram log10 probability from which a decryption counts as English; by default it depends on the length. */
  englishFitness?: number;
  /** The temperature a run ends at, per letter of text, in raw quadgram units; by default the one it starts at. */
  endTemperatureFactor?: number;
}

export interface BreakPlayfairOptions extends PlayfairRunOptions {
  /** How many runs to make; 8 by default. */
  runs?: number;
}

/** The square with two of its rows (or columns) exchanged. */
function linesSwapped(
  key: number[],
  rng: () => number,
  cellOf: (line: number, along: number) => number,
): number[] {
  const copy = [...key];
  const a = Math.floor(rng() * SIDE);
  let b = Math.floor(rng() * (SIDE - 1));
  if (b >= a) {
    b += 1;
  }
  for (let along = 0; along < SIDE; along += 1) {
    const first = cellOf(a, along);
    const second = cellOf(b, along);
    [copy[first], copy[second]] = [copy[second], copy[first]];
  }
  return copy;
}

/** A slightly changed copy of the square (cell → letter value). */
function neighbour(key: number[], rng: () => number): number[] {
  const move = rng();
  if (move < SWAP_SHARE) {
    const copy = [...key];
    const a = Math.floor(rng() * CELLS);
    let b = Math.floor(rng() * (CELLS - 1));
    if (b >= a) {
      b += 1;
    }
    [copy[a], copy[b]] = [copy[b], copy[a]];
    return copy;
  }
  switch (Math.floor(((move - SWAP_SHARE) / (1 - SWAP_SHARE)) * 5)) {
    case 0:
      return linesSwapped(key, rng, (row, column) => row * SIDE + column);
    case 1:
      return linesSwapped(key, rng, (column, row) => row * SIDE + column);
    case 2:
      return [...key].reverse();
    case 3:
      // Rows mirrored top to bottom.
      return key.map(
        (_, cell) =>
          key[(SIDE - 1 - Math.floor(cell / SIDE)) * SIDE + (cell % SIDE)],
      );
    default:
      // Columns mirrored left to right.
      return key.map(
        (_, cell) =>
          key[Math.floor(cell / SIDE) * SIDE + (SIDE - 1 - (cell % SIDE))],
      );
  }
}

// Letter value (0-25) of each square value (0-24, J left out).
const LETTER_VALUE = Uint8Array.from({ length: CELLS }, (_, value) =>
  value > 8 ? value + 1 : value,
);
// The row and the column one step back, which is how decryption moves.
const BACK = Uint8Array.from({ length: SIDE }, (_, i) => (i + SIDE - 1) % SIDE);

function problemFor(
  cipher: Uint8Array,
  table: Uint8Array,
): AnnealProblem<number[]> & { decryptKey(key: number[]): Uint8Array } {
  const n = cipher.length;
  const out = new Uint8Array(n);
  const letters = new Uint8Array(n);
  const cell = new Uint8Array(CELLS);
  const decryptKey = (key: number[]): Uint8Array => {
    for (let position = 0; position < CELLS; position += 1) {
      cell[key[position]] = position;
    }
    for (let i = 0; i < n; i += 2) {
      const a = cell[cipher[i]];
      const b = cell[cipher[i + 1]];
      const rowA = (a / SIDE) | 0;
      const rowB = (b / SIDE) | 0;
      const columnA = a % SIDE;
      const columnB = b % SIDE;
      if (rowA === rowB) {
        out[i] = key[rowA * SIDE + BACK[columnA]];
        out[i + 1] = key[rowB * SIDE + BACK[columnB]];
      } else if (columnA === columnB) {
        out[i] = key[BACK[rowA] * SIDE + columnA];
        out[i + 1] = key[BACK[rowB] * SIDE + columnB];
      } else {
        out[i] = key[rowA * SIDE + columnB];
        out[i + 1] = key[rowB * SIDE + columnA];
      }
    }
    return out;
  };
  return {
    random: (rng) => randomPermutation(CELLS, rng),
    neighbour,
    score(key) {
      decryptKey(key);
      for (let i = 0; i < n; i += 1) {
        letters[i] = LETTER_VALUE[out[i]];
      }
      return quadgramRaw(letters, n, table);
    },
    decryptKey,
  };
}

/** The ciphertext as square values; throws when it cannot be Playfair or is too short. */
export function playfairValues(text: string): Uint8Array {
  const values = toSquareValues(text);
  if (values.length % 2 !== 0) {
    throw new Error("ciphertext must contain an even number of letters");
  }
  if (values.length < MIN_LETTERS) {
    throw new Error(
      `text must contain at least ${MIN_LETTERS} letters (it has ${values.length})`,
    );
  }
  return Uint8Array.from(values);
}

/**
 * The turn of a square that starts with its keyword. Moving whole rows or
 * whole columns round the square leaves the cipher unchanged, so a search
 * ends on any of the 25 turns of the true square; the one whose letters run
 * on in alphabetical order for longest at the end is the keyword's own.
 */
export function keywordSquare(square: string): string {
  let best = { tail: 0, turned: square };
  for (let down = 0; down < SIDE; down += 1) {
    for (let right = 0; right < SIDE; right += 1) {
      let turned = "";
      for (let cell = 0; cell < CELLS; cell += 1) {
        const row = (Math.floor(cell / SIDE) + down) % SIDE;
        const column = ((cell % SIDE) + right) % SIDE;
        turned += square[row * SIDE + column];
      }
      let tail = 1;
      while (tail < CELLS && turned[CELLS - tail - 1] < turned[CELLS - tail]) {
        tail += 1;
      }
      if (tail > best.tail) {
        best = { tail, turned };
      }
    }
  }
  return best.turned;
}

type Problem = ReturnType<typeof problemFor>;

/**
 * Climbs from a square: exchanges two of its letters whenever that makes the
 * decryption more English, until no exchange does. A run that stops at the
 * first English decryption leaves a few letters in the wrong cells, which
 * this puts right.
 */
function settle(
  problem: Problem,
  start: number[],
): { key: number[]; score: number } {
  const key = [...start];
  let score = problem.score(key);
  let improved = true;
  while (improved) {
    improved = false;
    for (let a = 0; a < CELLS; a += 1) {
      for (let b = a + 1; b < CELLS; b += 1) {
        [key[a], key[b]] = [key[b], key[a]];
        const changed = problem.score(key);
        if (changed > score) {
          score = changed;
          improved = true;
        } else {
          [key[a], key[b]] = [key[b], key[a]];
        }
      }
    }
  }
  return { key, score };
}

/** The square (25 letters, row by row) settled on the ciphertext; see `settle`. */
export function settleSquare(
  text: string,
  square: string,
  table: Uint8Array,
): string {
  const problem = problemFor(playfairValues(text), table);
  return settle(problem, toSquareValues(square)).key.map(letter).join("");
}

/**
 * One annealing run over the squares. A run that reaches English is cooled
 * to zero from the square it found, and the result is settled by a climb.
 */
export function annealPlayfair(
  text: string,
  table: Uint8Array,
  options: PlayfairRunOptions,
): PlayfairCandidate {
  const cipher = playfairValues(text);
  const n = cipher.length;
  const quadgrams = n - 3;
  const target =
    (((options.englishFitness ?? englishFitness(n)) - QUADGRAM_MIN_LOG10) /
      QUADGRAM_LOG10_SCALE) *
    quadgrams;
  const problem = problemFor(cipher, table);
  const temperatureFactor = options.temperatureFactor ?? TEMPERATURE;
  const annealed = anneal(problem, {
    rng: options.rng,
    iterations: options.iterations ?? playfairIterations(n),
    // The raw score is a sum over the text, so the temperature scales with length.
    temperature: n * temperatureFactor,
    endTemperature: n * (options.endTemperatureFactor ?? temperatureFactor),
    target,
    onProgress: options.onProgress,
  });
  let result = settle(problem, annealed.key);
  if (annealed.score >= target) {
    const cooled = anneal(
      { ...problem, random: () => annealed.key },
      {
        rng: options.rng,
        iterations: COOLING_STEPS,
        temperature: n * temperatureFactor,
      },
    );
    const settled = settle(problem, cooled.key);
    if (settled.score > result.score) {
      result = settled;
    }
  }
  // The turn changes which square is shown, not what it decrypts to.
  const plaintext = Array.from(problem.decryptKey(result.key), letter).join("");
  return {
    key: keywordSquare(result.key.map(letter).join("")),
    plaintext,
    fitness: averageLog10(result.score, quadgrams),
    english: result.score >= target,
  };
}

/**
 * Sequential search: makes the runs one after another and stops at the first
 * decryption that reads as English. The page makes the same runs side by side
 * on a worker pool instead.
 */
export function breakPlayfair(
  text: string,
  table: Uint8Array,
  options: BreakPlayfairOptions,
): PlayfairCandidate {
  let best: PlayfairCandidate | null = null;
  for (let run = 0; run < (options.runs ?? PLAYFAIR_RUNS); run += 1) {
    const candidate = annealPlayfair(text, table, options);
    if (best === null || candidate.fitness > best.fitness) {
      best = candidate;
    }
    if (candidate.english) {
      return candidate;
    }
  }
  if (best === null) {
    throw new Error("runs must be at least 1");
  }
  return best;
}

/**
 * What the Playfair breaker needs. The code refuses text under MIN_LETTERS
 * letters. In bench/results/playfair.tsv and playfair-short.tsv it solves all
 * 20 texts of 125 letters, which is the figure stated, and all 48 longer ones
 * up to 300 letters. With the stricter bar for short text, 9 of 12 texts of
 * 110 letters and 8 of 12 of 100 letters come out right and reading as
 * English, and 5 more come out right without reaching the bar. None of 15
 * texts of random letters came out reading as English.
 */
export const PLAYFAIR_REQUIREMENTS: SolverRequirements = {
  id: "playfair",
  ciphers: ["Playfair"],
  assumes: ["digraphic"],
  minLetters: MIN_LETTERS,
  reliableLetters: 125,
  basis: "measured",
};
