// ABOUTME: Tests for dealing work out among the workers of a pool and gathering it in again.
// ABOUTME: The pools themselves need real Web Workers and are covered by the end-to-end tests.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { dealOut, gather } from "./job-pool";

describe("dealOut", () => {
  it("deals the items out in turn, so each worker starts on an early one", () => {
    expect(dealOut([6, 12, 3, 9, 4, 5, 7], 3)).toEqual([
      [6, 9, 7],
      [12, 4],
      [3, 5],
    ]);
  });

  it("makes no more shares than there are items", () => {
    expect(dealOut(["A", "B"], 8)).toEqual([["A"], ["B"]]);
  });
});

describe("gather", () => {
  it("puts the items of dealt shares back in the order they were dealt from", () => {
    for (const items of [[6, 12, 3, 9, 4, 5, 7], [1, 2], [8], []]) {
      for (const parts of [1, 3, 8]) {
        expect(gather(dealOut(items, parts))).toEqual(items);
      }
    }
  });
});
