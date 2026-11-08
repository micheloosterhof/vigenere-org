// ABOUTME: Unit tests for word segmentation of decrypted text.
// ABOUTME: Uses the site's own word list, so the thresholds are tested against what the browser loads.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildWordModel, segment, splitWords } from "./segment";
import { vigenere } from "./cipher";

const model = buildWordModel(
  readFileSync(
    new URL("../../public/data/english-words.txt", import.meta.url),
    "utf8",
  )
    .split("\n")
    .filter((word) => word !== ""),
);

describe("splitWords", () => {
  it("splits classic plaintexts", () => {
    expect(splitWords("ATTACKATDAWN", model)).toBe("ATTACK AT DAWN");
    expect(splitWords("WEAREDISCOVEREDFLEEATONCE", model)).toBe(
      "WE ARE DISCOVERED FLEE AT ONCE",
    );
  });

  it("splits Kryptos K1 apart from its misspelling", () => {
    const k1 = splitWords(
      "BETWEENSUBTLESHADINGANDTHEABSENCEOFLIGHTLIESTHENUANCEOFIQLUSION",
      model,
    );
    expect(
      k1.startsWith("BETWEEN SUBTLE SHADING AND THE ABSENCE OF LIGHT"),
    ).toBe(true);
  });

  it("keeps case, punctuation, and words that are already spaced", () => {
    expect(splitWords("Hello there, attackatdawn!", model)).toBe(
      "Hello there, attack at dawn!",
    );
    expect(splitWords("information", model)).toBe("information");
  });

  it("leaves ciphertext alone", () => {
    const plain = "ITWASABRIGHTCOLDDAYINAPRILANDTHECLOCKSWERESTRIKINGTHIRTEEN";
    const ciphertext = vigenere(plain, "LEMON", "encrypt");
    expect(splitWords(ciphertext, model)).toBe(ciphertext);
    expect(splitWords("LXFOPVEFRNHR", model)).toBe("LXFOPVEFRNHR");
  });

  it("reports how much of the text it recognised", () => {
    expect(segment("ATTACKATDAWN", model).knownFraction).toBe(1);
    expect(segment("QWZXKJVBNMPL", model).knownFraction).toBeLessThan(0.5);
  });
});
