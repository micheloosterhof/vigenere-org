// ABOUTME: Splits a Bifid, Trifid, or double transposition attack into independent annealing jobs.
// ABOUTME: Jobs come most likely first (best-ranked period), so a pool finds the key early and stops.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { seededRng } from "./anneal";
import {
  annealFractionation,
  rankPeriods,
  RUN_SETTINGS,
  type FractionationCandidate,
} from "./solve-fractionation";
import {
  annealDouble,
  DOUBLE_SETTINGS,
  type DoubleCandidate,
} from "./solve-double-transposition";

export type AnnealRequest =
  | { cipher: "bifid" | "trifid"; periods?: number[] }
  | { cipher: "double"; firstLength: number; secondLength: number };

export type AnnealJob =
  | { cipher: "bifid" | "trifid"; period: number; seed: number }
  | {
      cipher: "double";
      firstLength: number;
      secondLength: number;
      seed: number;
    };

export type AnnealJobResult =
  | ({ cipher: "bifid" | "trifid" } & FractionationCandidate)
  | ({ cipher: "double" } & DoubleCandidate);

/** The jobs for an attack, most promising first; `seed` makes them reproducible. */
export function planJobs(
  text: string,
  request: AnnealRequest,
  seed: number,
): AnnealJob[] {
  const jobs: AnnealJob[] = [];
  if (request.cipher === "double") {
    for (let run = 0; run < DOUBLE_SETTINGS.restarts; run += 1) {
      jobs.push({
        cipher: "double",
        firstLength: request.firstLength,
        secondLength: request.secondLength,
        seed: seed + run,
      });
    }
    return jobs;
  }
  const { restarts } = RUN_SETTINGS[request.cipher];
  for (const period of rankPeriods(request.cipher, text, request.periods)) {
    for (let run = 0; run < restarts; run += 1) {
      jobs.push({ cipher: request.cipher, period, seed: seed + jobs.length });
    }
  }
  return jobs;
}

/** Runs one job: a single annealing run from the job's seed. */
export function runJob(
  job: AnnealJob,
  text: string,
  table: Uint8Array,
  onProgress?: (fraction: number) => void,
): AnnealJobResult {
  const options = { rng: seededRng(job.seed), onProgress };
  if (job.cipher === "double") {
    return {
      cipher: "double",
      ...annealDouble(text, job.firstLength, job.secondLength, table, options),
    };
  }
  return {
    cipher: job.cipher,
    ...annealFractionation(job.cipher, text, job.period, table, options),
  };
}
