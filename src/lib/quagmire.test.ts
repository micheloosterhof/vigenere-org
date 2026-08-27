// ABOUTME: Unit tests for the four Quagmire ciphers.
// ABOUTME: Vectors come from ACA sample ciphers and Kryptos K1, via the aldegonde test suite.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { quagmire } from "./quagmire";

const MOON =
  "DONTLETANYONETELLYOUTHESKYISTHELIMITWHENTHEREAREFOOTPRINTSONTHEMOON";

describe("quagmire 1", () => {
  it("encrypts and decrypts the aldegonde vector", () => {
    const config = {
      variant: 1,
      keyword: "PAULBRANDT",
      key: "BRANDT",
      indicator: "A",
    } as const;
    const ciphertext =
      "HIFUFCIRFKUYKYJPFQSSHZMMQONGKFKTNDQAWDJSKFKVJNHCLIRUCXOWHGUYIDJDUKG";
    expect(quagmire(MOON, config, "encrypt")).toBe(ciphertext);
    expect(quagmire(ciphertext, config, "decrypt")).toBe(MOON);
  });

  it("encrypts the ACA sample", () => {
    const config = {
      variant: 1,
      keyword: "SPRINGFEVER",
      key: "FLOWER",
      indicator: "A",
    } as const;
    const plaintext =
      "THEQUAGONEISAPERIODICCIPHERWITHAKEYEDPLAINALPHABETRUNAGAINSTASTRAIGHTCIPHERALPHABET";
    const ciphertext =
      "QPMGQRBUJUYIFDMPYAIFQYYJJJHJYCJLUUTPIDVWYMFSGAESDWHIZRBLIRVCFCZPELBPZYYJJJHWLJJLPUP";
    expect(quagmire(plaintext, config, "encrypt")).toBe(ciphertext);
  });
});

describe("quagmire 2", () => {
  it("encrypts and decrypts the aldegonde vector", () => {
    const config = {
      variant: 2,
      keyword: "PAULBRANDT",
      key: "BRANDT",
      indicator: "C",
    } as const;
    const ciphertext =
      "RMGXKEVLGUQQNWLJKBKXOFCYGADWYHNIDKHZYELMYHNSLBWEDMHXSXEKOWQQVELKQSJ";
    expect(quagmire(MOON, config, "encrypt")).toBe(ciphertext);
    expect(quagmire(ciphertext, config, "decrypt")).toBe(MOON);
  });
});

describe("quagmire 3", () => {
  it("encrypts and decrypts Kryptos K1", () => {
    const config = {
      variant: 3,
      keyword: "KRYPTOS",
      key: "PALIMPSEST",
      indicator: "K",
    } as const;
    const plaintext =
      "BETWEENSUBTLESHADINGANDTHEABSENCEOFLIGHTLIESTHENUANCEOFIQLUSION";
    const ciphertext =
      "EMUFPHZLRFAXYUSDJKZLDKRNSHGNFIVJYQTQUXQBQVYUVLLTREVJYQTMKYRDMFD";
    expect(quagmire(plaintext, config, "encrypt")).toBe(ciphertext);
    expect(quagmire(ciphertext, config, "decrypt")).toBe(plaintext);
  });

  it("encrypts the aldegonde vector keyed with PAULBRANDT", () => {
    const config = {
      variant: 3,
      keyword: "PAULBRANDT",
      key: "BRANDT",
      indicator: "P",
    } as const;
    const ciphertext =
      "FXDIEOGNDBZIIHFCENWDCQMUSLJPJVITJXVKPOFGJVIEFDGOJXQIDHOFCPZIGOFXZPE";
    expect(quagmire(MOON, config, "encrypt")).toBe(ciphertext);
  });
});

describe("quagmire 4", () => {
  it("encrypts and decrypts the aldegonde vector", () => {
    const config = {
      variant: 4,
      keyword: "PAULBRANDT",
      keyword2: "BRANDT",
      key: "COUNTRY",
      indicator: "P",
    } as const;
    const ciphertext =
      "KFBIFICEWQVIICOSXRXNCSBLSNMQLNDCSQJLJEKIGIOVDDHIGYFANHMDLHJGKLFXFJG";
    expect(quagmire(MOON, config, "encrypt")).toBe(ciphertext);
    expect(quagmire(ciphertext, config, "decrypt")).toBe(MOON);
  });

  it("encrypts the ACA sample with three keywords", () => {
    const config = {
      variant: 4,
      keyword: "SENSORY",
      keyword2: "PERCEPTION",
      key: "EXTRA",
      indicator: "S",
    } as const;
    expect(quagmire("THISONEEMPLOYSTHREEKEYWORDS", config, "encrypt")).toBe(
      "VBMRFCYISPMPBRRHEICXRREIGDX",
    );
  });
});

describe("quagmire input handling", () => {
  it("preserves case and passes non-letters through", () => {
    const config = {
      variant: 3,
      keyword: "KRYPTOS",
      key: "PALIMPSEST",
      indicator: "K",
    } as const;
    const encrypted = quagmire("Between subtle!", config, "encrypt");
    expect(encrypted).toBe("Emufphz lrfaxy!");
    expect(quagmire(encrypted, config, "decrypt")).toBe("Between subtle!");
  });

  it("throws on an empty alphabet keyword, empty key, or bad indicator", () => {
    expect(() =>
      quagmire(
        "ABC",
        { variant: 3, keyword: "", key: "KEY", indicator: "A" },
        "encrypt",
      ),
    ).toThrow();
    expect(() =>
      quagmire(
        "ABC",
        { variant: 3, keyword: "WORD", key: "", indicator: "A" },
        "encrypt",
      ),
    ).toThrow();
    expect(() =>
      quagmire(
        "ABC",
        { variant: 3, keyword: "WORD", key: "KEY", indicator: "42" },
        "encrypt",
      ),
    ).toThrow();
  });

  it("throws when variant 4 is missing its second keyword", () => {
    expect(() =>
      quagmire(
        "ABC",
        { variant: 4, keyword: "WORD", key: "KEY", indicator: "A" },
        "encrypt",
      ),
    ).toThrow();
  });
});
