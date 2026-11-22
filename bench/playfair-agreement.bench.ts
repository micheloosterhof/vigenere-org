// ABOUTME: Benchmark of how often separate Playfair runs end on the same decryption, on short texts and on texts with nothing to find.
// ABOUTME: Tells whether two runs that agree are a sign of the right square where the score alone cannot tell.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { seededRng } from "../src/lib/anneal";
import { bifid } from "../src/lib/bifid";
import { playfair } from "../src/lib/playfair";
import {
  annealPlayfair,
  couldBePlayfair,
  englishFitness as englishBar,
  PLAYFAIR_RUNS,
} from "../src/lib/solve-playfair";
import {
  englishFitness,
  ownTrials,
  plaintextSlice,
  randomKey,
  record,
  sameSymbols,
  TABLE,
} from "./trials";

// "hard": a Playfair text whose true plaintext, fillers and all, scores under
// the bar for English, so no run can stop on it. "easy": one that scores
// over it. "noise": random pairs of different letters. "bifid": a Bifid
// ciphertext that happens to have the marks of a Playfair.
const KINDS = ["hard", "easy", "noise", "bifid"] as const;
type Kind = (typeof KINDS)[number];

const TEXTS: Record<Kind, number> = { hard: 6, easy: 3, noise: 4, bifid: 3 };

interface Trial {
  kind: Kind;
  letters: number;
  repeat: number;
}

const trials: Trial[] = [];
for (const kind of KINDS) {
  // A Bifid ciphertext is as long as its plaintext, so only an even length
  // can have the marks; at 150 letters one with the marks is too rare to
  // wait for.
  for (const letters of kind === "bifid" ? [100, 110] : [100, 110, 125, 150]) {
    for (let repeat = 0; repeat < TEXTS[kind]; repeat += 1) {
      trials.push({ kind, letters, repeat });
    }
  }
}

const SQUARE_LETTERS = "ABCDEFGHIKLMNOPQRSTUVWXYZ";

/** The repeat-th text of its kind: texts are drawn until enough of the kind have come up. */
function textFor(
  kind: Kind,
  letters: number,
  repeat: number,
  rng: () => number,
): { ciphertext: string; padded: string } {
  let seen = 0;
  for (;;) {
    let ciphertext: string;
    let padded = "";
    let fits: boolean;
    if (kind === "noise") {
      ciphertext = "";
      while (ciphertext.length < letters) {
        const a = SQUARE_LETTERS[Math.floor(rng() * 25)];
        const b = SQUARE_LETTERS[Math.floor(rng() * 25)];
        if (a !== b) {
          ciphertext += a + b;
        }
      }
      fits = true;
    } else if (kind === "bifid") {
      const plain = plaintextSlice(letters, rng).replace(/J/g, "I");
      ciphertext = bifid(plain, randomKey(10, rng), 7, "encrypt");
      fits = couldBePlayfair(ciphertext);
    } else {
      const plain = plaintextSlice(letters, rng);
      const key = randomKey(10, rng);
      ciphertext = playfair(plain, key, "encrypt");
      // The plaintext as the true key gives it back, fillers and all.
      padded = playfair(ciphertext, key, "decrypt");
      const over =
        englishFitness(padded).quadgram >= englishBar(ciphertext.length);
      fits = kind === "easy" ? over : !over;
    }
    if (fits) {
      if (seen === repeat) {
        return { ciphertext, padded };
      }
      seen += 1;
    }
  }
}

it("agreement between playfair runs", () => {
  for (const { kind, letters, repeat } of ownTrials(trials)) {
    const rng = seededRng(
      11 * 1000000 + KINDS.indexOf(kind) * 100000 + letters * 100,
    );
    const { ciphertext, padded } = textFor(kind, letters, repeat, rng);
    const jobRng = seededRng(
      12 * 1000000 + KINDS.indexOf(kind) * 100000 + letters * 100 + repeat,
    );
    for (let job = 0; job < PLAYFAIR_RUNS; job += 1) {
      const start = performance.now();
      const result = annealPlayfair(ciphertext, TABLE, {
        rng: seededRng(Math.floor(jobRng() * 2 ** 31)),
      });
      record("playfair-agreement", {
        kind,
        letters,
        repeat,
        job,
        ciphertextLetters: ciphertext.length,
        trueFitness:
          padded === "" ? "" : englishFitness(padded).quadgram.toFixed(2),
        english: result.english ? 1 : 0,
        accuracy:
          padded === "" ? "" : sameSymbols(result.plaintext, padded).toFixed(2),
        fitness: result.fitness.toFixed(2),
        seconds: ((performance.now() - start) / 1000).toFixed(1),
        plaintext: result.plaintext,
      });
    }
  }
});
