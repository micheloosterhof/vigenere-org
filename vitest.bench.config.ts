// ABOUTME: Vitest configuration for the solver benchmarks under bench/, kept out of the unit test run.
// ABOUTME: Benchmarks are long grids of solver trials, so they get no time limit.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    include: ["bench/**/*.bench.ts"],
    testTimeout: 0,
  },
});
