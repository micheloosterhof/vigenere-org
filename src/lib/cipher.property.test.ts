// ABOUTME: Property-based round-trip tests: decrypting an encryption returns the original text.
// ABOUTME: Random texts and random keys, so edge cases fixed vectors miss are exercised.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { autokey, beaufort, caesar, substitution, vigenere } from "./cipher";
import { quagmire, type QuagmireVariant } from "./quagmire";

const join = (chars: string[]): string => chars.join("");
// Text drawn from letters, spaces, and common punctuation: enough to exercise
// case handling and non-letter passthrough without unicode uppercase quirks.
const text = fc
  .array(
    fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789,.!?-",
    ),
    {
      maxLength: 200,
    },
  )
  .map(join);
// A key that always contains at least one letter, as the ciphers require.
const key = fc
  .array(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    {
      minLength: 1,
      maxLength: 12,
    },
  )
  .map(join);
const indicator = fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ");

describe("round-trip properties", () => {
  it("Vigenère decrypts what it encrypts", () => {
    fc.assert(
      fc.property(text, key, (t, k) => {
        expect(vigenere(vigenere(t, k, "encrypt"), k, "decrypt")).toBe(t);
      }),
    );
  });

  it("Beaufort is its own inverse", () => {
    fc.assert(
      fc.property(text, key, (t, k) => {
        expect(beaufort(beaufort(t, k), k)).toBe(t);
      }),
    );
  });

  it("Caesar decrypts with the negated shift", () => {
    fc.assert(
      fc.property(text, fc.integer({ min: 0, max: 25 }), (t, s) => {
        expect(caesar(caesar(t, s), -s)).toBe(t);
      }),
    );
  });

  it("substitution decrypts what it encrypts", () => {
    fc.assert(
      fc.property(text, key, (t, k) => {
        expect(substitution(substitution(t, k, "encrypt"), k, "decrypt")).toBe(
          t,
        );
      }),
    );
  });

  it("plaintext and ciphertext autokey decrypt what they encrypt", () => {
    fc.assert(
      fc.property(
        text,
        key,
        fc.constantFrom("plaintext", "ciphertext") as fc.Arbitrary<
          "plaintext" | "ciphertext"
        >,
        (t, k, variant) => {
          expect(
            autokey(autokey(t, k, variant, "encrypt"), k, variant, "decrypt"),
          ).toBe(t);
        },
      ),
    );
  });

  it("Quagmire I-IV decrypt what they encrypt", () => {
    fc.assert(
      fc.property(
        text,
        fc.constantFrom(1, 2, 3, 4) as fc.Arbitrary<QuagmireVariant>,
        key,
        key,
        key,
        indicator,
        (t, variant, keyword, keyword2, periodKey, ind) => {
          const config = {
            variant,
            keyword,
            keyword2,
            key: periodKey,
            indicator: ind,
          };
          expect(
            quagmire(quagmire(t, config, "encrypt"), config, "decrypt"),
          ).toBe(t);
        },
      ),
    );
  });
});
