// ABOUTME: Runs the annealing jobs of the Bifid, Trifid, and double transposition breakers on the job pool.
// ABOUTME: Stops every worker as soon as one decryption reads as English, or when asked to.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import type { AnnealJob, AnnealJobResult } from "./anneal-jobs";
import { runJobPool, type JobPoolProgress, type JobPoolRun } from "./job-pool";

export type AnnealPoolProgress = JobPoolProgress<AnnealJobResult>;
export type AnnealPoolRun = JobPoolRun<AnnealJobResult>;

export function runAnnealPool(
  text: string,
  table: Uint8Array,
  jobs: AnnealJob[],
  onProgress?: (progress: AnnealPoolProgress) => void,
): AnnealPoolRun {
  return runJobPool(
    () =>
      new Worker(new URL("./anneal.worker.ts", import.meta.url), {
        type: "module",
      }),
    text,
    table,
    jobs,
    onProgress,
  );
}
