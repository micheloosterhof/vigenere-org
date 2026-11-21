// ABOUTME: Runs the Quagmire IV search on the job pool: each period and pair of keyword sizes is a job.
// ABOUTME: Stops at the first decryption that reads as English and names its key.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { runJobPool } from "./job-pool";
import {
  planQuagmireIvJobs,
  quagmireIvResult,
  searchedLetters,
  type QuagmireIvJobResult,
  type QuagmireIvOptions,
  type QuagmireIvResult,
  type SeededQuagmireIvJob,
} from "./solve-quagmire-iv";

/** Breaks a Quagmire IV; the pool and the single-thread solver both fit. */
export type QuagmireIvSolver = (
  text: string,
  table: Uint8Array,
  options: Pick<QuagmireIvOptions, "periods" | "onProgress">,
) => Promise<QuagmireIvResult>;

/**
 * The Quagmire IV search with its jobs spread over as many workers as the
 * machine has cores (capped). Progress is the number of jobs finished; the
 * result is the first decryption that reads as English, or the best of all
 * jobs when none does.
 */
export const breakQuagmireIvParallel: QuagmireIvSolver = async (
  text,
  table,
  options,
) => {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const jobs: SeededQuagmireIvJob[] = planQuagmireIvJobs(
    searchedLetters(text),
    options,
  ).map((job, i) => ({ ...job, seed: seed + i }));
  const best = await runJobPool<SeededQuagmireIvJob, QuagmireIvJobResult>(
    () =>
      new Worker(new URL("./quagmire-iv.worker.ts", import.meta.url), {
        type: "module",
      }),
    text,
    table,
    jobs,
    (progress) => options.onProgress?.(progress.jobsDone, progress.jobs),
  ).result;
  if (best === null) {
    throw new Error("text is too short for any key length");
  }
  return quagmireIvResult(text, best);
};
