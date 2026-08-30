// ABOUTME: Unit tests for the rail fence transposition cipher and its breaker.
// ABOUTME: The encryption vector comes from the Wikipedia "Rail fence cipher" article.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { breakRailFence, railFence } from "./railfence";

const PLAIN =
  "It was a bright cold day in April, and the clocks were striking thirteen. " +
  "Winston Smith, his chin nuzzled into his breast in an effort to escape the " +
  "vile wind, slipped quickly through the glass doors of Victory Mansions.";

describe("railFence", () => {
  it("encrypts the Wikipedia test vector with three rails", () => {
    expect(railFence("WEAREDISCOVEREDFLEEATONCE", 3, "encrypt")).toBe(
      "WECRLTEERDSOEEFEAOCAIVDEN",
    );
  });

  it("decrypts the Wikipedia test vector", () => {
    expect(railFence("WECRLTEERDSOEEFEAOCAIVDEN", 3, "decrypt")).toBe(
      "WEAREDISCOVEREDFLEEATONCE",
    );
  });

  it("round-trips text with spaces and punctuation at several rail counts", () => {
    for (const rails of [2, 3, 5, 7]) {
      expect(
        railFence(railFence(PLAIN, rails, "encrypt"), rails, "decrypt"),
      ).toBe(PLAIN);
    }
  });

  it("leaves text unchanged with one rail", () => {
    expect(railFence(PLAIN, 1, "encrypt")).toBe(PLAIN);
    expect(railFence(PLAIN, 1, "decrypt")).toBe(PLAIN);
  });

  it("throws when the rail count is not a positive integer", () => {
    expect(() => railFence("ABC", 0, "encrypt")).toThrow();
    expect(() => railFence("ABC", 2.5, "encrypt")).toThrow();
  });
});

describe("breakRailFence", () => {
  it("recovers the rail count and plaintext from English text", () => {
    const ciphertext = railFence(PLAIN, 5, "encrypt");
    const [best] = breakRailFence(ciphertext);
    expect(best.rails).toBe(5);
    expect(best.plaintext).toBe(PLAIN);
  });

  it("ranks candidates for every tried rail count", () => {
    const candidates = breakRailFence(railFence(PLAIN, 3, "encrypt"));
    expect(candidates.length).toBeGreaterThan(5);
    expect(candidates[0].rails).toBe(3);
    for (let i = 1; i < candidates.length; i += 1) {
      expect(candidates[i].fitness).toBeLessThanOrEqual(
        candidates[i - 1].fitness,
      );
    }
  });
});
