// ABOUTME: Web Worker running Quagmire IV jobs: one period and pair of keyword sizes each.
// ABOUTME: Takes the quadgram table once, then one job per message; posts each result.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { serveJobs } from "./job-worker";
import { runSeededQuagmireIvJob } from "./solve-quagmire-iv";

serveJobs(runSeededQuagmireIvJob);
