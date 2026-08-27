// ABOUTME: Pure cipher core implementing Vigenere, Beaufort, and Caesar on A-Z.
// ABOUTME: Letters keep their case, non-letters pass through and do not advance the key.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause

const ALPHABET_SIZE = 26;
const CODE_A = 65;

export type Mode = "encrypt" | "decrypt";

/** Strips non-letters from a key and returns its letters as 0-25 values. */
export function normalizeKey(key: string): number[] {
  const letters = key.toUpperCase().replace(/[^A-Z]/g, "");
  if (letters.length === 0) {
    throw new Error("key must contain at least one letter");
  }
  return [...letters].map((c) => c.charCodeAt(0) - CODE_A);
}

/**
 * Applies a polyalphabetic substitution to text. For each letter, `substitute`
 * receives the letter and the current key value (both 0-25) and returns the
 * output letter value. Non-letters pass through and do not advance the key.
 */
export function substituteLetters(
  text: string,
  key: number[],
  substitute: (letter: number, keyValue: number) => number,
): string {
  let keyIndex = 0;
  return [...text]
    .map((char) => {
      const upper = char.toUpperCase();
      if (upper < "A" || upper > "Z") {
        return char;
      }
      const keyValue = key[keyIndex % key.length];
      keyIndex += 1;
      const letter = upper.charCodeAt(0) - CODE_A;
      const result =
        ((substitute(letter, keyValue) % ALPHABET_SIZE) + ALPHABET_SIZE) %
        ALPHABET_SIZE;
      const output = String.fromCharCode(CODE_A + result);
      return char === upper ? output : output.toLowerCase();
    })
    .join("");
}

/** Keyword letters first (duplicates dropped), then the rest of the alphabet in order. */
export function mixedAlphabet(keyword: string): number[] {
  const seen = new Set<number>(normalizeKey(keyword));
  const rest = Array.from({ length: ALPHABET_SIZE }, (_, i) => i).filter(
    (value) => !seen.has(value),
  );
  return [...seen, ...rest];
}

/** Maps each letter value to its position in the alphabet. */
export function inverseAlphabet(alphabet: number[]): number[] {
  const result = new Array<number>(ALPHABET_SIZE);
  alphabet.forEach((value, position) => {
    result[value] = position;
  });
  return result;
}

/** Simple substitution: one keyword-mixed alphabet replaces the standard one. */
export function substitution(text: string, key: string, mode: Mode): string {
  const mixed = mixedAlphabet(key);
  const table = mode === "encrypt" ? mixed : inverseAlphabet(mixed);
  return substituteLetters(text, [0], (letter) => table[letter]);
}

/** Vigenere cipher: shifts each letter by the corresponding key letter. */
export function vigenere(text: string, key: string, mode: Mode): string {
  const sign = mode === "encrypt" ? 1 : -1;
  return substituteLetters(
    text,
    normalizeKey(key),
    (letter, keyValue) => letter + sign * keyValue,
  );
}

/** Beaufort cipher: maps each letter to key minus letter. Reciprocal, so it has no mode. */
export function beaufort(text: string, key: string): string {
  return substituteLetters(
    text,
    normalizeKey(key),
    (letter, keyValue) => keyValue - letter,
  );
}

/** Caesar cipher: shifts every letter by a fixed amount; negative shifts decrypt. */
export function caesar(text: string, shift: number): string {
  return substituteLetters(
    text,
    [((shift % ALPHABET_SIZE) + ALPHABET_SIZE) % ALPHABET_SIZE],
    (letter, keyValue) => letter + keyValue,
  );
}
