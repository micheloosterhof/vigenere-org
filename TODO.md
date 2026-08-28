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
- Random-forest cipher classifier once the cipher set grows (Playfair, transposition, etc.).
- Slow-solver fuzz for Quagmire / polyalphabetic behind a slow-test tag.
