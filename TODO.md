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
- Playfair breaker: under 125 letters it holds text to a stricter bar
  (-4.5), so 5 of 24 texts of 100 and 110 letters come out right but are
  reported as "no English decryption found"
  (`bench/results/playfair-short.tsv`). Of 200 true plaintexts of 100
  letters, 50 score under that bar themselves, and 5 of 200 of 150 letters
  score under -4.7 (`bench/results/cipher-marks.tsv`), so the present bar
  cannot flag them at all. Runs that end on the same decryption do not help
  (`bench/results/playfair-agreement.tsv`, 326 texts, 8 runs each): wrong
  squares that four or five of the 8 runs end on score up to -4.70, and
  right answers that no run flags score -4.50 to -4.93, so no rule of "some
  runs agree and the score is over a lower bar" tells them apart. With
  nothing to find, three or more runs share the best answer in 25 of 100
  texts. A lower bar alone does more (`bench/results/playfair-bar.tsv`, 200
  texts of 100 and 110 letters, 8 runs each): bars of -4.5, -4.55 and -4.6
  flag 147, 161 and 168 texts, every added text at least 91% right. The
  best wrong squares a run ended on score -4.64 and -4.66 there, -4.68 in
  `playfair-short.tsv` and -4.70 in the agreement benchmark, so a bar of
  -4.55 keeps a margin of 0.09 and one of -4.6 a margin of 0.04. Not
  decided. At -4.5, 35 of the 200 texts come out right but unflagged and 18
  are not solved by any run.
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
- Kryptos K1 on the Quagmire page takes 5.5 to 6.7 seconds from click to
  answer (10 cores, 8 workers). The per-column dictionary pass
  (`breakQuagmireDictionary`) runs first, finds nothing there, and takes 2.3
  to 2.5 of them on one thread. The joint-shift attack takes 2.9 to 3.8: its
  word scan 2.1 to 2.6 on the workers, the ring solutions and the annealing
  under half a second each, the climb in between 0.2 on one thread.
- More languages (German, French, Spanish n-gram tables from the aldegonde
  counts) — needs corpus decisions.
- Slow-solver fuzz for Quagmire / polyalphabetic behind a slow-test tag.
