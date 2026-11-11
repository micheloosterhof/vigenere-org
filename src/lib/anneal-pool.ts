// ABOUTME: Runs annealing jobs across a pool of Web Workers, one job per worker at a time.
// ABOUTME: Stops every worker as soon as one decryption reads as English, or when asked to.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import type { AnnealJob, AnnealJobResult } from "./anneal-jobs";
import type { AnnealWorkerMessage, AnnealWorkerRequest } from "./anneal.worker";

// More workers than this copy the quadgram table around for little gain.
const MAX_WORKERS = 8;

export interface AnnealPoolProgress {
  /** Fraction of all jobs done, counting the running ones in part. */
  fraction: number;
  jobsDone: number;
  jobs: number;
  /** Best result so far, if any job has finished. */
  best: AnnealJobResult | null;
}

export interface AnnealPoolRun {
  /** The best result: the first English one, else the best of all jobs (null if stopped before any finished). */
  result: Promise<AnnealJobResult | null>;
  /** Stops all workers; the promise resolves with the best result so far. */
  stop(): void;
}

export function runAnnealPool(
  text: string,
  table: Uint8Array,
  jobs: AnnealJob[],
  onProgress?: (progress: AnnealPoolProgress) => void,
): AnnealPoolRun {
  let stop = (): void => {};
  const result = new Promise<AnnealJobResult | null>((resolve, reject) => {
    if (jobs.length === 0) {
      resolve(null);
      return;
    }
    const cores = navigator.hardwareConcurrency ?? 2;
    const size = Math.max(1, Math.min(jobs.length, cores, MAX_WORKERS));
    const workers: Worker[] = [];
    const running = new Array<number>(size).fill(0);
    let next = 0;
    let done = 0;
    let best: AnnealJobResult | null = null;
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
    stop = () => settle(() => resolve(best));

    const report = (): void => {
      const partial = running.reduce((sum, f) => sum + f, 0);
      onProgress?.({
        fraction: Math.min(1, (done + partial) / jobs.length),
        jobsDone: done,
        jobs: jobs.length,
        best,
      });
    };

    const dispatch = (index: number): void => {
      if (next >= jobs.length) {
        return;
      }
      const job = jobs[next];
      next += 1;
      running[index] = 0;
      const request: AnnealWorkerRequest = { type: "job", job, text };
      workers[index].postMessage(request);
    };

    for (let index = 0; index < size; index += 1) {
      const worker = new Worker(
        new URL("./anneal.worker.ts", import.meta.url),
        {
          type: "module",
        },
      );
      workers.push(worker);
      worker.onmessage = (event: MessageEvent<AnnealWorkerMessage>) => {
        const message = event.data;
        if (message.type === "progress") {
          running[index] = message.fraction;
          report();
        } else if (message.type === "result") {
          done += 1;
          running[index] = 0;
          if (best === null || message.result.fitness > best.fitness) {
            best = message.result;
          }
          report();
          const found = best;
          if (found.english || done === jobs.length) {
            settle(() => resolve(found));
          } else {
            dispatch(index);
          }
        } else {
          settle(() => reject(new Error(message.message)));
        }
      };
      worker.onerror = (event) => {
        settle(() => reject(new Error(event.message)));
      };
      const init: AnnealWorkerRequest = {
        type: "init",
        table: table.buffer.slice(0) as ArrayBuffer,
      };
      worker.postMessage(init);
      dispatch(index);
    }
  });
  return { result, stop: () => stop() };
}
