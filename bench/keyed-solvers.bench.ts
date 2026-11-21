// ABOUTME: Benchmark of the repeating-key and autokey solvers over key length and letters per key letter.
// ABOUTME: Each cell gets true ciphertexts and random letters, to see how English a wrong answer reads.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { seededRng } from "../src/lib/anneal";
import { autokey, beaufort, porta, vigenere } from "../src/lib/cipher";
import {
  beaufortDecrypt,
  breakPeriodic,
  breakPorta,
  vigenereDecrypt,
} from "../src/lib/solve";
import {
  breakCiphertextAutokey,
  breakPlaintextAutokey,
} from "../src/lib/solve-autokey";
import {
  accuracy,
  englishFitness,
  ownTrials,
  plaintextSlice,
  randomKey,
  randomLetters,
  record,
  TABLE,
} from "./trials";

interface Solver {
  name: string;
  encrypt(plain: string, key: string): string;
  solve(ciphertext: string, rng: () => number): string;
}

const options = { quadgrams: TABLE };

const solvers: Solver[] = [
  {
    name: "vigenere",
    encrypt: (plain, key) => vigenere(plain, key, "encrypt"),
    solve: (text) =>
      vigenere(
        text,
        breakPeriodic(text, vigenereDecrypt, options)[0].key,
        "decrypt",
      ),
  },
  {
    name: "beaufort",
    encrypt: (plain, key) => beaufort(plain, key),
    solve: (text) =>
      beaufort(text, breakPeriodic(text, beaufortDecrypt, options)[0].key),
  },
  {
    name: "porta",
    encrypt: (plain, key) => porta(plain, key),
    solve: (text) => porta(text, breakPorta(text, options)[0].key),
  },
  {
    name: "ciphertext-autokey",
    encrypt: (plain, key) =>
      autokey(plain, key, "ciphertext", "vigenere", "encrypt"),
    solve: (text) => breakCiphertextAutokey(text, TABLE).plaintext,
  },
  {
    name: "plaintext-autokey",
    encrypt: (plain, key) =>
      autokey(plain, key, "plaintext", "vigenere", "encrypt"),
    solve: (text, rng) => breakPlaintextAutokey(text, TABLE, { rng }).plaintext,
  },
];

interface Trial {
  solver: Solver;
  keyLength: number;
  perKeyLetter: number;
  repeat: number;
}

const trials: Trial[] = [];
for (const solver of solvers) {
  for (const keyLength of [3, 6, 10, 15]) {
    for (const perKeyLetter of [3, 4, 6, 8, 12, 20]) {
      for (let repeat = 0; repeat < 10; repeat += 1) {
        trials.push({ solver, keyLength, perKeyLetter, repeat });
      }
    }
  }
}

it("keyed solvers by key length and letters per key letter", () => {
  for (const trial of ownTrials(trials)) {
    const { solver, keyLength, perKeyLetter, repeat } = trial;
    const letters = keyLength * perKeyLetter;
    // The autokey attacks refuse text under an alphabet's worth of letters.
    if (solver.name.endsWith("autokey") && letters < 26) {
      continue;
    }
    const rng = seededRng(
      solvers.indexOf(solver) * 1000000 +
        keyLength * 10000 +
        perKeyLetter * 100 +
        repeat,
    );
    const plain = plaintextSlice(letters, rng);
    // Half the trials hold a real ciphertext, half random letters.
    const real = repeat < 5;
    const ciphertext = real
      ? solver.encrypt(plain, randomKey(keyLength, rng))
      : randomLetters(letters, rng);
    const start = performance.now();
    const recovered = solver.solve(ciphertext, rng);
    const { bigram, quadgram } = englishFitness(recovered);
    record("keyed-solvers", {
      solver: solver.name,
      keyLength,
      perKeyLetter,
      letters,
      kind: real ? "true" : "nothing",
      accuracy: real ? accuracy(recovered, plain).toFixed(2) : "",
      bigram: bigram.toFixed(2),
      quadgram: quadgram.toFixed(2),
      seconds: ((performance.now() - start) / 1000).toFixed(2),
    });
  }
});
