// ABOUTME: Loads the quantized English quadgram table over HTTP, cached per page,
// ABOUTME: and scores letter values against it as an average log10 probability.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import {
  QUADGRAM_LOG10_SCALE,
  QUADGRAM_MIN_LOG10,
  QUADGRAM_TABLE_SIZE,
  QUADGRAM_TABLE_URL,
} from "./data/english-quadgrams-meta";

const ALPHABET_SIZE = 26;

/** Average quadgram log10 probability of letter values; English reads above about -4.2. */
export function quadgramFitness(values: number[], table: Uint8Array): number {
  if (values.length < 4) {
    throw new Error("text must contain at least four letters");
  }
  let sum = 0;
  let index = 0;
  for (let i = 0; i < values.length; i += 1) {
    index = (index * ALPHABET_SIZE + values[i]) % QUADGRAM_TABLE_SIZE;
    if (i >= 3) {
      sum += table[index];
    }
  }
  return (
    QUADGRAM_MIN_LOG10 + (sum / (values.length - 3)) * QUADGRAM_LOG10_SCALE
  );
}

let table: Promise<Uint8Array> | null = null;

export function loadQuadgramTable(): Promise<Uint8Array> {
  table ??= fetch(QUADGRAM_TABLE_URL).then(async (response) => {
    if (!response.ok) {
      throw new Error("could not load the English quadgram data");
    }
    return new Uint8Array(await response.arrayBuffer());
  });
  return table;
}
