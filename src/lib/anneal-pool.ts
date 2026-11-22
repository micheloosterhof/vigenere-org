// ABOUTME: Runs the annealing jobs of the Bifid, Trifid, Playfair, and double transposition breakers on the job pool.
// ABOUTME: Stops every worker as soon as one decryption reads as English, or when asked to.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { planJobs, type AnnealJob, type AnnealJobResult } from "./anneal-jobs";
import { runJobPool, type JobPoolProgress, type JobPoolRun } from "./job-pool";
import type { PlayfairCandidate } from "./solve-playfair";

export type AnnealPoolProgress = JobPoolProgress<AnnealJobResult>;
export type AnnealPoolRun = JobPoolRun<AnnealJobResult>;

const spawn = (): Worker =>
  new Worker(new URL("./anneal.worker.ts", import.meta.url), {
    type: "module",
  });

export function runAnnealPool(
  text: string,
  table: Uint8Array,
  jobs: AnnealJob[],
  onProgress?: (progress: AnnealPoolProgress) => void,
): AnnealPoolRun {
  return runJobPool(spawn, text, table, jobs, onProgress);
}

/** Breaks a Playfair; the pool and the single-thread solver both fit. */
export type PlayfairSolver = (
  text: string,
  table: Uint8Array,
) => Promise<PlayfairCandidate>;

/**
 * The Playfair search with its runs side by side on the pool. The result is
 * the first decryption that reads as English, or the best of all runs when
 * none does.
 */
export const breakPlayfairParallel: PlayfairSolver = async (text, table) => {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const jobs = planJobs(text, { cipher: "playfair" }, seed);
  const best = await runJobPool<AnnealJob, PlayfairCandidate>(
    spawn,
    text,
    table,
    jobs,
  ).result;
  if (best === null) {
    throw new Error("the Playfair search made no runs");
  }
  return best;
};
