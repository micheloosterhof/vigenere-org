// ABOUTME: Unit tests for the periodic-cipher breaker and Caesar brute force.
// ABOUTME: Uses text encrypted with the cipher core and checks the key is recovered.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { beaufort, gronsfeld, porta, vigenere, caesar } from "./cipher";
import {
  beaufortDecrypt,
  breakPeriodic,
  caesarCandidates,
  breakPorta,
  portaDecrypt,
  scoreText,
  vigenereDecrypt,
} from "./solve";

const TABLE = new Uint8Array(
  readFileSync(
    new URL("../../public/data/english-quadgrams.bin", import.meta.url),
  ),
);

const PLAIN =
  "It was a bright cold day in April, and the clocks were striking thirteen. " +
  "Winston Smith, his chin nuzzled into his breast in an effort to escape the " +
  "vile wind, slipped quickly through the glass doors of Victory Mansions, " +
  "though not quickly enough to prevent a swirl of gritty dust from entering " +
  "along with him. The hallway smelt of boiled cabbage and old rag mats.";

describe("scoreText", () => {
  it("scores English text higher than uniform random letters", () => {
    const random =
      "XQZWKVJPYGXQZWKVJPYGXQZWKVJPYGXQZWKVJPYGXQZWKVJPYGXQZWKVJPYG";
    expect(scoreText(PLAIN)).toBeGreaterThan(scoreText(random));
  });
});

describe("breakPeriodic", () => {
  it("recovers a Vigenere key and its length", () => {
    const ciphertext = vigenere(PLAIN, "LEMON", "encrypt");
    const [best] = breakPeriodic(ciphertext, vigenereDecrypt);
    expect(best.key).toBe("LEMON");
    expect(best.keyLength).toBe(5);
  });

  it("recovers a longer Vigenere key", () => {
    const ciphertext = vigenere(PLAIN, "FORTIFICATION", "encrypt");
    const [best] = breakPeriodic(ciphertext, vigenereDecrypt);
    expect(best.key).toBe("FORTIFICATION");
  });

  it("recovers a Beaufort key", () => {
    const ciphertext = beaufort(PLAIN, "SECRET");
    const [best] = breakPeriodic(ciphertext, beaufortDecrypt);
    expect(best.key).toBe("SECRET");
  });

  it("prefers the true key length over its multiples", () => {
    const ciphertext = vigenere(PLAIN, "LEMON", "encrypt");
    const candidates = breakPeriodic(ciphertext, vigenereDecrypt);
    expect(candidates[0].keyLength).toBe(5);
  });

  it("recovers a single-letter key", () => {
    const ciphertext = vigenere(PLAIN, "Q", "encrypt");
    const [best] = breakPeriodic(ciphertext, vigenereDecrypt);
    expect(best.key).toBe("Q");
  });

  // 24 letters under a 6-letter key: four letters per column is too few for
  // the bigram vote, which rates the wrong key letter Y higher than F.
  // Quadgrams tell "look what the tide" from "loor what toe tide".
  it("refines a short key with quadgrams when the bigram vote misses a letter", () => {
    const ciphertext = "aozpbfptemjrxdpgwmjgsynl";
    const [unrefined] = breakPeriodic(ciphertext, vigenereDecrypt);
    expect(unrefined.key).toBe("PALYFY");
    const [best] = breakPeriodic(ciphertext, vigenereDecrypt, {
      quadgrams: TABLE,
    });
    expect(best.key).toBe("PALFFY");
    expect(vigenere(ciphertext, best.key, "decrypt")).toBe(
      "lookwhatthetidebroughtin",
    );
  });

  it("refines a Beaufort key with quadgrams", () => {
    const ciphertext = beaufort("look what the tide brought in", "PALFFY");
    const [best] = breakPeriodic(ciphertext, beaufortDecrypt, {
      quadgrams: TABLE,
    });
    expect(best.key).toBe("PALFFY");
  });

  // Porta pairs key letters (AB, CD, ...), so only the tableau, not the exact
  // letter, can be recovered; the breaker names the first letter of each pair.
  it("recovers a Porta key up to its letter pairs", () => {
    const ciphertext = porta(PLAIN, "FORTIFICATION");
    const [best] = breakPeriodic(ciphertext, portaDecrypt, {
      quadgrams: TABLE,
    });
    expect(best.key).toBe("EOQSIEICASIOM");
    expect(porta(ciphertext, best.key)).toBe(PLAIN);
  });

  it("recovers a short Porta key from a short text without overfitting a longer one", () => {
    const short =
      "IT WAS A BRIGHT COLD DAY IN APRIL AND THE CLOCKS WERE STRIKING " +
      "THIRTEEN WINSTON SMITH SLIPPED QUICKLY THROUGH THE GLASS DOORS";
    const [best] = breakPorta(porta(short, "SECRET"), { quadgrams: TABLE });
    expect(best.key).toBe("SECQES");
  });

  it("recovers a Gronsfeld key when limited to ten key values", () => {
    const ciphertext = gronsfeld(PLAIN, "31415", "encrypt");
    const [best] = breakPeriodic(ciphertext, vigenereDecrypt, {
      quadgrams: TABLE,
      keySpace: 10,
    });
    expect(best.key).toBe("DBEBF");
  });

  it("throws when the text has too few letters", () => {
    expect(() => breakPeriodic("a!", vigenereDecrypt)).toThrow();
  });
});

describe("caesarCandidates", () => {
  it("ranks the correct shift first and returns all 26", () => {
    const ciphertext = caesar(
      "The quick brown fox jumps over the lazy dog.",
      7,
    );
    const candidates = caesarCandidates(ciphertext);
    expect(candidates).toHaveLength(26);
    expect(candidates[0].shift).toBe(7);
  });
});
