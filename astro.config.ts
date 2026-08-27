// ABOUTME: Astro build configuration for the vigenere.org static site.
// ABOUTME: Sets the canonical site URL and enables the Tailwind CSS plugin.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://vigenere.org",
  vite: {
    plugins: [tailwindcss()],
  },
});
