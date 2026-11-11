// ABOUTME: Unit tests for splitting annealing attacks into jobs and running a job.
// ABOUTME: Checks job order (best period first), seeds, and that a job result carries its cipher.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bifid } from "./bifid";
import { planJobs, runJob } from "./anneal-jobs";
import { RUN_SETTINGS } from "./solve-fractionation";
import { DOUBLE_SETTINGS } from "./solve-double-transposition";

const TABLE = new Uint8Array(
  readFileSync(
    new URL("../../public/data/english-quadgrams.bin", import.meta.url),
  ),
);

const LETTERS =
  "ITWASABRIGHTCOLDDAYINAPRILANDTHECLOCKSWERESTRIKINGTHIRTEENWINSTONSMITH" +
  "HISCHINNUZZLEDINTOHISBREASTINANEFFORTTOESCAPETHEVILEWINDSLIPPEDQUICKLY" +
  "THROUGHTHEGLASSDOORSOFVICTORYMANSIONSTHOUGHNOTQUICKLYENOUGHTOPREVENTA";

describe("planJobs", () => {
  it("queues every restart of the best period first, each with its own seed", () => {
    const ciphertext = bifid(LETTERS, "KEYWORD", 6, "encrypt");
    const jobs = planJobs(ciphertext, { cipher: "bifid" }, 100);
    const { restarts, finalists } = RUN_SETTINGS.bifid;
    expect(jobs).toHaveLength(restarts * finalists);
    expect(
      jobs.slice(0, restarts).every((j) => "period" in j && j.period === 6),
    ).toBe(true);
    expect(new Set(jobs.map((j) => j.seed)).size).toBe(jobs.length);
  });

  it("uses only the given period when there is one", () => {
    const jobs = planJobs(LETTERS, { cipher: "trifid", periods: [5] }, 0);
    expect(jobs.every((j) => "period" in j && j.period === 5)).toBe(true);
  });

  it("plans restarts at fixed key lengths for double transposition", () => {
    const jobs = planJobs(
      LETTERS,
      { cipher: "double", firstLength: 5, secondLength: 7 },
      0,
    );
    expect(jobs).toHaveLength(DOUBLE_SETTINGS.restarts);
  });
});

describe("runJob", () => {
  it("returns a result tagged with its cipher", () => {
    const result = runJob(
      { cipher: "double", firstLength: 3, secondLength: 4, seed: 1 },
      LETTERS.slice(0, 120),
      TABLE,
    );
    expect(result.cipher).toBe("double");
    expect(result.plaintext).toHaveLength(120);
  });
});
