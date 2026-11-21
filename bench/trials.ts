// ABOUTME: Shared pieces of the solver benchmarks: corpus plaintext, random keys, keywords, accuracy and result rows.
// ABOUTME: Every trial is drawn from a seeded generator, so a benchmark run can be repeated exactly.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { quadgramFitness } from "../src/lib/quadgrams";
import { scoreText, toLetterValues } from "../src/lib/solve";

const read = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), "utf8");

/** Public-domain English prose, letters only, in upper case. */
export const CORPUS = read("./data/english-plaintext.txt")
  .toUpperCase()
  .replace(/[^A-Z]/g, "");

export const TABLE = new Uint8Array(
  readFileSync(
    new URL("../public/data/english-quadgrams.bin", import.meta.url),
  ),
);

export const WORDS = read("../public/data/english-words.txt")
  .split("\n")
  .filter((word) => word !== "");

/** A run of `letters` consecutive corpus letters starting at a random place. */
export function plaintextSlice(letters: number, rng: () => number): string {
  if (letters > CORPUS.length) {
    throw new Error(`the corpus has only ${CORPUS.length} letters`);
  }
  const start = Math.floor(rng() * (CORPUS.length - letters + 1));
  return CORPUS.slice(start, start + letters);
}

/** A random key of `period` letters that does not repeat with a shorter period. */
export function randomKey(period: number, rng: () => number): string {
  for (;;) {
    let key = "";
    for (let i = 0; i < period; i += 1) {
      key += String.fromCharCode(65 + Math.floor(rng() * 26));
    }
    const repeats = Array.from({ length: period - 1 }, (_, i) => i + 1).some(
      (shorter) =>
        period % shorter === 0 &&
        key === key.slice(0, shorter).repeat(period / shorter),
    );
    if (!repeats) {
      return key;
    }
  }
}

/** `letters` letters drawn uniformly at random: text with nothing to find. */
export function randomLetters(letters: number, rng: () => number): string {
  return Array.from({ length: letters }, () =>
    String.fromCharCode(65 + Math.floor(rng() * 26)),
  ).join("");
}

/** The letters of `text` in random order: English frequencies with no order to restore. */
export function shuffledLetters(text: string, rng: () => number): string {
  const letters = [...text];
  for (let i = letters.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  return letters.join("");
}

/** How English a text reads: average bigram and quadgram log10 probability. */
export function englishFitness(text: string): {
  bigram: number;
  quadgram: number;
} {
  return {
    bigram: scoreText(text),
    quadgram: quadgramFitness(toLetterValues(text), TABLE),
  };
}

/** A random word from the site's word list with exactly `distinct` different letters. */
export function keywordWith(distinct: number, rng: () => number): string {
  const fitting = WORDS.filter((word) => new Set(word).size === distinct);
  return fitting[Math.floor(rng() * fitting.length)].toUpperCase();
}

/** Fraction of letter positions where the recovered plaintext matches the true one. */
export function accuracy(recovered: string, plain: string): number {
  const got = recovered.toUpperCase().replace(/[^A-Z]/g, "");
  let same = 0;
  for (let i = 0; i < plain.length; i += 1) {
    if (got[i] === plain[i]) {
      same += 1;
    }
  }
  return same / plain.length;
}

// BENCH_SHARD="2/8" runs every eighth trial starting at the third, so a grid
// can be spread over several processes.
const [SHARD, SHARDS] = (process.env.BENCH_SHARD ?? "0/1")
  .split("/")
  .map(Number);

/** The trials this process should run. */
export function ownTrials<T>(trials: T[]): T[] {
  return trials.filter((_, i) => i % SHARDS === SHARD);
}

const started = new Set<string>();

/**
 * Writes one trial's outcome to this shard's tab-separated result file. The
 * first row of a run replaces whatever an earlier run left in the file.
 */
export function record(
  benchmark: string,
  row: Record<string, string | number>,
): void {
  const file = new URL(
    `./results/${benchmark}.${SHARD}.part.tsv`,
    import.meta.url,
  );
  if (!started.has(benchmark)) {
    started.add(benchmark);
    writeFileSync(file, Object.keys(row).join("\t") + "\n");
  }
  appendFileSync(file, Object.values(row).join("\t") + "\n");
}
