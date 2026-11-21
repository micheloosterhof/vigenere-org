// ABOUTME: Splits a Bifid, Trifid, Playfair, or double transposition attack into independent annealing jobs.
// ABOUTME: Jobs come cheapest and most likely first (short runs, best-ranked period), so a pool finds the key early and stops.
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
import {
  annealPlayfair,
  PLAYFAIR_RUNS,
  playfairIterations,
  playfairValues,
  type PlayfairCandidate,
} from "./solve-playfair";

export type AnnealRequest =
  | { cipher: "bifid" | "trifid"; periods?: number[] }
  | { cipher: "playfair" }
  | { cipher: "double"; firstLength: number; secondLength: number };

export type AnnealJob =
  | {
      cipher: "bifid" | "trifid";
      period: number;
      /** Annealing steps of this run. */
      iterations: number;
      seed: number;
    }
  | {
      cipher: "playfair";
      /** Annealing steps of this run. */
      iterations: number;
      seed: number;
    }
  | {
      cipher: "double";
      firstLength: number;
      secondLength: number;
      seed: number;
    };

export type AnnealJobResult =
  | ({ cipher: "bifid" | "trifid" } & FractionationCandidate)
  | ({ cipher: "playfair" } & PlayfairCandidate)
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
  if (request.cipher === "playfair") {
    // Throws now, before any worker starts, when the text cannot be attacked.
    const iterations = playfairIterations(playfairValues(text).length);
    for (let run = 0; run < PLAYFAIR_RUNS; run += 1) {
      jobs.push({ cipher: "playfair", iterations, seed: seed + run });
    }
    return jobs;
  }
  const periods = rankPeriods(request.cipher, text, request.periods);
  for (const { iterations, restarts } of RUN_SETTINGS[request.cipher].rounds) {
    for (const period of periods) {
      for (let run = 0; run < restarts; run += 1) {
        jobs.push({
          cipher: request.cipher,
          period,
          iterations,
          seed: seed + jobs.length,
        });
      }
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
  if (job.cipher === "playfair") {
    return {
      cipher: "playfair",
      ...annealPlayfair(text, table, {
        ...options,
        iterations: job.iterations,
      }),
    };
  }
  return {
    cipher: job.cipher,
    ...annealFractionation(job.cipher, text, job.period, table, {
      ...options,
      iterations: job.iterations,
    }),
  };
}
