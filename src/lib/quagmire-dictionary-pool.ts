// ABOUTME: Shares the word scan of the per-column Quagmire dictionary attack among a pool of Web Workers.
// ABOUTME: Each worker scans a share of the keywords; the calling thread rescores the best candidates and decides.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { dealOut } from "./job-pool";
import { openRoundPool } from "./round-pool";
import {
  distinctAlphabets,
  finishDictionary,
  type DictionaryCandidate,
  type QuagmireDictionaryResult,
} from "./solve-quagmire-dictionary";

// More workers than this gain little: the scan takes a few seconds on one.
const MAX_WORKERS = 8;

/** What quagmire-dictionary.worker.ts accepts: its share of the keywords to scan. */
export interface DictionaryScanRequest {
  text: string;
  /** One keyword per alphabet. */
  words: string[];
  period?: number;
}

/** Breaks a Quagmire by the per-column dictionary attack; the pool and the single-thread solver both fit. */
export type DictionarySolver = (
  text: string,
  words: string[],
  table: Uint8Array,
  options: {
    period?: number;
    onProgress?: (done: number, total: number) => void;
  },
) => Promise<QuagmireDictionaryResult>;

const spawn = (): Worker =>
  new Worker(new URL("./quagmire-dictionary.worker.ts", import.meta.url), {
    type: "module",
  });

/**
 * The per-column dictionary attack with its word scan spread over as many
 * workers as the machine has cores (capped). Progress is the number of
 * keywords scanned across the pool.
 */
export const breakQuagmireDictionaryParallel: DictionarySolver = async (
  text,
  words,
  table,
  options,
) => {
  const alphabets = distinctAlphabets(words);
  const cores = navigator.hardwareConcurrency ?? 2;
  const shares = dealOut(alphabets, Math.min(cores, MAX_WORKERS));
  const pool = openRoundPool<DictionaryScanRequest>(spawn, shares.length);
  try {
    const scanned = await pool.ask<DictionaryCandidate[]>(
      shares.map((share) => ({ text, words: share, period: options.period })),
      (done) => options.onProgress?.(done, alphabets.length),
    );
    return finishDictionary(text, scanned.flat(), table);
  } finally {
    pool.close();
  }
};
