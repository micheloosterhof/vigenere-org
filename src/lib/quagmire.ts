// ABOUTME: The four Quagmire ciphers: periodic substitution over keyword-mixed alphabets.
// ABOUTME: One formula covers all variants; they differ only in which alphabets are keyed.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import {
  inverseAlphabet,
  mixedAlphabet,
  normalizeKey,
  substituteLetters,
  type Mode,
} from "./cipher";

const ALPHABET_SIZE = 26;

export type QuagmireVariant = 1 | 2 | 3 | 4;

export interface QuagmireConfig {
  variant: QuagmireVariant;
  /** Alphabet keyword: keys the plaintext alphabet (variants 1, 3, 4) or the ciphertext alphabet (variant 2). */
  keyword: string;
  /** Ciphertext alphabet keyword, variant 4 only. */
  keyword2?: string;
  /** Period key cycled over the text, as in Vigenere. */
  key: string;
  /** Plaintext alphabet letter the key letters are written under. */
  indicator: string;
}

const STRAIGHT = Array.from({ length: ALPHABET_SIZE }, (_, i) => i);

function alphabets(config: QuagmireConfig): {
  plain: number[];
  cipher: number[];
} {
  switch (config.variant) {
    case 1:
      return { plain: mixedAlphabet(config.keyword), cipher: STRAIGHT };
    case 2:
      return { plain: STRAIGHT, cipher: mixedAlphabet(config.keyword) };
    case 3: {
      const mixed = mixedAlphabet(config.keyword);
      return { plain: mixed, cipher: mixed };
    }
    case 4: {
      if (!config.keyword2) {
        throw new Error("variant 4 needs a second alphabet keyword");
      }
      return {
        plain: mixedAlphabet(config.keyword),
        cipher: mixedAlphabet(config.keyword2),
      };
    }
  }
}

/**
 * Encrypts or decrypts with a Quagmire cipher. The ciphertext alphabet slides
 * under the plaintext alphabet so each key letter aligns with the indicator.
 */
export function quagmire(
  text: string,
  config: QuagmireConfig,
  mode: Mode,
): string {
  const key = normalizeKey(config.key);
  const indicator = normalizeKey(config.indicator);
  if (indicator.length !== 1) {
    throw new Error("indicator must be a single letter");
  }
  const { plain, cipher } = alphabets(config);
  const plainInverse = inverseAlphabet(plain);
  const cipherInverse = inverseAlphabet(cipher);
  const indicatorIndex = plainInverse[indicator[0]];

  const substitute =
    mode === "encrypt"
      ? (letter: number, keyValue: number): number =>
          cipher[
            (plainInverse[letter] -
              indicatorIndex +
              cipherInverse[keyValue] +
              ALPHABET_SIZE) %
              ALPHABET_SIZE
          ]
      : (letter: number, keyValue: number): number =>
          plain[
            (cipherInverse[letter] -
              cipherInverse[keyValue] +
              indicatorIndex +
              ALPHABET_SIZE) %
              ALPHABET_SIZE
          ];
  return substituteLetters(text, key, substitute);
}
