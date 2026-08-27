// ABOUTME: Vitest configuration; runs the unit tests for the cipher core.
// ABOUTME: Uses Astro's getViteConfig so tests see the same resolve settings as the site build.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
