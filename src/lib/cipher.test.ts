// ABOUTME: Unit tests for the cipher core: Vigenere, Beaufort, and Caesar.
// ABOUTME: Uses externally validated test vectors from Wikipedia and practicalcryptography.com.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { beaufort, caesar, vigenere } from "./cipher";

describe("vigenere", () => {
  it("encrypts the Wikipedia test vector", () => {
    expect(vigenere("ATTACKATDAWN", "LEMON", "encrypt")).toBe("LXFOPVEFRNHR");
  });

  it("decrypts the Wikipedia test vector", () => {
    expect(vigenere("LXFOPVEFRNHR", "LEMON", "decrypt")).toBe("ATTACKATDAWN");
  });

  it("preserves case and passes non-letters through without advancing the key", () => {
    expect(vigenere("Attack at dawn!", "lemon", "encrypt")).toBe("Lxfopv ef rnhr!");
  });

  it("normalizes the key to letters only", () => {
    expect(vigenere("ATTACKATDAWN", "le mo-n1", "encrypt")).toBe("LXFOPVEFRNHR");
  });

  it("throws on a key with no letters", () => {
    expect(() => vigenere("ATTACK", "123", "encrypt")).toThrow();
    expect(() => vigenere("ATTACK", "", "encrypt")).toThrow();
  });

  it("round-trips arbitrary text", () => {
    const text = "The quick brown fox jumps over the lazy dog, 42 times.";
    expect(vigenere(vigenere(text, "Secret", "encrypt"), "Secret", "decrypt")).toBe(text);
  });
});

describe("beaufort", () => {
  it("encrypts the practicalcryptography test vector", () => {
    expect(beaufort("DEFENDTHEEASTWALLOFTHECASTLE", "FORTIFICATION")).toBe(
      "CKMPVCPVWPIWUJOGIUAPVWRIWUUK",
    );
  });

  it("is reciprocal: applying it twice returns the input", () => {
    const text = "Attack at dawn!";
    expect(beaufort(beaufort(text, "key"), "key")).toBe(text);
  });

  it("throws on a key with no letters", () => {
    expect(() => beaufort("ATTACK", "")).toThrow();
  });
});

describe("caesar", () => {
  it("shifts letters preserving case and punctuation", () => {
    expect(caesar("Hello, World!", 3)).toBe("Khoor, Zruog!");
  });

  it("decrypts with a negative shift", () => {
    expect(caesar("Khoor, Zruog!", -3)).toBe("Hello, World!");
  });

  it("applies ROT13 twice as identity", () => {
    expect(caesar(caesar("Hello", 13), 13)).toBe("Hello");
  });

  it("wraps shifts outside 0-25", () => {
    expect(caesar("abc", 27)).toBe("bcd");
    expect(caesar("abc", 0)).toBe("abc");
  });
});
