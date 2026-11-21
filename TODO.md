# TODO

## Decided

- Colour contrast (2026-08-30): axe-core flags white/orange-100 text on the
  orange-600 header and buttons (3.13:1–3.59:1 vs the 4.5:1 AA threshold).
  Michel accepts the finding as a brand decision: the bright orange stays.
  Darkening to orange-700 was tried and rejected as too red. Do not "fix"
  this in future audits.

## Later

- Cloudflare proxy would enable brotli, long cache on `/_astro/*`, and security
  headers (HSTS, CSP) — none settable on GitHub Pages.
- Playfair solver (hill climb over candidate squares); the /playfair page
  promises it as "on the roadmap".
- Random-forest cipher classifier: Playfair and both transpositions now exist,
  so the cipher zoo is large enough to train on the diagnostics feature vector.
  The solver ids in `solver-registry.ts` are the labels to predict and the
  rows under `bench/results/` say which solver succeeded on which text.
- Quagmire IV breaker (`solve-quagmire-iv.ts`) is not on the page: it needs
  the period and both keyword sizes, about half a minute per combination, so
  it wants a worker pool and a benchmark with the sizes unknown.
- The joint-shift Quagmire dictionary attack runs on one thread (20 to 40
  seconds); its word scan could be shared among workers.
- The statistical Quagmire III solver misses the shared alphabet on 29 of
  the 93 texts it decrypts correctly in
  `bench/results/quagmire-shared-alphabet.tsv` (9 of 40 at 300 letters per
  column) and reports them as a general polyalphabetic cipher. Why
  `reconcileSharedAlphabet` returns no fit there is not yet looked into.
- More languages (German, French, Spanish n-gram tables from the aldegonde
  counts) — needs corpus decisions.
- Slow-solver fuzz for Quagmire / polyalphabetic behind a slow-test tag.
