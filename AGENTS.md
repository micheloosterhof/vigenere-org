# AGENTS.md

Cipher tool website for vigenere.org: encrypt, decrypt, and break classical
ciphers, in the style of dcode.fr. Static Astro site; all cipher logic runs
client-side in the browser. `ci.yml` runs formatting, lint, build, unit
tests, and e2e on every push and PR; `.github/workflows/main.yml` deploys to
GitHub Pages only after CI passes for a push to `main` (via `workflow_run`,
building the commit CI tested), or on a manual run.

## Structure

- `src/lib/` — pure TypeScript cipher and analysis code, unit-tested with
  vitest (`*.test.ts` colocated). No DOM access here.
  - `cipher.ts` — Vigenère, Beaufort, Gronsfeld, Porta, Caesar, Atbash,
    substitution, autokey.
  - `affine.ts` — affine cipher with an exhaustive 312-key breaker.
  - `bifid.ts` / `trifid.ts` — Delastelle's fractionating ciphers (5×5
    square shared with Playfair; 27-symbol cube with "+").
  - `quagmire.ts` — Quagmire I–IV over keyword-mixed alphabets.
  - `playfair.ts` — Playfair digraph cipher over a keyword-mixed 5×5 square.
  - `railfence.ts` / `transposition.ts` — rail fence and columnar
    transposition, each with an exhaustive breaker; double transposition.
  - `route.ts` — route cipher (grid fill plus spiral/snake/column routes)
    with an exhaustive breaker over grid widths and routes.
  - `solve.ts` — periodic key recovery via bigram fitness (Guballa method);
    `keySpace` limits Gronsfeld to digits, `breakPorta` caps key length.
  - `anneal.ts` — simulated annealing core (linear cooling, early exit at
    a target score, seeded rng) plus quadgram scoring that skips non-letters.
  - `solve-fractionation.ts` — Bifid/Trifid breaker: a pair index of
    coincidence ranks the periods, then the square or cube is annealed.
    Needs 100+ letters (refused below: random text overfits toward English).
  - `solve-double-transposition.ts` — anneals both column orders at given
    key lengths, then tries all cyclic column rotations (a rotated
    plaintext scores almost as well as the true one).
  - `anneal-jobs.ts` / `anneal-pool.ts` / `anneal.worker.ts` — the three
    annealing breakers split into seeded jobs (best period first), run on a
    pool of workers that stops at the first English decryption or on Stop.
    Settings (iterations, restarts, temperature) were chosen by benchmark.
  - `segment.ts` — word segmentation (Zipf costs over the word list plus
    inflections and unknown chunks) behind the "Split into words" toggle.
  - `solve-substitution.ts` — quadgram hill climb for one mixed alphabet.
  - `solve-polyalphabetic.ts` — IoC period detection plus per-column climb
    for arbitrary alphabets; parameters tuned by benchmark (10 restarts,
    early exit at English-level fitness; needs ~200+ letters per column).
  - `solve-quagmire.ts` — Quagmire III recovery: general solve, then
    reconcile one shared alphabet (`reconcile-quagmire.ts`); the solution
    is normalized to keyword form and its key named
    (`keyword-alphabet.ts`).
  - `solve-quagmire-dictionary.ts` — Quagmire I-III keyword dictionary
    attack over `public/data/english-words.txt` (google-10000-english);
    works on short texts and runs before the statistical solver, both on
    the quagmire page and inside the auto-solver.
  - `solve-autokey.ts` — primer recovery for both autokey variants.
  - `diagnostics.ts` — the statistical feature vector (IoC, chi-squared,
    autokey delta stream, transposition signature) behind `/analyze`.
  - `autosolve.ts` — cipher identification: routes by IoC, escalates,
    prefers the simpler cipher within a fitness epsilon.
  - `*.worker.ts` — Web Worker wrappers for the slow solvers.
  - `data/` — generated English n-gram tables (bigrams inline; quadgrams
    as `public/data/english-quadgrams.bin`, quantized to bytes, lazily
    fetched via `quadgrams.ts`).
- `src/pages/` — the auto-solver landing page and one page per tool
  (`/vigenere`, `/beaufort`, `/gronsfeld`, `/porta`, `/caesar`, `/rot13`,
  `/atbash`, `/affine`, `/autokey`, `/quagmire`, `/playfair`, `/bifid`,
  `/trifid`, `/substitution`, `/railfence`, `/transposition`,
  `/double-transposition`, `/route`, `/polyalphabetic`, `/analyze`,
  `/kryptos`), each with SEO body text; cipher pages end with a `Faq`
  section that also emits FAQPage JSON-LD.
- `e2e/` — Playwright smoke tests (`make e2e`): every page renders, the
  tools compute, and the documented deep links auto-run against the
  production build, served by `e2e/server.mjs` (redirects `/page` to
  `/page/` like GitHub Pages).
- `src/lib/polyalphabetic-pool.ts` — spreads the polyalphabetic solver's
  restarts over a pool of workers; the auto-solver and Quagmire workers
  take it as an injected `solvePolyalphabetic`, and run it as nested
  workers where the browser allows, sequentially otherwise.
- `src/components/` — shared UI; forms wire lib functions to the DOM.
  `CipherTool` builds its key fields from a per-cipher config (each field's
  name is its deep-link parameter). Outputs go through `wordSplitOutput`
  (`word-split.ts`, toggle on by default, remembered in localStorage) and
  results are announced via `liveRegion` (`announce.ts`); errors carry
  `role="alert"`. e2e tests turn word splitting off unless testing it.
- `src/layouts/Base.astro` — head metadata, JSON-LD, nav grouped by cipher
  family (`<details>` menus), footer.

## Commands

Use the Makefile: `make build`, `make test`, `make e2e`, `make lint`,
`make fmt`, `make check`, `make dev`, `make clean`.

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
