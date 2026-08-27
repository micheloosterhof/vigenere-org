// ABOUTME: ESLint flat config; strict TypeScript rules plus Astro component linting.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";

export default tseslint.config(
  { ignores: ["dist/", ".astro/", "node_modules/"] },
  ...tseslint.configs.strict,
  ...astro.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "warn",
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
    },
  },
);
