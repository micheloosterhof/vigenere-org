// ABOUTME: Unit tests for the route cipher and its breaker.
// ABOUTME: The vector is the spiral example from Wikipedia's "Transposition cipher" (route cipher section).
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { breakRoute, ROUTES, routeCipher, type Route } from "./route";

// Wikipedia writes WE ARE DISCOVERED. FLEE AT ONCE down the columns of a
// three-row grid, filling the last column with the nulls J and X.
const WIKIPEDIA_PLAIN = "WEAREDISCOVEREDFLEEATONCEJX";

describe("routeCipher", () => {
  it("reads the Wikipedia grid in a clockwise spiral from the top right", () => {
    expect(
      routeCipher(WIKIPEDIA_PLAIN, 9, "columns", "spiral-cw-tr", "encrypt"),
    ).toBe("EJXCTEDECDAEWRIORFEONALEVSE");
  });

  it("decrypts the Wikipedia example", () => {
    expect(
      routeCipher(
        "EJXCTEDECDAEWRIORFEONALEVSE",
        9,
        "columns",
        "spiral-cw-tr",
        "decrypt",
      ),
    ).toBe(WIKIPEDIA_PLAIN);
  });

  it("round-trips every route and fill, padding with X", () => {
    const plain = "THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG";
    for (const route of Object.keys(ROUTES) as Route[]) {
      for (const fill of ["rows", "columns"] as const) {
        const ciphertext = routeCipher(plain, 6, fill, route, "encrypt");
        expect(ciphertext).toHaveLength(36);
        expect(routeCipher(ciphertext, 6, fill, route, "decrypt")).toBe(
          plain + "X",
        );
      }
    }
  });

  it("visits every cell exactly once on non-square grids", () => {
    const plain = "ABCDEFGHIJKLMNOPQRSTU";
    for (const route of Object.keys(ROUTES) as Route[]) {
      const ciphertext = routeCipher(plain, 7, "rows", route, "encrypt");
      expect([...ciphertext].sort().join("")).toBe(plain);
    }
  });

  it("rejects ciphertext that does not fill the grid", () => {
    expect(() => routeCipher("ABCDE", 3, "rows", "rows", "decrypt")).toThrow();
  });
});

describe("breakRoute", () => {
  it("recovers a spiral route from English text", () => {
    const plain =
      "ITWASABRIGHTCOLDDAYINAPRILANDTHECLOCKSWERESTRIKINGTHIRTEENWINSTONSMITH";
    const ciphertext = routeCipher(
      plain,
      10,
      "rows",
      "spiral-ccw-bl",
      "encrypt",
    );
    const [best] = breakRoute(ciphertext);
    expect(best.plaintext).toBe(plain);
  });

  it("explains a prime letter count", () => {
    expect(() => breakRoute("ABCDEFG")).toThrow(/prime/);
  });
});
