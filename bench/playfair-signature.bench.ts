// ABOUTME: Benchmark of the Playfair signature (even length, no J, no pair of equal letters) on ciphertexts of other ciphers.
// ABOUTME: The share of other texts that pass says how often the auto-solver would try the Playfair search for nothing.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { randomPermutation, seededRng } from "../src/lib/anneal";
import { bifid } from "../src/lib/bifid";
import { substitution, vigenere } from "../src/lib/cipher";
import { analyze } from "../src/lib/diagnostics";
import { playfair } from "../src/lib/playfair";
import { couldBePlayfair } from "../src/lib/solve-playfair";
import {
  englishFitness,
  ownTrials,
  plaintextSlice,
  randomKey,
  randomLetters,
  record,
  shuffledLetters,
} from "./trials";

const KINDS = [
  "playfair",
  "vigenere",
  "substitution",
  "bifid",
  "transposition",
  "random",
] as const;

interface Trial {
  kind: (typeof KINDS)[number];
  letters: number;
  repeat: number;
}

const trials: Trial[] = [];
for (const kind of KINDS) {
  for (const letters of [100, 150, 200, 300, 400]) {
    for (let repeat = 0; repeat < 200; repeat += 1) {
      trials.push({ kind, letters, repeat });
    }
  }
}

it("playfair signature on other ciphers", () => {
  for (const { kind, letters, repeat } of ownTrials(trials)) {
    const rng = seededRng(
      KINDS.indexOf(kind) * 10000000 + letters * 1000 + repeat,
    );
    // Every text has an even number of letters: an odd one never passes.
    const plain = plaintextSlice(letters, rng);
    let ciphertext: string;
    let padded = "";
    if (kind === "playfair") {
      const key = randomKey(10, rng);
      ciphertext = playfair(plain, key, "encrypt");
      // The plaintext as the true key gives it back, fillers and all.
      padded = playfair(ciphertext, key, "decrypt");
    } else if (kind === "vigenere") {
      ciphertext = vigenere(plain, randomKey(7, rng), "encrypt");
    } else if (kind === "substitution") {
      const alphabet = randomPermutation(26, rng)
        .map((value) => String.fromCharCode(65 + value))
        .join("");
      ciphertext = substitution(plain, alphabet, "encrypt");
    } else if (kind === "bifid") {
      ciphertext = bifid(plain, randomKey(10, rng), 7, "encrypt");
    } else if (kind === "transposition") {
      // The letters of the plaintext in another order.
      ciphertext = shuffledLetters(plain, rng);
    } else {
      ciphertext = randomLetters(letters, rng);
    }
    const diagnostics = analyze(ciphertext);
    const fitness = padded === "" ? null : englishFitness(padded);
    record("playfair-signature", {
      kind,
      letters,
      repeat,
      signature: couldBePlayfair(ciphertext) ? 1 : 0,
      period: diagnostics.period,
      family: diagnostics.likelyFamily,
      // How English the true Playfair plaintext reads with its fillers.
      bigram: fitness === null ? "" : fitness.bigram.toFixed(2),
      quadgram: fitness === null ? "" : fitness.quadgram.toFixed(2),
    });
  }
});
