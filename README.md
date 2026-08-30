# vigenere.org

Classical cipher tools that run entirely in the browser, live at
[vigenere.org](https://vigenere.org). Encrypt, decrypt, and break ciphers;
no message text ever leaves the page.

## Tools

- **Auto-solver** (homepage): paste ciphertext, get the cipher, key, and
  plaintext. Routes by index of coincidence, then escalates from Caesar
  through Vigenère/Beaufort to a general polyalphabetic attack.
- **Vigenère, Beaufort, Caesar**: encrypt, decrypt, and break with a
  bigram-fitness key search (Guballa's adjacent-key-pair method).
- **ROT13 and Atbash**: the keyless self-inverse classics.
- **Rail fence**: zigzag transposition with a rail-count solver.
- **Columnar transposition**: keyword column order, with an exhaustive
  column-order solver up to seven columns.
- **Playfair**: digraph substitution over a keyword-mixed 5×5 square.
- **Autokey**: plaintext and ciphertext variants, with a primer-recovery
  solver for both.
- **Quagmire I–IV**: keyword-mixed alphabets, indicator letter; decrypts
  Kryptos K1/K2 with the right keys. A solver breaks Quagmire III blind by
  reconciling the general polyalphabetic result into one shared alphabet.
- **Substitution**: encrypt/decrypt plus a quadgram hill-climbing solver.
- **Polyalphabetic solver**: breaks periodic ciphers with arbitrary
  per-position alphabets (Quagmire without keywords), inspired by
  [slippery](https://github.com/themaddoctor/slippery).
- **Kryptos**: the story of K1–K4 with one-click decryption of K1 and K2.

## Development

Astro + Tailwind + TypeScript; cipher logic is pure TypeScript in
`src/lib/`, unit-tested with vitest against externally validated vectors.
See [AGENTS.md](AGENTS.md) for structure and conventions.

- `make dev` — dev server
- `make test` — unit tests
- `make check` — format, lint, and test
- `make build` — production build

Deployed to GitHub Pages on push to `main`. English n-gram data derives
from the [aldegonde](https://github.com/micheloosterhof/aldegonde) counts;
the quadgram table ships as a quantized binary fetched only by the solver
pages.
