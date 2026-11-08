// ABOUTME: Bifid cipher: Delastelle's fractionating cipher over a keyword-mixed 5x5 Polybius square.
// ABOUTME: Letters become row/column coordinates, which are mixed within each period and read back as letters.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import type { Mode } from "./cipher";
import { buildSquare, letter, toSquareValues } from "./playfair";

const SQUARE = 5;

/**
 * Encrypts or decrypts the Bifid cipher. Each letter's row and column in the
 * square are written beneath it; within each block of `period` letters the
 * row line is read first, then the column line, and the digits are read in
 * pairs back into letters. A period of 0 treats the whole message as one
 * block. The output is uppercase letters only, with J merged into I.
 */
export function bifid(
  text: string,
  key: string,
  period: number,
  mode: Mode,
): string {
  if (!Number.isInteger(period) || period < 0) {
    throw new Error("period must be a whole number (0 for the whole message)");
  }
  const { square, position } = buildSquare(key);
  const values = toSquareValues(text);
  const block = period === 0 ? values.length : period;
  const output: string[] = [];
  for (let start = 0; start < values.length; start += block) {
    const chunk = values.slice(start, start + block);
    const n = chunk.length;
    const rows = chunk.map((v) => Math.floor(position[v] / SQUARE));
    const columns = chunk.map((v) => position[v] % SQUARE);
    if (mode === "encrypt") {
      const line = [...rows, ...columns];
      for (let i = 0; i < n; i += 1) {
        output.push(letter(square[line[2 * i] * SQUARE + line[2 * i + 1]]));
      }
    } else {
      const line = rows.flatMap((row, i) => [row, columns[i]]);
      for (let i = 0; i < n; i += 1) {
        output.push(letter(square[line[i] * SQUARE + line[n + i]]));
      }
    }
  }
  return output.join("");
}
