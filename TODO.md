# TODO

## Colour scheme — accessibility contrast (decision pending)

axe-core (WCAG 2.1 AA) flags one serious issue on every page: **colour contrast on
the orange header and buttons.**

- Nav links `text-orange-100` (#ffedd4) on `bg-orange-600` (#f54900) = **3.13:1**, needs 4.5:1.
- Brand text and buttons: white on orange-600 = **3.59:1**, needs 4.5:1.

Darkening to `orange-700` was tried 2026-08-30 and rejected: it reads as red,
and Michel prefers the bright orange. White text on any orange that bright
cannot reach 4.5:1, so the remaining options are:

- Bright orange band/buttons with near-black text (~5.3:1, passes), or
- keep white text and accept the AA finding as a brand decision.

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
