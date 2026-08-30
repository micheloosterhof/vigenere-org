// ABOUTME: Playfair cipher: digraph substitution over a keyword-mixed 5x5 square with I and J merged.
// ABOUTME: Encryption strips the text to letters, splits doubles with a filler, and pads odd length.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { normalizeKey, type Mode } from "./cipher";

const SQUARE = 5;
const CODE_A = 65;
const J = 9;
const Q = 16;
const X = 23;

/** Maps a 0-25 letter value into the 25-letter square alphabet (J becomes I). */
function condense(value: number): number {
  const merged = value === J ? value - 1 : value;
  return merged > J ? merged - 1 : merged;
}

/** The keyword-mixed 5x5 square as letter values, plus each letter's position in it. */
function buildSquare(key: string): { square: number[]; position: number[] } {
  const seen = new Set<number>();
  for (const value of normalizeKey(key)) {
    seen.add(condense(value));
  }
  for (let value = 0; value < SQUARE * SQUARE; value += 1) {
    seen.add(value);
  }
  const square = [...seen];
  const position = new Array<number>(SQUARE * SQUARE);
  square.forEach((value, index) => {
    position[value] = index;
  });
  return { square, position };
}

/** Letters of the text as square-alphabet values, uppercased, J merged into I. */
function toSquareValues(text: string): number[] {
  const values: number[] = [];
  for (const char of text.toUpperCase()) {
    const code = char.charCodeAt(0) - CODE_A;
    if (code >= 0 && code < 26) {
      values.push(condense(code));
    }
  }
  return values;
}

/** X separates doubled letters and pads the end; Q steps in when the letter is X itself. */
function filler(value: number): number {
  return value === condense(X) ? condense(Q) : condense(X);
}

/**
 * Encrypts or decrypts the Playfair cipher. The output is the processed letter
 * stream in uppercase: encryption drops non-letters, merges J into I, splits
 * doubled letters with a filler, and pads an odd-length message; decryption
 * requires an even number of letters and leaves the fillers in place.
 */
export function playfair(text: string, key: string, mode: Mode): string {
  const { square, position } = buildSquare(key);
  const values = toSquareValues(text);

  const pairs: [number, number][] = [];
  if (mode === "encrypt") {
    for (let i = 0; i < values.length;) {
      const first = values[i];
      if (i + 1 >= values.length || values[i + 1] === first) {
        pairs.push([first, filler(first)]);
        i += 1;
      } else {
        pairs.push([first, values[i + 1]]);
        i += 2;
      }
    }
  } else {
    if (values.length % 2 !== 0) {
      throw new Error("ciphertext must contain an even number of letters");
    }
    for (let i = 0; i < values.length; i += 2) {
      pairs.push([values[i], values[i + 1]]);
    }
  }

  const shift = mode === "encrypt" ? 1 : SQUARE - 1;
  return pairs
    .map(([first, second]) => {
      const a = position[first];
      const b = position[second];
      const rowA = Math.floor(a / SQUARE);
      const rowB = Math.floor(b / SQUARE);
      const colA = a % SQUARE;
      const colB = b % SQUARE;
      let outA: number;
      let outB: number;
      if (rowA === rowB) {
        outA = rowA * SQUARE + ((colA + shift) % SQUARE);
        outB = rowB * SQUARE + ((colB + shift) % SQUARE);
      } else if (colA === colB) {
        outA = ((rowA + shift) % SQUARE) * SQUARE + colA;
        outB = ((rowB + shift) % SQUARE) * SQUARE + colB;
      } else {
        outA = rowA * SQUARE + colB;
        outB = rowB * SQUARE + colA;
      }
      return letter(square[outA]) + letter(square[outB]);
    })
    .join("");
}

/** The square-alphabet value as an uppercase letter (I and beyond skip J). */
function letter(value: number): string {
  return String.fromCharCode(CODE_A + (value > J - 1 ? value + 1 : value));
}
