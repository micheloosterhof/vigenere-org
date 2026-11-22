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
- Playfair breaker: under 125 letters it holds text to a stricter bar, so 5
  of 24 texts of 100 and 110 letters come out right but are reported as "no
  English decryption found" (`bench/results/playfair-short.tsv`). Two runs
  ending on the same square would be a better sign of the right key than
  the score alone. Of 200 true plaintexts of 100 letters, 50 score under
  that bar themselves, and 5 of 200 of 150 letters score under -4.7
  (`bench/results/cipher-marks.tsv`), so the score cannot flag them at all.
- Random-forest cipher classifier: Playfair and both transpositions now exist,
  so the cipher zoo is large enough to train on the diagnostics feature vector.
  The solver ids in `solver-registry.ts` are the labels to predict and the
  rows under `bench/results/` say which solver succeeded on which text.
- Quagmire IV breaker (`solve-quagmire-iv.ts`): keywords of 9 or more
  different letters are outside the sizes it tries (0 of 24 texts in
  `bench/results/quagmire-iv-unknown.tsv`); with the sizes given exactly and
  300 runs it solves them from 64 letters per column, so size fields on the
  page or a slower last round could cover them. A long Quagmire IV text is
  solved by the statistical attack before the search runs, so its keywords
  are not named.
- Trifid: the true period is among the four periods the breaker tries in
  254 of 260 texts of 300 letters and 231 of 260 of 200
  (`bench/results/fractionation-periods.tsv`). Six finalists would make
  that 256 and 250, at half as much time again on a text that cannot be
  solved.
- The joint-shift Quagmire dictionary attack shares its word scan among
  workers (Kryptos K1 on the Quagmire page went from 25 to 11 seconds), but
  the stages after the scan still run on one thread, most of it annealing
  the 60 finalists.
- The statistical Quagmire III solver misses the shared alphabet when every
  shift is even (4 of 93 right decryptions in
  `bench/results/quagmire-shared-alphabet.tsv`, all at periods 3 and 5): the
  letters then fall into two halves that no pair connects, and
  `reconcileSharedAlphabet` gives up instead of placing the halves side by
  side.
- More languages (German, French, Spanish n-gram tables from the aldegonde
  counts) — needs corpus decisions.
- Slow-solver fuzz for Quagmire / polyalphabetic behind a slow-test tag.
