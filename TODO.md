# TODO

## Colour scheme — accessibility contrast (review before deploying)

axe-core (WCAG 2.1 AA) flags one serious issue on every page: **colour contrast on
the orange header and buttons.**

- Nav links `text-orange-100` (#ffedd4) on `bg-orange-600` (#f54900) = **3.13:1**, needs 4.5:1.
- Brand text and buttons: white on orange-600 = **3.59:1**, needs 4.5:1.

Proposed fix (Michel wants to see it before it ships):

- Darken the header band and buttons from `orange-600` to `orange-700` (or `800`).
- Use pure `text-white` for nav links instead of `orange-100`.
- Re-verify every element clears 4.5:1 with axe-core.

This is a visible brand-colour change, so it needs a look before deploy.

## Later

- Cloudflare proxy would enable brotli, long cache on `/_astro/*`, and security
  headers (HSTS, CSP) — none settable on GitHub Pages.
- Playfair solver (hill climb over candidate squares); the /playfair page
  promises it as "on the roadmap".
- Random-forest cipher classifier: Playfair and both transpositions now exist,
  so the cipher zoo is large enough to train on the diagnostics feature vector.
- More languages (German, French, Spanish n-gram tables from the aldegonde
  counts) — needs corpus decisions.
- Slow-solver fuzz for Quagmire / polyalphabetic behind a slow-test tag.
