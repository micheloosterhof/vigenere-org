// ABOUTME: Tests for the Quagmire III keyword dictionary attack.
// ABOUTME: Uses short ciphertext the statistical solver cannot touch; keywords come from the shipped word list.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { quagmire } from "./quagmire";
import { breakQuagmireDictionary } from "./solve-quagmire-dictionary";

const TABLE = new Uint8Array(
  readFileSync(
    new URL("../../public/data/english-quadgrams.bin", import.meta.url),
  ),
);

const WORDS = readFileSync(
  new URL("../../public/data/english-words.txt", import.meta.url),
  "utf8",
)
  .split("\n")
  .filter((word) => word !== "");

// About 130 letters: far too short for the general solver, which needs
// roughly two hundred letters per key position.
const SHORT =
  "It was a bright cold day in April, and the clocks were striking thirteen. " +
  "Winston Smith, his chin nuzzled into his breast in an effort to escape " +
  "the vile wind.";

describe("breakQuagmireDictionary", () => {
  it(
    "breaks a short Quagmire III whose keyword is in the dictionary",
    { timeout: 60000 },
    () => {
      const ciphertext = quagmire(
        SHORT,
        { variant: 3, keyword: "SPRING", key: "TALE", indicator: "A" },
        "encrypt",
      );
      const result = breakQuagmireDictionary(ciphertext, WORDS, TABLE);
      expect(result.found).toBe(true);
      expect(result.variant).toBe(3);
      expect(result.keyword).toBe("SPRING");
      expect(result.period).toBe(4);
      expect(result.plaintext).toBe(SHORT);
      expect(result.key).toBe("TALE");
    },
  );

  it("breaks the Quagmire I and II variants too", { timeout: 60000 }, () => {
    for (const variant of [1, 2] as const) {
      const ciphertext = quagmire(
        SHORT,
        { variant, keyword: "SPRING", key: "TALE", indicator: "A" },
        "encrypt",
      );
      const result = breakQuagmireDictionary(ciphertext, WORDS, TABLE);
      expect(result.found).toBe(true);
      expect(result.variant).toBe(variant);
      expect(result.keyword).toBe("SPRING");
      expect(result.plaintext).toBe(SHORT);
      expect(result.key).toBe("TALE");
    }
  });

  it(
    "reports not found when the keyword is outside the dictionary",
    { timeout: 60000 },
    () => {
      const ciphertext = quagmire(
        SHORT,
        { variant: 3, keyword: "KRYPTOS", key: "TALE", indicator: "A" },
        "encrypt",
      );
      expect(breakQuagmireDictionary(ciphertext, WORDS, TABLE).found).toBe(
        false,
      );
    },
  );

  it("reports search progress", { timeout: 60000 }, () => {
    const ciphertext = quagmire(
      SHORT,
      { variant: 3, keyword: "SPRING", key: "TALE", indicator: "A" },
      "encrypt",
    );
    const seen: number[] = [];
    breakQuagmireDictionary(ciphertext, WORDS, TABLE, {
      onProgress: (done, total) => {
        seen.push(done);
        expect(total).toBe(WORDS.length);
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(WORDS.length);
  });

  it("honours a fixed key length", { timeout: 60000 }, () => {
    const ciphertext = quagmire(
      SHORT,
      { variant: 3, keyword: "SPRING", key: "TALE", indicator: "A" },
      "encrypt",
    );
    const result = breakQuagmireDictionary(ciphertext, WORDS, TABLE, {
      period: 4,
    });
    expect(result.found).toBe(true);
    expect(result.keyword).toBe("SPRING");
    expect(result.period).toBe(4);
  });

  it("throws on text with too few letters", () => {
    expect(() => breakQuagmireDictionary("ABC", WORDS, TABLE)).toThrow();
  });
});
