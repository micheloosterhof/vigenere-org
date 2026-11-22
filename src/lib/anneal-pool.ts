// ABOUTME: Runs the annealing jobs of the Bifid, Trifid, Playfair, and double transposition breakers on the job pool.
// ABOUTME: Stops every worker as soon as one decryption reads as English, or when asked to.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import {
  planJobs,
  type AnnealJob,
  type AnnealJobResult,
  type AnnealRequest,
} from "./anneal-jobs";
import {
  runJobPool,
  type JobPoolProgress,
  type JobPoolRun,
  type JobResult,
} from "./job-pool";
import type {
  FractionationCandidate,
  FractionationCipher,
} from "./solve-fractionation";
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

/**
 * A whole attack with its runs side by side on the pool. The result is the
 * first decryption that reads as English, or the best of all runs when none
 * does.
 */
async function search<Result extends JobResult>(
  text: string,
  table: Uint8Array,
  request: AnnealRequest,
): Promise<Result> {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const jobs = planJobs(text, request, seed);
  const best = await runJobPool<AnnealJob, Result>(spawn, text, table, jobs)
    .result;
  if (best === null) {
    throw new Error("the search made no runs");
  }
  return best;
}

/** Breaks a Playfair; the pool and the single-thread solver both fit. */
export type PlayfairSolver = (
  text: string,
  table: Uint8Array,
) => Promise<PlayfairCandidate>;

/** The Playfair search on the pool. */
export const breakPlayfairParallel: PlayfairSolver = (text, table) =>
  search(text, table, { cipher: "playfair" });

/** Breaks a Bifid or Trifid of unknown period; the pool and the single-thread solver both fit. */
export type FractionationSolver = (
  cipher: FractionationCipher,
  text: string,
  table: Uint8Array,
) => Promise<FractionationCandidate>;

/** The Bifid or Trifid search over every period on the pool. */
export const breakFractionationParallel: FractionationSolver = (
  cipher,
  text,
  table,
) => search(text, table, { cipher });
