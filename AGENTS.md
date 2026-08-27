# AGENTS.md

Cipher tool website for vigenere.org: encrypt, decrypt, and break classical
ciphers, in the style of dcode.fr. Static Astro site; all cipher logic runs
client-side in the browser. Deployed to GitHub Pages by
`.github/workflows/main.yml` on push to `main`.

## Structure

- `src/lib/` — pure TypeScript cipher core and analysis code, unit-tested
  with vitest (`*.test.ts` colocated). No DOM access here.
- `src/pages/` — the auto-solver landing page and one page per tool
  (`/vigenere`, `/beaufort`, `/caesar`, `/quagmire`, `/substitution`).
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

## Analytics and ads

Cloudflare Web Analytics is injected only when `PUBLIC_CF_BEACON_TOKEN` is
set at build time (repo variable in GitHub Actions, `.envrc` locally).
Google AdSense (Auto ads plus /ads.txt) is injected only when
`PUBLIC_ADSENSE_CLIENT` is set to the ca-pub-... client id. Without the
variables the built pages contain no analytics or ad code.
