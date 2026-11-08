// ABOUTME: Unit tests for the Bifid cipher.
// ABOUTME: Vectors are Wikipedia's "Bifid cipher" example and pycipher 0.5.2's tests/test_bifid.py.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { bifid } from "./bifid";

const PLAIN = "abcdefghiiklmnopqrstuvwxyzabcdefghiiklmnopqrstuvwxyz";

describe("bifid", () => {
  it("encrypts the Wikipedia example over the whole message", () => {
    expect(
      bifid("FLEE AT ONCE", "BGWKZQPNDSIOAXEFCLUMTHYVR", 0, "encrypt"),
    ).toBe("UAEOLWRINS");
  });

  it("decrypts the Wikipedia example", () => {
    expect(bifid("UAEOLWRINS", "BGWKZQPNDSIOAXEFCLUMTHYVR", 0, "decrypt")).toBe(
      "FLEEATONCE",
    );
  });

  it("matches pycipher's vectors with periods 5 and 6", () => {
    const vectors: [string, number, string][] = [
      [
        "tgcmpfyxuiewdhbzrvalknqso",
        5,
        "VCHQEFWFUOSPKSIPLPWZUWUWWAEELDWCFGLIZOPRKSOQUGVFVXUF",
      ],
      [
        "ezrxdkuatgvncmiwhsqpyfblo",
        6,
        "GVDCIZTCGFOXCLWHOSHAWMKXYGVZCIDTCZFOGCLXHOWHASMKWYXZ",
      ],
    ];
    for (const [key, period, ciphertext] of vectors) {
      expect(bifid(PLAIN, key, period, "encrypt")).toBe(ciphertext);
      expect(bifid(ciphertext, key, period, "decrypt")).toBe(
        PLAIN.toUpperCase(),
      );
    }
  });

  it("round-trips with a keyword, merging J into I", () => {
    const ciphertext = bifid("Jump over the fence", "SECRET", 7, "encrypt");
    expect(bifid(ciphertext, "SECRET", 7, "decrypt")).toBe("IUMPOVERTHEFENCE");
  });

  it("rejects a negative period", () => {
    expect(() => bifid("ABC", "KEY", -1, "encrypt")).toThrow();
  });
});
