// ABOUTME: Runs the polyalphabetic solver's restarts across a pool of Web Workers, one share each.
// ABOUTME: Stops the whole pool as soon as one worker's result reads as English.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import {
  EARLY_EXIT_FITNESS,
  RESTARTS,
  type PolyalphabeticProgress,
  type PolyalphabeticResult,
  type PolyalphabeticSolver,
} from "./solve-polyalphabetic";

// More workers than this copy the quadgram table around for little gain.
const MAX_WORKERS = 8;

/** What polyalphabetic.worker.ts accepts. */
export interface PolyalphabeticRequest {
  text: string;
  table: ArrayBuffer;
  period?: number;
  maxPeriod?: number;
  restarts?: number;
  seedFromFrequency?: boolean;
}

/** What polyalphabetic.worker.ts posts back. */
export type PolyalphabeticMessage =
  | ({ type: "progress" } & PolyalphabeticProgress)
  | { type: "result"; result: PolyalphabeticResult }
  | { type: "error"; message: string };

/** Splits `restarts` into `parts` shares differing by at most one. */
export function shareRestarts(restarts: number, parts: number): number[] {
  const base = Math.floor(restarts / parts);
  const extra = restarts % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

/** True where this code can spawn Web Workers: the page, or a worker in a browser with nested workers. */
export function canSpawnWorkers(): boolean {
  return typeof Worker !== "undefined";
}

/**
 * Breaks a polyalphabetic cipher with its restarts spread over as many
 * workers as the machine has cores (capped), the first of them starting from
 * the frequency seed and the rest from random keys. Progress is the number of
 * restarts finished across the pool; the result is the best one, delivered as
 * soon as any worker's reads as English.
 */
export const breakPolyalphabeticParallel: PolyalphabeticSolver = (
  text,
  table,
  options,
) =>
  new Promise((resolve, reject) => {
    const restarts = options.restarts ?? RESTARTS;
    const cores = navigator.hardwareConcurrency ?? 2;
    const shares = shareRestarts(
      restarts,
      Math.max(1, Math.min(restarts, cores, MAX_WORKERS)),
    );
    const finished = new Array<number>(shares.length).fill(0);
    const workers: Worker[] = [];
    let best: PolyalphabeticResult | null = null;
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
        new URL("./polyalphabetic.worker.ts", import.meta.url),
        { type: "module" },
      );
      workers.push(worker);
      worker.onmessage = (event: MessageEvent<PolyalphabeticMessage>) => {
        const message = event.data;
        if (message.type === "progress") {
          finished[i] = message.restart;
          options.onProgress?.({
            restart: finished.reduce((sum, n) => sum + n, 0),
            restarts,
            fitness: Math.max(message.fitness, best?.fitness ?? -Infinity),
          });
        } else if (message.type === "result") {
          if (best === null || message.result.fitness > best.fitness) {
            best = message.result;
          }
          pending -= 1;
          const found = best;
          if (found.fitness >= EARLY_EXIT_FITNESS || pending === 0) {
            settle(() => resolve(found));
          }
        } else {
          settle(() => reject(new Error(message.message)));
        }
      };
      worker.onerror = (event) => {
        settle(() => reject(new Error(event.message)));
      };
      const request: PolyalphabeticRequest = {
        text,
        table: table.buffer as ArrayBuffer,
        period: options.period,
        maxPeriod: options.maxPeriod,
        restarts: share,
        seedFromFrequency: i === 0,
      };
      worker.postMessage(request);
    });
  });
