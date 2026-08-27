# AGENTS.md

Cipher tool website for vigenere.org: encrypt, decrypt, and break classical
ciphers, in the style of dcode.fr. Static Astro site; all cipher logic runs
client-side in the browser. Deployed to GitHub Pages by
`.github/workflows/main.yml` on push to `main`; `ci.yml` runs formatting,
lint, and tests.

## Structure

- `src/lib/` — pure TypeScript cipher and analysis code, unit-tested with
  vitest (`*.test.ts` colocated). No DOM access here.
  - `cipher.ts` — Vigenère, Beaufort, Caesar, substitution, autokey.
  - `quagmire.ts` — Quagmire I–IV over keyword-mixed alphabets.
  - `solve.ts` — periodic key recovery via bigram fitness (Guballa method).
  - `solve-substitution.ts` — quadgram hill climb for one mixed alphabet.
  - `solve-polyalphabetic.ts` — IoC period detection plus per-column climb
    for arbitrary alphabets; parameters tuned by benchmark (10 restarts,
    early exit at English-level fitness; needs ~200+ letters per column).
  - `autosolve.ts` — cipher identification: routes by IoC, escalates,
    prefers the simpler cipher within a fitness epsilon.
  - `*.worker.ts` — Web Worker wrappers for the slow solvers.
  - `data/` — generated English n-gram tables (bigrams inline; quadgrams
    as `public/data/english-quadgrams.bin`, quantized to bytes, lazily
    fetched via `quadgrams.ts`).
- `src/pages/` — the auto-solver landing page and one page per tool
  (`/vigenere`, `/beaufort`, `/caesar`, `/autokey`, `/quagmire`,
  `/substitution`, `/polyalphabetic`), each with SEO body text.
- `src/components/` — shared UI; forms wire lib functions to the DOM.
- `src/layouts/Base.astro` — head metadata, JSON-LD, nav, footer.

## Commands

Use the Makefile: `make build`, `make test`, `make lint`, `make fmt`,
`make check`, `make dev`, `make clean`.

## Conventions

- TypeScript strict; no `.js` in `src/`.
- Cipher logic stays in pure functions in `src/lib/`; pages and components
  only wire it to the DOM. Randomness is injected (`rng` option) so tests
  are deterministic.
- Every source file starts with a 2-line `ABOUTME:` comment and SPDX
  headers (BSD-3-Clause for code, CC0-1.0 for config).
- Tests use externally validated vectors where available (cite the source
  in the test). Solver tests assert accuracy thresholds, not exact
  recovery: statistics cannot pin rare ambiguous letters.
- Commit style: Conventional Commits, direct to `main`.

## Analytics and ads

Cloudflare Web Analytics is injected only when `PUBLIC_CF_BEACON_TOKEN` is
set at build time (repo variable in GitHub Actions, `.envrc` locally).
Google AdSense (Auto ads plus /ads.txt) is injected only when
`PUBLIC_ADSENSE_CLIENT` is set to the ca-pub-... client id. Without the
variables the built pages contain no analytics or ad code.
