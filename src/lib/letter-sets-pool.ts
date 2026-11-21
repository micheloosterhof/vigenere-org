// ABOUTME: Runs the Quagmire letter-set scan across a pool of Web Workers, each taking a share of the periods.
// ABOUTME: Stops the whole pool as soon as one worker's decryption reads as English.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { toLetterValues } from "./solve";
import type { QuagmireDictionaryResult } from "./solve-quagmire-dictionary";
import {
  letterSetPeriods,
  type LetterSetsOptions,
} from "./solve-quagmire-letter-sets";

// More workers than this copy the quadgram table around for little gain.
const MAX_WORKERS = 8;
// In-depth searches per worker: each sees only its own periods, where the
// true combination is among the best three.
const DEEP_JOBS_PER_WORKER = 3;

/** What letter-sets.worker.ts accepts. */
export interface LetterSetsRequest {
  text: string;
  table: ArrayBuffer;
  periods: number[];
  deepJobs: number;
  seed: number;
}

/** What letter-sets.worker.ts posts back. */
export type LetterSetsMessage =
  | { type: "progress"; done: number; total: number }
  | { type: "result"; result: QuagmireDictionaryResult }
  | { type: "error"; message: string };

/** Breaks a Quagmire I-III by letter sets; the pool and the single-thread solver both fit. */
export type LetterSetsSolver = (
  text: string,
  table: Uint8Array,
  options: Pick<LetterSetsOptions, "periods" | "onProgress">,
) => Promise<QuagmireDictionaryResult>;

/**
 * Deals the periods, likeliest first, out to at most `parts` workers in turn,
 * so every worker starts on one of the likeliest periods.
 */
export function sharePeriods(periods: number[], parts: number): number[][] {
  const shares: number[][] = Array.from(
    { length: Math.min(parts, periods.length) },
    () => [],
  );
  periods.forEach((period, i) => {
    shares[i % shares.length].push(period);
  });
  return shares;
}

/**
 * The letter-set scan with its periods spread over as many workers as the
 * machine has cores (capped). Progress is the number of steps finished across
 * the pool; the result is the first decryption that reads as English, or the
 * best of all workers when none does.
 */
export const breakQuagmireLetterSetsParallel: LetterSetsSolver = (
  text,
  table,
  options,
) =>
  new Promise((resolve, reject) => {
    const periods = options.periods ?? letterSetPeriods(toLetterValues(text));
    const cores = navigator.hardwareConcurrency ?? 2;
    const shares = sharePeriods(periods, Math.min(cores, MAX_WORKERS));
    if (shares.length === 0) {
      reject(new Error("text is too short for any key length"));
      return;
    }
    const done = new Array<number>(shares.length).fill(0);
    const totals = new Array<number>(shares.length).fill(0);
    const workers: Worker[] = [];
    let best: QuagmireDictionaryResult | null = null;
    let pending = shares.length;
    let settled = false;

    const settle = (outcome: () => void): void => {
      if (!settled) {
        settled = true;
        for (const worker of workers) {
          worker.terminate();
        }
        outcome();
      }
    };

    shares.forEach((share, i) => {
      const worker = new Worker(
        new URL("./letter-sets.worker.ts", import.meta.url),
        { type: "module" },
      );
      workers.push(worker);
      worker.onmessage = (event: MessageEvent<LetterSetsMessage>) => {
        const message = event.data;
        if (message.type === "progress") {
          done[i] = message.done;
          totals[i] = message.total;
          options.onProgress?.(
            done.reduce((sum, n) => sum + n, 0),
            // A worker that has not reported yet has at least its periods to do.
            totals.reduce((sum, n, j) => sum + (n || shares[j].length), 0),
          );
        } else if (message.type === "result") {
          if (best === null || message.result.fitness > best.fitness) {
            best = message.result;
          }
          pending -= 1;
          const found = best;
          if (message.result.found || pending === 0) {
            settle(() =>
              resolve(message.result.found ? message.result : found),
            );
          }
        } else {
          settle(() => reject(new Error(message.message)));
        }
      };
      worker.onerror = (event) => {
        settle(() => reject(new Error(event.message)));
      };
      const request: LetterSetsRequest = {
        text,
        table: table.buffer as ArrayBuffer,
        periods: share,
        deepJobs: DEEP_JOBS_PER_WORKER,
        seed: Math.floor(Math.random() * 2 ** 31),
      };
      worker.postMessage(request);
    });
  });
