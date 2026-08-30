// ABOUTME: Unit tests for the Playfair digraph cipher.
// ABOUTME: The encryption vector is the worked example from Wikipedia's "Playfair cipher" article.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { playfair } from "./playfair";

describe("playfair", () => {
  it("encrypts the Wikipedia test vector", () => {
    expect(
      playfair(
        "Hide the gold in the tree stump",
        "playfair example",
        "encrypt",
      ),
    ).toBe("BMODZBXDNABEKUDMUIXMMOUVIF");
  });

  it("decrypts the Wikipedia test vector to its prepared letters", () => {
    expect(
      playfair("BMODZBXDNABEKUDMUIXMMOUVIF", "playfair example", "decrypt"),
    ).toBe("HIDETHEGOLDINTHETREXESTUMP");
  });

  it("merges J into I", () => {
    expect(playfair("JAM", "KEYWORD", "encrypt")).toBe(
      playfair("IAM", "KEYWORD", "encrypt"),
    );
  });

  it("separates double letters and pads odd length with a filler", () => {
    const ciphertext = playfair("BALLOON", "KEYWORD", "encrypt");
    expect(ciphertext).toHaveLength(8);
    expect(playfair(ciphertext, "KEYWORD", "decrypt")).toBe("BALXLOON");
  });

  it("uses Q as the filler when the letter is X itself", () => {
    const ciphertext = playfair("XX", "KEYWORD", "encrypt");
    expect(playfair(ciphertext, "KEYWORD", "decrypt")).toBe("XQXQ");
  });

  it("throws on a key with no letters", () => {
    expect(() => playfair("HELLO", "", "encrypt")).toThrow();
  });

  it("throws when decrypting an odd number of letters", () => {
    expect(() => playfair("ABC", "KEYWORD", "decrypt")).toThrow();
  });
});
