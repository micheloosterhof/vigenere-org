// ABOUTME: Playwright configuration for the end-to-end smoke tests.
// ABOUTME: Builds the site and serves the production output with a small static server.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: CC0-1.0
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://127.0.0.1:4321" },
  webServer: {
    command:
      "PUBLIC_ADSENSE_CLIENT=ca-pub-0000000000000000 npm run build && node e2e/server.mjs",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
