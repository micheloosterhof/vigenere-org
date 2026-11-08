// ABOUTME: Trifid cipher: Delastelle's three-dimensional fractionating cipher over a 27-symbol 3x3x3 cube.
// ABOUTME: The alphabet is A-Z plus "+"; layer/row/column digits are mixed within each period of letters.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import type { Mode } from "./cipher";

/** The 27th symbol that fills the cube. */
export const TRIFID_EXTRA = "+";
const SYMBOLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ" + TRIFID_EXTRA;

/** Keyword symbols first (duplicates dropped), then the rest of A-Z and "+". */
function cubeAlphabet(key: string): string[] {
  const seen = new Set<string>();
  for (const char of key.toUpperCase()) {
    if (SYMBOLS.includes(char)) {
      seen.add(char);
    }
  }
  if (seen.size === 0) {
    throw new Error("key must contain at least one letter");
  }
  for (const char of SYMBOLS) {
    seen.add(char);
  }
  return [...seen];
}

/**
 * Encrypts or decrypts the Trifid cipher. Each symbol's layer, row, and column
 * in the cube (digits 0-2) are written beneath it; within each block of
 * `period` symbols the three lines are read in turn, and the digits are read
 * in triples back into symbols. A period of 0 treats the whole message as one
 * block. The output is uppercase letters and "+"; everything else is dropped.
 */
export function trifid(
  text: string,
  key: string,
  period: number,
  mode: Mode,
): string {
  if (!Number.isInteger(period) || period < 0) {
    throw new Error("period must be a whole number (0 for the whole message)");
  }
  const alphabet = cubeAlphabet(key);
  const index = new Map(alphabet.map((char, i) => [char, i]));
  const values: number[] = [];
  for (const char of text.toUpperCase()) {
    const value = index.get(char);
    if (value !== undefined) {
      values.push(value);
    }
  }
  const block = period === 0 ? values.length : period;
  const output: string[] = [];
  for (let start = 0; start < values.length; start += block) {
    const chunk = values.slice(start, start + block);
    const n = chunk.length;
    const layers = chunk.map((v) => Math.floor(v / 9));
    const rows = chunk.map((v) => Math.floor(v / 3) % 3);
    const columns = chunk.map((v) => v % 3);
    if (mode === "encrypt") {
      const line = [...layers, ...rows, ...columns];
      for (let i = 0; i < n; i += 1) {
        output.push(
          alphabet[line[3 * i] * 9 + line[3 * i + 1] * 3 + line[3 * i + 2]],
        );
      }
    } else {
      const line = layers.flatMap((layer, i) => [layer, rows[i], columns[i]]);
      for (let i = 0; i < n; i += 1) {
        output.push(alphabet[line[i] * 9 + line[n + i] * 3 + line[2 * n + i]]);
      }
    }
  }
  return output.join("");
}
