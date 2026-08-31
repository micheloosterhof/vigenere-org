// ABOUTME: Tests for building the shareable deep-link query string from form state.
// ABOUTME: Round-trips through URLSearchParams to prove links parse back losslessly.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { shareSearch } from "./share-url";

describe("shareSearch", () => {
  it("builds a query string in the given order", () => {
    expect(
      shareSearch([
        ["text", "LXFOPVEFRNHR"],
        ["key", "LEMON"],
        ["mode", "decrypt"],
      ]),
    ).toBe("?text=LXFOPVEFRNHR&key=LEMON&mode=decrypt");
  });

  it("omits empty values", () => {
    expect(
      shareSearch([
        ["text", "HELLO"],
        ["key", ""],
        ["mode", ""],
      ]),
    ).toBe("?text=HELLO");
  });

  it("returns an empty string when every value is empty", () => {
    expect(
      shareSearch([
        ["text", ""],
        ["key", ""],
      ]),
    ).toBe("");
  });

  it("round-trips values that need encoding", () => {
    const search = shareSearch([["text", "Hide the gold & run?"]]);
    expect(new URLSearchParams(search).get("text")).toBe(
      "Hide the gold & run?",
    );
  });
});
