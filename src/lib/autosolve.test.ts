// ABOUTME: Unit tests for the automatic cipher identification and breaking pipeline.
// ABOUTME: Feeds each cipher family's output in and checks the route and recovery.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { autokey, beaufort, caesar, substitution, vigenere } from "./cipher";
import { autosolve } from "./autosolve";

const TABLE = new Uint8Array(
  readFileSync(
    new URL("../../public/data/english-quadgrams.bin", import.meta.url),
  ),
);

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLAIN =
  "It was a bright cold day in April, and the clocks were striking thirteen. " +
  "Winston Smith, his chin nuzzled into his breast in an effort to escape the " +
  "vile wind, slipped quickly through the glass doors of Victory Mansions, " +
  "though not quickly enough to prevent a swirl of gritty dust from entering " +
  "along with him. The hallway smelt of boiled cabbage and old rag mats. At " +
  "one end of it a coloured poster, too large for indoor display, had been " +
  "tacked to the wall. It depicted simply an enormous face, more than a metre " +
  "wide: the face of a man of about forty-five, with a heavy black moustache " +
  "and ruggedly handsome features.";

describe("autosolve", () => {
  it("identifies Caesar ciphertext without running the substitution climb", () => {
    const result = autosolve(caesar(PLAIN, 7), TABLE, { rng: mulberry32(1) });
    expect(result.best.cipher).toBe("Caesar");
    expect(result.best.keyLabel).toBe("shift 7");
    expect(result.best.plaintext).toBe(PLAIN);
    expect(result.attempts.some((a) => a.cipher === "Substitution")).toBe(
      false,
    );
  });

  it("identifies a keyword substitution cipher", () => {
    const ciphertext = substitution(PLAIN, "zebras", "encrypt");
    const result = autosolve(ciphertext, TABLE, { rng: mulberry32(2) });
    expect(result.best.cipher).toBe("Substitution");
    expect(result.best.plaintext).toBe(PLAIN);
  });

  it("identifies Vigenère ciphertext and recovers the key", () => {
    const result = autosolve(vigenere(PLAIN, "LEMON", "encrypt"), TABLE, {
      rng: mulberry32(3),
    });
    expect(result.best.cipher).toBe("Vigenère");
    expect(result.best.keyLabel).toBe("LEMON");
    expect(result.best.plaintext).toBe(PLAIN);
    expect(result.attempts.some((a) => a.cipher === "Polyalphabetic")).toBe(
      false,
    );
  });

  it("identifies Beaufort ciphertext and recovers the key", () => {
    const result = autosolve(beaufort(PLAIN, "SECRET"), TABLE, {
      rng: mulberry32(4),
    });
    expect(result.best.cipher).toBe("Beaufort");
    expect(result.best.keyLabel).toBe("SECRET");
    expect(result.best.plaintext).toBe(PLAIN);
  });

  it("identifies and breaks ciphertext autokey", () => {
    const ciphertext = autokey(PLAIN, "TYPEWRITER", "ciphertext", "encrypt");
    const result = autosolve(ciphertext, TABLE, { rng: mulberry32(8) });
    expect(result.best.cipher).toBe("Ciphertext autokey");
    expect(result.diagnostics.likelyFamily).toBe("ciphertext-autokey");
    let matches = 0;
    for (let i = 0; i < PLAIN.length; i += 1) {
      if (result.best.plaintext[i] === PLAIN[i]) {
        matches += 1;
      }
    }
    expect(matches / PLAIN.length).toBeGreaterThan(0.95);
  });

  it("recognizes text that is already readable English", () => {
    const result = autosolve(PLAIN, TABLE, { rng: mulberry32(5) });
    expect(result.alreadyEnglish).toBe(true);
  });

  it(
    "falls back to the general polyalphabetic solver",
    { timeout: 120000 },
    () => {
      const rng = mulberry32(6);
      const alphabets = Array.from({ length: 3 }, () => {
        const a = Array.from({ length: 26 }, (_, i) => i);
        for (let i = 25; i > 0; i -= 1) {
          const j = Math.floor(rng() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      });
      let column = 0;
      const ciphertext = [...PLAIN]
        .map((char) => {
          const upper = char.toUpperCase();
          if (upper < "A" || upper > "Z") {
            return char;
          }
          const value = alphabets[column % 3][upper.charCodeAt(0) - 65];
          column += 1;
          const output = String.fromCharCode(65 + value);
          return char === upper ? output : output.toLowerCase();
        })
        .join("");
      const result = autosolve(ciphertext, TABLE, { rng, restarts: 3 });
      expect(result.best.cipher).toBe("Polyalphabetic");
      let matches = 0;
      for (let i = 0; i < PLAIN.length; i += 1) {
        if (result.best.plaintext[i] === PLAIN[i]) {
          matches += 1;
        }
      }
      expect(matches / PLAIN.length).toBeGreaterThan(0.9);
    },
  );

  it("throws when the text has too few letters", () => {
    expect(() => autosolve("abc", TABLE, { rng: mulberry32(7) })).toThrow();
  });
});
