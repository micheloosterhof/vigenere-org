// ABOUTME: Unit tests for the Trifid cipher.
// ABOUTME: The vector is the FELIX MARIE DELASTELLE example from Wikipedia's "Trifid cipher".
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { trifid } from "./trifid";

describe("trifid", () => {
  it("encrypts the Wikipedia example with period 5", () => {
    expect(
      trifid(
        "aide-toi, le ciel t'aidera",
        "FELIX MARIE DELASTELLE",
        5,
        "encrypt",
      ),
    ).toBe("FMJFVOISSUFTFPUFEQQC");
  });

  it("decrypts the Wikipedia example", () => {
    expect(
      trifid("FMJFVOISSUFTFPUFEQQC", "FELIX MARIE DELASTELLE", 5, "decrypt"),
    ).toBe("AIDETOILECIELTAIDERA");
  });

  it("round-trips the 27th symbol and a whole-message period", () => {
    const ciphertext = trifid("MEET+AT+NOON", "KEYWORD", 0, "encrypt");
    expect(trifid(ciphertext, "KEYWORD", 0, "decrypt")).toBe("MEET+AT+NOON");
  });

  it("throws on a key with no letters", () => {
    expect(() => trifid("ABC", "123", 5, "encrypt")).toThrow();
  });
});
