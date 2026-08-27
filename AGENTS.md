# AGENTS.md

Cipher tool website for vigenere.org: encrypt, decrypt, and break classical
ciphers, in the style of dcode.fr. Static Astro site; all cipher logic runs
client-side in the browser. Deployed to GitHub Pages by
`.github/workflows/main.yml` on push to `main`.

## Structure

- `src/lib/` — pure TypeScript cipher core and analysis code, unit-tested
  with vitest (`*.test.ts` colocated). No DOM access here.
- `src/pages/` — one Astro page per tool (`/vigenere`, `/beaufort`,
  `/caesar`).
- `src/components/` — shared UI, including the client-side form wiring.
- `src/layouts/Base.astro` — head metadata, nav, footer.

## Commands

Use the Makefile: `make build`, `make test`, `make lint`, `make fmt`,
`make check`, `make dev`, `make clean`.

## Conventions

- TypeScript strict; no `.js` in `src/`.
- Cipher logic stays in pure functions in `src/lib/`; pages and components
  only wire it to the DOM.
- Every source file starts with a 2-line `ABOUTME:` comment and SPDX
  headers (BSD-3-Clause for code, CC0-1.0 for config).
- Tests use externally validated vectors where available (cite the source
  in the test).
- Commit style: Conventional Commits, direct to `main`.
