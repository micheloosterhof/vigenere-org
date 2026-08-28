// ABOUTME: Tests for the cipher diagnostics: statistical measures used to identify cipher type.
// ABOUTME: Grounds normalized IoC, period detection, and autokey detectors against known ciphertext.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { autokey, beaufort, substitution, vigenere } from "./cipher";
import {
  analyze,
  chiSquaredUniform,
  conditionalIoc,
  deltaStreamIoc,
  iocPerPeriod,
  normalizedIoc,
  shannonEntropy,
} from "./diagnostics";

const ENGLISH =
  "It was a bright cold day in April and the clocks were striking thirteen " +
  "Winston Smith his chin nuzzled into his breast in an effort to escape the " +
  "vile wind slipped quickly through the glass doors of Victory Mansions though " +
  "not quickly enough to prevent a swirl of gritty dust from entering along with " +
  "him The hallway smelt of boiled cabbage and old rag mats At one end of it a " +
  "coloured poster too large for indoor display had been tacked to the wall";

const RANDOM =
  "XQJZKVBPYWGFMCLDNRSTHUAOIEXQJZKVBPYWGFMCLDNRSTHUAOIEXQJZKVBPYWGFMCLDNRSTHUAOIE";

describe("normalizedIoc", () => {
  it("is near 1.7 for English and near 1.0 for random letters", () => {
    expect(normalizedIoc(ENGLISH, 1)).toBeGreaterThan(1.4);
    expect(normalizedIoc(RANDOM, 1)).toBeLessThan(1.2);
  });

  it("is preserved by monoalphabetic substitution", () => {
    const plain = normalizedIoc(ENGLISH, 1);
    const cipher = normalizedIoc(substitution(ENGLISH, "zebras", "encrypt"), 1);
    expect(cipher).toBeCloseTo(plain, 5);
  });

  it("drops toward 1.0 under a polyalphabetic cipher", () => {
    expect(
      normalizedIoc(vigenere(ENGLISH, "LEMON", "encrypt"), 1),
    ).toBeLessThan(1.25);
  });
});

describe("iocPerPeriod", () => {
  it("finds the key length of a Vigenère cipher", () => {
    const result = iocPerPeriod(vigenere(ENGLISH, "LEMON", "encrypt"), 12);
    expect(result.period).toBe(5);
  });

  it("finds the key length of a Beaufort cipher", () => {
    const result = iocPerPeriod(beaufort(ENGLISH, "SECRET"), 12);
    expect(result.period).toBe(6);
  });

  it("reports period 1 for monoalphabetic text", () => {
    expect(
      iocPerPeriod(substitution(ENGLISH, "zebras", "encrypt"), 12).period,
    ).toBe(1);
  });
});

describe("conditionalIoc and deltaStreamIoc detect ciphertext autokey", () => {
  it("elevates for ciphertext autokey at the primer-length lag", () => {
    const cipher = autokey(ENGLISH, "TYPEWRITER", "ciphertext", "encrypt");
    const delta = deltaStreamIoc(cipher, 10, "sub");
    const conditional = conditionalIoc(cipher, 10);
    expect(delta).toBeGreaterThan(1.4);
    expect(conditional).toBeGreaterThan(1.3);
  });

  it("stays near 1.0 for a Vigenère cipher", () => {
    const cipher = vigenere(ENGLISH, "LEMON", "encrypt");
    for (let lag = 1; lag <= 12; lag += 1) {
      expect(deltaStreamIoc(cipher, lag, "sub")).toBeLessThan(1.2);
    }
  });
});

describe("shannonEntropy", () => {
  it("is higher for random text than for English", () => {
    expect(shannonEntropy(RANDOM)).toBeGreaterThan(shannonEntropy(ENGLISH));
  });
});

describe("chiSquaredUniform", () => {
  it("is far from uniform for English and near uniform for a Vigenère cipher", () => {
    expect(chiSquaredUniform(ENGLISH)).toBeGreaterThan(
      chiSquaredUniform(vigenere(ENGLISH, "LEMON", "encrypt")),
    );
  });
});

describe("analyze", () => {
  it("classifies a Vigenère cipher as periodic polyalphabetic", () => {
    const report = analyze(vigenere(ENGLISH, "LEMON", "encrypt"));
    expect(report.period).toBe(5);
    expect(report.likelyFamily).toBe("periodic");
  });

  it("classifies monoalphabetic text as monoalphabetic", () => {
    const report = analyze(substitution(ENGLISH, "zebras", "encrypt"));
    expect(report.likelyFamily).toBe("monoalphabetic");
  });

  it("flags ciphertext autokey", () => {
    const report = analyze(
      autokey(ENGLISH, "TYPEWRITER", "ciphertext", "encrypt"),
    );
    expect(report.likelyFamily).toBe("ciphertext-autokey");
    expect(report.autokeyLag).toBe(10);
  });

  it("throws on text with too few letters", () => {
    expect(() => analyze("ab")).toThrow();
  });
});
