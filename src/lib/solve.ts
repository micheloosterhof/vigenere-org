// ABOUTME: Breaks periodic polyalphabetic ciphers (Vigenere, Beaufort, Gronsfeld, Porta, Caesar) without the key.
// ABOUTME: Greedy adjacent-key-pair search with English bigram scoring over all key lengths; the best key is polished with quadgrams.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { ENGLISH_BIGRAM_LOGPROBS } from "./data/english-bigrams";
import { portaLetter } from "./cipher";
import { quadgramFitness } from "./quadgrams";

const ALPHABET_SIZE = 26;
const CODE_A = 65;
const BIGRAM_LOGPROBS = Float64Array.from(ENGLISH_BIGRAM_LOGPROBS);

// Candidates whose fitness is this close to the best are ranked by key length
// instead, so the true period beats its multiples, which score marginally
// higher by overfitting.
const FITNESS_EPSILON = 0.05;

// A text whose average bigram log10 probability reaches this reads as English;
// correct decryptions land near -2.4, wrong ones below -2.6.
export const READABLE_BIGRAM = -2.55;

/** Maps a ciphertext letter and a key letter (both 0-25) to a plaintext letter. */
export type Decrypt = (cipher: number, key: number) => number;

export const vigenereDecrypt: Decrypt = (cipher, key) =>
  (cipher - key + ALPHABET_SIZE) % ALPHABET_SIZE;

export const beaufortDecrypt: Decrypt = (cipher, key) =>
  (key - cipher + ALPHABET_SIZE) % ALPHABET_SIZE;

export const portaDecrypt: Decrypt = portaLetter;

export interface KeyCandidate {
  key: string;
  keyLength: number;
  /** Average bigram log10 probability of the decrypted text; higher is more English-like. */
  fitness: number;
}

export interface ShiftCandidate {
  shift: number;
  fitness: number;
}

/** Uppercases the text and returns its letters as 0-25 values, dropping everything else. */
export function toLetterValues(text: string): number[] {
  const values: number[] = [];
  for (const char of text.toUpperCase()) {
    const code = char.charCodeAt(0) - CODE_A;
    if (code >= 0 && code < ALPHABET_SIZE) {
      values.push(code);
    }
  }
  return values;
}

function averageBigramLogProb(values: number[]): number {
  let sum = 0;
  for (let i = 0; i + 1 < values.length; i += 1) {
    sum += BIGRAM_LOGPROBS[values[i] * ALPHABET_SIZE + values[i + 1]];
  }
  return sum / (values.length - 1);
}

/** Average bigram log10 probability of the text's letters; higher is more English-like. */
export function scoreText(text: string): number {
  return scoreLetterValues(toLetterValues(text));
}

/** Average bigram log10 probability of letter values; higher is more English-like. */
export function scoreLetterValues(values: number[]): number {
  if (values.length < 2) {
    throw new Error("text must contain at least two letters");
  }
  return averageBigramLogProb(values);
}

interface KeyPair {
  first: number;
  second: number;
  fitness: number;
}

/**
 * Finds the best key letters for adjacent columns (column, column+1 mod keyLength)
 * by trying every pair of key values against the bigrams they decrypt.
 */
function bestPairForColumn(
  ciphertext: number[],
  decrypt: Decrypt,
  keyLength: number,
  column: number,
  keySpace: number,
): KeyPair {
  const best: KeyPair = { first: 0, second: 0, fitness: -Infinity };
  for (let first = 0; first < keySpace; first += 1) {
    for (let second = 0; second < keySpace; second += 1) {
      let sum = 0;
      let count = 0;
      for (let i = column; i + 1 < ciphertext.length; i += keyLength) {
        const p1 = decrypt(ciphertext[i], first);
        const p2 = decrypt(ciphertext[i + 1], second);
        sum += BIGRAM_LOGPROBS[p1 * ALPHABET_SIZE + p2];
        count += 1;
      }
      const fitness = count > 0 ? sum / count : -Infinity;
      if (fitness > best.fitness) {
        best.first = first;
        best.second = second;
        best.fitness = fitness;
      }
    }
  }
  return best;
}

function bestKeyForLength(
  ciphertext: number[],
  decrypt: Decrypt,
  keyLength: number,
  keySpace: number,
): { key: number[]; fitness: number } {
  let key: number[];
  if (keyLength === 1) {
    let bestKey = 0;
    let bestFitness = -Infinity;
    for (let k = 0; k < keySpace; k += 1) {
      const fitness = averageBigramLogProb(
        ciphertext.map((c) => decrypt(c, k)),
      );
      if (fitness > bestFitness) {
        bestKey = k;
        bestFitness = fitness;
      }
    }
    key = [bestKey];
  } else {
    const pairs = Array.from({ length: keyLength }, (_, column) =>
      bestPairForColumn(ciphertext, decrypt, keyLength, column, keySpace),
    );
    // Each key position is voted on twice: as the first letter of its own
    // column's best pair and as the second letter of the preceding column's.
    // The pair with the higher fitness wins.
    key = pairs.map((pair, column) => {
      const preceding = pairs[(column - 1 + keyLength) % keyLength];
      return pair.fitness >= preceding.fitness ? pair.first : preceding.second;
    });
  }
  const plaintext = decryptWithKey(ciphertext, decrypt, key);
  return { key, fitness: averageBigramLogProb(plaintext) };
}

function decryptWithKey(
  ciphertext: number[],
  decrypt: Decrypt,
  key: number[],
): number[] {
  return ciphertext.map((c, i) => decrypt(c, key[i % key.length]));
}

/**
 * Coordinate descent on the key: each position in turn takes the letter that
 * gives the whole decryption the best quadgram fitness, until a full pass
 * changes nothing. The bigram vote that picks the key sees only a few letters
 * per column on short text and can misjudge one of them; quadgrams see the
 * words those letters land in.
 */
function refineKey(
  ciphertext: number[],
  decrypt: Decrypt,
  key: number[],
  table: Uint8Array,
  keySpace: number,
): number[] {
  const refined = [...key];
  const score = (): number =>
    quadgramFitness(decryptWithKey(ciphertext, decrypt, refined), table);
  let best = score();
  let improved = true;
  while (improved) {
    improved = false;
    for (let position = 0; position < refined.length; position += 1) {
      let bestLetter = refined[position];
      for (let letter = 0; letter < keySpace; letter += 1) {
        refined[position] = letter;
        const fitness = score();
        if (fitness > best) {
          best = fitness;
          bestLetter = letter;
          improved = true;
        }
      }
      refined[position] = bestLetter;
    }
  }
  return refined;
}

function keyString(key: number[]): string {
  return key.map((k) => String.fromCharCode(CODE_A + k)).join("");
}

export interface BreakOptions {
  maxKeyLength?: number;
  /** Quantized English quadgram table; when given, the best key is polished letter by letter against it. */
  quadgrams?: Uint8Array;
  /** Key values tried per position, from 0 (A); 10 limits a Gronsfeld key to A-J, its digits 0-9. */
  keySpace?: number;
}

/**
 * Breaks a periodic cipher by trying every key length up to maxKeyLength and
 * returning candidates ranked best first. Needs roughly four times as much
 * text as the key is long.
 */
export function breakPeriodic(
  text: string,
  decrypt: Decrypt,
  options: BreakOptions = {},
): KeyCandidate[] {
  const { maxKeyLength = 30, quadgrams, keySpace = ALPHABET_SIZE } = options;
  const ciphertext = toLetterValues(text);
  if (ciphertext.length < 4) {
    throw new Error("text must contain at least four letters");
  }
  const longest = Math.max(
    1,
    Math.min(maxKeyLength, Math.floor(ciphertext.length / 4)),
  );
  const candidates: KeyCandidate[] = [];
  for (let keyLength = 1; keyLength <= longest; keyLength += 1) {
    const { key, fitness } = bestKeyForLength(
      ciphertext,
      decrypt,
      keyLength,
      keySpace,
    );
    candidates.push({ key: keyString(key), keyLength, fitness });
  }
  const top = Math.max(...candidates.map((c) => c.fitness));
  const ranked = candidates.sort((a, b) => {
    const aNearTop = a.fitness >= top - FITNESS_EPSILON;
    const bNearTop = b.fitness >= top - FITNESS_EPSILON;
    if (aNearTop && bNearTop) {
      return a.keyLength - b.keyLength;
    }
    if (aNearTop !== bNearTop) {
      return aNearTop ? -1 : 1;
    }
    return b.fitness - a.fitness;
  });
  if (quadgrams !== undefined) {
    const best = ranked[0];
    const key = refineKey(
      ciphertext,
      decrypt,
      toLetterValues(best.key),
      quadgrams,
      keySpace,
    );
    best.key = keyString(key);
    best.fitness = averageBigramLogProb(
      decryptWithKey(ciphertext, decrypt, key),
    );
  }
  return ranked;
}

// Porta's reciprocal alphabets let a long key fit noise more readily than
// Vigenère's shifts, so its key length is capped at one per eight letters
// rather than four.
const PORTA_LETTERS_PER_KEY = 8;

/**
 * Breaks a Porta cipher. Paired key letters (AB, CD, ...) are
 * indistinguishable, so the key names the first letter of each pair.
 */
export function breakPorta(
  text: string,
  options: BreakOptions = {},
): KeyCandidate[] {
  const letters = toLetterValues(text).length;
  return breakPeriodic(text, portaDecrypt, {
    ...options,
    maxKeyLength: Math.min(
      options.maxKeyLength ?? 30,
      Math.max(1, Math.floor(letters / PORTA_LETTERS_PER_KEY)),
    ),
  });
}

/** Ranks all 26 Caesar shifts by how English-like the decrypted text is. */
export function caesarCandidates(text: string): ShiftCandidate[] {
  const ciphertext = toLetterValues(text);
  if (ciphertext.length < 2) {
    throw new Error("text must contain at least two letters");
  }
  const candidates: ShiftCandidate[] = [];
  for (let shift = 0; shift < ALPHABET_SIZE; shift += 1) {
    const plaintext = ciphertext.map((c) => vigenereDecrypt(c, shift));
    candidates.push({ shift, fitness: averageBigramLogProb(plaintext) });
  }
  return candidates.sort((a, b) => b.fitness - a.fitness);
}
