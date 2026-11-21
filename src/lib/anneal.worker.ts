// ABOUTME: Web Worker running annealing jobs for the Bifid, Trifid, and double transposition breakers.
// ABOUTME: Takes the quadgram table once, then one job per message; posts progress and each result.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { runJob } from "./anneal-jobs";
import { serveJobs } from "./job-worker";

serveJobs(runJob);
