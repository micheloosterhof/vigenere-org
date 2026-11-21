// ABOUTME: Benchmark of the keyless-search solvers: Caesar, affine, substitution, rail fence, columnar and route.
// ABOUTME: Each text length gets true ciphertexts and texts with nothing to find, to see how English a wrong answer reads.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { AFFINE_MULTIPLIERS, affine, breakAffine } from "../src/lib/affine";
import { randomPermutation, seededRng } from "../src/lib/anneal";
import { caesar, substitution } from "../src/lib/cipher";
import { breakRailFence, railFence } from "../src/lib/railfence";
import { ROUTES, breakRoute, routeCipher, type Route } from "../src/lib/route";
import { caesarCandidates } from "../src/lib/solve";
import { breakSubstitution } from "../src/lib/solve-substitution";
import { breakColumnar, columnarTransposition } from "../src/lib/transposition";
import {
  accuracy,
  englishFitness,
  ownTrials,
  plaintextSlice,
  randomKey,
  randomLetters,
  record,
  shuffledLetters,
  TABLE,
} from "./trials";

interface Solver {
  name: string;
  /** Substitution ciphers get random letters as the text with nothing to find; transpositions get shuffled English. */
  moves: boolean;
  encrypt(plain: string, rng: () => number): string;
  solve(ciphertext: string, rng: () => number): string;
}

const pick = <T>(items: readonly T[], rng: () => number): T =>
  items[Math.floor(rng() * items.length)];

const solvers: Solver[] = [
  {
    name: "caesar",
    moves: false,
    encrypt: (plain, rng) => caesar(plain, 1 + Math.floor(rng() * 25)),
    solve: (text) => caesar(text, -caesarCandidates(text)[0].shift),
  },
  {
    name: "affine",
    moves: false,
    encrypt: (plain, rng) =>
      affine(
        plain,
        pick(AFFINE_MULTIPLIERS.slice(1), rng),
        Math.floor(rng() * 26),
        "encrypt",
      ),
    solve: (text) => breakAffine(text)[0].plaintext,
  },
  {
    name: "substitution",
    moves: false,
    encrypt: (plain, rng) =>
      substitution(
        plain,
        randomPermutation(26, rng)
          .map((value) => String.fromCharCode(65 + value))
          .join(""),
        "encrypt",
      ),
    solve: (text, rng) =>
      substitution(
        text,
        breakSubstitution(text, TABLE, { rng }).key,
        "decrypt",
      ),
  },
  {
    name: "rail-fence",
    moves: true,
    encrypt: (plain, rng) =>
      railFence(plain, 2 + Math.floor(rng() * 6), "encrypt"),
    solve: (text) => breakRailFence(text)[0].plaintext,
  },
  {
    name: "columnar-transposition",
    moves: true,
    encrypt: (plain, rng) =>
      columnarTransposition(
        plain,
        randomKey(3 + Math.floor(rng() * 5), rng),
        "encrypt",
      ),
    solve: (text) => breakColumnar(text)[0].plaintext,
  },
  {
    name: "route",
    moves: true,
    encrypt: (plain, rng) => {
      const divisors = Array.from({ length: plain.length }, (_, i) => i).filter(
        (columns) => columns >= 2 && plain.length % columns === 0,
      );
      return routeCipher(
        plain,
        pick(divisors.slice(0, -1), rng),
        pick(["rows", "columns"] as const, rng),
        pick(Object.keys(ROUTES) as Route[], rng),
        "encrypt",
      );
    },
    solve: (text) => {
      const [best] = breakRoute(text);
      return routeCipher(text, best.columns, best.fill, best.route, "decrypt");
    },
  },
];

interface Trial {
  solver: Solver;
  letters: number;
  repeat: number;
}

const trials: Trial[] = [];
for (const solver of solvers) {
  for (const letters of [10, 16, 20, 30, 40, 60, 80, 120, 200]) {
    for (let repeat = 0; repeat < 20; repeat += 1) {
      trials.push({ solver, letters, repeat });
    }
  }
}

it("simple solvers by text length", () => {
  for (const { solver, letters, repeat } of ownTrials(trials)) {
    const rng = seededRng(
      solvers.indexOf(solver) * 1000000 + letters * 100 + repeat,
    );
    const plain = plaintextSlice(letters, rng);
    // Half the trials hold a real ciphertext, half a text with nothing to find.
    const real = repeat < 10;
    const ciphertext = real
      ? solver.encrypt(plain, rng)
      : solver.moves
        ? shuffledLetters(plain, rng)
        : randomLetters(letters, rng);
    const start = performance.now();
    const recovered = solver.solve(ciphertext, rng);
    const { bigram, quadgram } = englishFitness(recovered);
    record("simple-solvers", {
      solver: solver.name,
      letters,
      kind: real ? "true" : "nothing",
      accuracy: real ? accuracy(recovered, plain).toFixed(2) : "",
      bigram: bigram.toFixed(2),
      quadgram: quadgram.toFixed(2),
      seconds: ((performance.now() - start) / 1000).toFixed(2),
    });
  }
});
