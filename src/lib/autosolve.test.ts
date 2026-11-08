// ABOUTME: Unit tests for the automatic cipher identification and breaking pipeline.
// ABOUTME: Feeds each cipher family's output in and checks the route and recovery.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  atbash,
  autokey,
  beaufort,
  caesar,
  porta,
  substitution,
  vigenere,
} from "./cipher";
import { affine } from "./affine";
import { routeCipher } from "./route";
import { railFence } from "./railfence";
import { columnarTransposition } from "./transposition";
import { quagmire } from "./quagmire";
import { autosolve } from "./autosolve";
import { breakPolyalphabetic } from "./solve-polyalphabetic";

const WORDS = readFileSync(
  new URL("../../public/data/english-words.txt", import.meta.url),
  "utf8",
)
  .split("\n")
  .filter((word) => word !== "");

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
  it("identifies affine ciphertext and links to the affine tool", async () => {
    const result = await autosolve(affine(PLAIN, 7, 3, "encrypt"), TABLE, {
      rng: mulberry32(1),
    });
    expect(result.best.cipher).toBe("Affine");
    expect(result.best.keyLabel).toBe("a = 7, b = 3");
    expect(result.best.plaintext).toBe(PLAIN);
    expect(result.best.href).toContain("/affine/");
  });

  it("does not offer affine as a duplicate of Caesar", async () => {
    const result = await autosolve(caesar(PLAIN, 7), TABLE, {
      rng: mulberry32(1),
    });
    expect(result.attempts.map((a) => a.cipher)).not.toContain("Affine");
  });

  it("identifies Porta ciphertext", async () => {
    const result = await autosolve(porta(PLAIN, "FORTIFICATION"), TABLE, {
      rng: mulberry32(1),
    });
    expect(result.best.cipher).toBe("Porta");
    expect(result.best.plaintext).toBe(PLAIN);
  });

  it("identifies a route cipher", async () => {
    const letters = PLAIN.toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 300);
    const result = await autosolve(
      routeCipher(letters, 12, "rows", "spiral-cw-tl", "encrypt"),
      TABLE,
      { rng: mulberry32(1) },
    );
    expect(result.best.cipher).toBe("Route");
    expect(result.best.plaintext).toBe(letters);
  });

  it("identifies Caesar ciphertext without running the substitution climb", async () => {
    const result = await autosolve(caesar(PLAIN, 7), TABLE, {
      rng: mulberry32(1),
    });
    expect(result.best.cipher).toBe("Caesar");
    expect(result.best.keyLabel).toBe("shift 7");
    expect(result.best.plaintext).toBe(PLAIN);
    expect(result.attempts.some((a) => a.cipher === "Substitution")).toBe(
      false,
    );
  });

  it("identifies Atbash ciphertext without running the substitution climb", async () => {
    const result = await autosolve(atbash(PLAIN), TABLE, {
      rng: mulberry32(9),
    });
    expect(result.best.cipher).toBe("Atbash");
    expect(result.best.plaintext).toBe(PLAIN);
    expect(result.attempts.some((a) => a.cipher === "Substitution")).toBe(
      false,
    );
  });

  it("identifies rail fence ciphertext without running the substitution climb", async () => {
    const result = await autosolve(railFence(PLAIN, 5, "encrypt"), TABLE, {
      rng: mulberry32(10),
    });
    expect(result.best.cipher).toBe("Rail fence");
    expect(result.best.keyLabel).toBe("5 rails");
    expect(result.best.plaintext).toBe(PLAIN);
    expect(result.attempts.some((a) => a.cipher === "Substitution")).toBe(
      false,
    );
  });

  it("identifies columnar transposition ciphertext", async () => {
    const letters = PLAIN.toUpperCase().replace(/[^A-Z]/g, "");
    const result = await autosolve(
      columnarTransposition(letters, "SECRET", "encrypt"),
      TABLE,
      { rng: mulberry32(11) },
    );
    expect(result.best.cipher).toBe("Columnar transposition");
    // Orders differing only at the text's edges tie on bigram fitness, so
    // recovery may rotate a few letters past the seam; the body must be intact.
    expect(result.best.plaintext).toContain(letters.slice(4, -4));
    expect(result.best.plaintext).toHaveLength(letters.length);
  });

  it(
    "identifies a Quagmire III cipher through the keyword dictionary",
    { timeout: 60000 },
    async () => {
      const ciphertext = quagmire(
        PLAIN,
        { variant: 3, keyword: "SPRING", key: "TALE", indicator: "A" },
        "encrypt",
      );
      const result = await autosolve(ciphertext, TABLE, {
        rng: mulberry32(12),
        words: WORDS,
      });
      expect(result.best.cipher).toBe("Quagmire III");
      expect(result.best.keyLabel).toBe("keyword SPRING, key TALE");
      expect(result.best.plaintext).toBe(PLAIN);
      expect(result.attempts.some((a) => a.cipher === "Polyalphabetic")).toBe(
        false,
      );
    },
  );

  it("identifies a keyword substitution cipher", async () => {
    const ciphertext = substitution(PLAIN, "zebras", "encrypt");
    const result = await autosolve(ciphertext, TABLE, { rng: mulberry32(2) });
    expect(result.best.cipher).toBe("Substitution");
    expect(result.best.plaintext).toBe(PLAIN);
  });

  it("identifies Vigenère ciphertext and recovers the key", async () => {
    const result = await autosolve(vigenere(PLAIN, "LEMON", "encrypt"), TABLE, {
      rng: mulberry32(3),
    });
    expect(result.best.cipher).toBe("Vigenère");
    expect(result.best.keyLabel).toBe("LEMON");
    expect(result.best.plaintext).toBe(PLAIN);
    expect(result.attempts.some((a) => a.cipher === "Polyalphabetic")).toBe(
      false,
    );
  });

  // 80 letters under a 6-letter key: the raw IoC drifts above the
  // monoalphabetic threshold by noise and the period scan is too short to
  // score period 6, so the routing statistics alone would never try Vigenère.
  it("breaks a short Vigenère whose statistics look monoalphabetic", async () => {
    const text =
      "GLSTO EBYUZ YZZTU TUDJS OZWSF KSUUN FEHUT OTNCZ " +
      "HZZKQ NAEDF OJOYT KHKEO NJXKA CFKUT YAWZW KCLYF";
    const result = await autosolve(text, TABLE, {
      rng: mulberry32(9),
      words: WORDS,
    });
    expect(result.best.cipher).toBe("Vigenère");
    expect(result.best.keyLabel).toBe("FRUGAL");
    expect(result.best.plaintext).toBe(
      "BUYNO TWHAT YOUCA NUSEB UTWHA TYOUC ANNOT DOWIT " +
        "HOUTW HATYO UDONO TNEED ISDEA RATAN YPRIC ECATO",
    );
  });

  // Four letters per key column: the bigram vote misses one key letter and
  // the quadgram polish puts it right.
  it("polishes a short Vigenère key with quadgrams", async () => {
    const result = await autosolve("aozpbfptemjrxdpgwmjgsynl", TABLE, {
      rng: mulberry32(5),
      words: WORDS,
    });
    expect(result.best.cipher).toBe("Vigenère");
    expect(result.best.keyLabel).toBe("PALFFY");
    expect(result.best.plaintext).toBe("lookwhatthetidebroughtin");
  });

  // The links use the same query parameters the tool pages read back, so each
  // one opens its tool with the ciphertext and recovered key already filled in.
  const attemptNamed = (
    result: Awaited<ReturnType<typeof autosolve>>,
    cipher: string,
  ): { href: string; keyLabel: string } => {
    const attempt = result.attempts.find((a) => a.cipher === cipher);
    if (!attempt) {
      throw new Error(`no ${cipher} attempt`);
    }
    return attempt;
  };
  const urlText = (text: string): string =>
    encodeURIComponent(text).replace(/%20/g, "+");

  it("links every attempt to its tool page with the text and key filled in", async () => {
    const text = "GLSTO EBYUZ YZZTU TUDJS OZWSF KSUUN FEHUT OTNCZ";
    const result = await autosolve(text, TABLE, {
      rng: mulberry32(9),
      words: WORDS,
    });
    const encoded = urlText(text);
    const vig = attemptNamed(result, "Vigenère");
    expect(vig.href).toBe(
      `/vigenere/?text=${encoded}&key=${vig.keyLabel}&mode=decrypt`,
    );
    const beau = attemptNamed(result, "Beaufort");
    expect(beau.href).toBe(
      `/beaufort/?text=${encoded}&key=${beau.keyLabel}&mode=decrypt`,
    );
    const shift = attemptNamed(result, "Caesar");
    expect(shift.href).toBe(
      `/caesar/?text=${encoded}&shift=${shift.keyLabel.replace("shift ", "")}&mode=decrypt`,
    );
    expect(attemptNamed(result, "Atbash").href).toBe(
      `/atbash/?text=${encoded}&mode=decrypt`,
    );

    // The substitution climb only runs once nothing cheaper reads as English.
    const substituted = substitution(PLAIN, "zebras", "encrypt");
    const sub = attemptNamed(
      await autosolve(substituted, TABLE, { rng: mulberry32(2) }),
      "Substitution",
    );
    expect(sub.href).toBe(
      `/substitution/?text=${urlText(substituted)}&key=${sub.keyLabel}&mode=decrypt`,
    );
  });

  it(
    "links transposition, Quagmire and autokey attempts with their keys",
    { timeout: 60000 },
    async () => {
      const letters = PLAIN.toUpperCase().replace(/[^A-Z]/g, "");
      const transposedText = columnarTransposition(
        letters,
        "SECRET",
        "encrypt",
      );
      const transposed = await autosolve(transposedText, TABLE, {
        rng: mulberry32(11),
      });
      const columnar = attemptNamed(transposed, "Columnar transposition");
      expect(columnar.href).toBe(
        `/transposition/?text=${transposedText}&key=${columnar.keyLabel}&mode=decrypt`,
      );
      const rail = attemptNamed(transposed, "Rail fence");
      expect(rail.href).toBe(
        `/railfence/?text=${transposedText}&rails=${rail.keyLabel.replace(" rails", "")}&mode=decrypt`,
      );

      const quagmireText = quagmire(
        PLAIN,
        { variant: 3, keyword: "SPRING", key: "TALE", indicator: "A" },
        "encrypt",
      );
      const quag = await autosolve(quagmireText, TABLE, {
        rng: mulberry32(12),
        words: WORDS,
      });
      expect(attemptNamed(quag, "Quagmire III").href).toBe(
        `/quagmire/?text=${urlText(quagmireText)}&variant=3&keyword=SPRING&key=TALE&indicator=A&mode=decrypt`,
      );

      const autokeyText = autokey(PLAIN, "QUEEN", "ciphertext", "encrypt");
      const auto = await autosolve(autokeyText, TABLE, { rng: mulberry32(5) });
      expect(attemptNamed(auto, "Ciphertext autokey").href).toBe(
        `/autokey/?text=${urlText(autokeyText)}&mode=break`,
      );
    },
  );

  it("identifies Beaufort ciphertext and recovers the key", async () => {
    const result = await autosolve(beaufort(PLAIN, "SECRET"), TABLE, {
      rng: mulberry32(4),
    });
    expect(result.best.cipher).toBe("Beaufort");
    expect(result.best.keyLabel).toBe("SECRET");
    expect(result.best.plaintext).toBe(PLAIN);
  });

  it("identifies and breaks ciphertext autokey", async () => {
    const ciphertext = autokey(PLAIN, "TYPEWRITER", "ciphertext", "encrypt");
    const result = await autosolve(ciphertext, TABLE, { rng: mulberry32(8) });
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

  it(
    "identifies and breaks plaintext autokey",
    { timeout: 60000 },
    async () => {
      const ciphertext = autokey(PLAIN, "SECRET", "plaintext", "encrypt");
      const result = await autosolve(ciphertext, TABLE, { rng: mulberry32(9) });
      expect(result.best.cipher).toBe("Plaintext autokey");
      expect(result.best.plaintext).toBe(PLAIN);
    },
  );

  it("recognizes text that is already readable English", async () => {
    const result = await autosolve(PLAIN, TABLE, { rng: mulberry32(5) });
    expect(result.alreadyEnglish).toBe(true);
  });

  /** PLAIN under three independent random alphabets, drawn from `rng`. */
  const randomPolyalphabetic = (rng: () => number): string => {
    const alphabets = Array.from({ length: 3 }, () => {
      const a = Array.from({ length: 26 }, (_, i) => i);
      for (let i = 25; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    });
    let column = 0;
    return [...PLAIN]
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
  };

  it("runs the polyalphabetic fallback through the solver it is given", async () => {
    const ciphertext = randomPolyalphabetic(mulberry32(6));
    const periods: (number | undefined)[] = [];
    const result = await autosolve(ciphertext, TABLE, {
      solvePolyalphabetic: async (text, table, options) => {
        periods.push(options.period);
        return breakPolyalphabetic(text, table, {
          ...options,
          rng: mulberry32(1),
        });
      },
    });
    expect(periods).toEqual([3]);
    expect(result.best.cipher).toBe("Polyalphabetic");
    expect(result.best.plaintext.startsWith("It was a bright")).toBe(true);
  });

  it(
    "falls back to the general polyalphabetic solver",
    { timeout: 120000 },
    async () => {
      const rng = mulberry32(6);
      const ciphertext = randomPolyalphabetic(rng);
      const result = await autosolve(ciphertext, TABLE, { rng, restarts: 3 });
      expect(result.best.cipher).toBe("Polyalphabetic");
      expect(result.best.href).toBe(
        `/polyalphabetic/?text=${encodeURIComponent(ciphertext).replace(/%20/g, "+")}&period=3&mode=break`,
      );
      let matches = 0;
      for (let i = 0; i < PLAIN.length; i += 1) {
        if (result.best.plaintext[i] === PLAIN[i]) {
          matches += 1;
        }
      }
      expect(matches / PLAIN.length).toBeGreaterThan(0.9);
    },
  );

  it("cracks a Caesar shorter than one alphabet", async () => {
    const result = await autosolve("FRQILGHQWLDO UHSRUW", TABLE, {
      rng: mulberry32(7),
    });
    expect(result.best.cipher).toBe("Caesar");
    expect(result.best.keyLabel).toBe("shift 3");
    expect(result.best.plaintext).toBe("CONFIDENTIAL REPORT");
  });

  it("reports its best guess for short text instead of crashing", async () => {
    const result = await autosolve("PJLWRJYQIVDJACQSYWMSD", TABLE, {
      rng: mulberry32(9),
    });
    expect(result.attempts.length).toBeGreaterThan(0);
    expect(
      result.attempts.some((a) => a.cipher.toLowerCase().includes("autokey")),
    ).toBe(false);
  });

  it("throws when the text has too few letters", async () => {
    await expect(
      autosolve("abc", TABLE, { rng: mulberry32(8) }),
    ).rejects.toThrow();
  });
});
