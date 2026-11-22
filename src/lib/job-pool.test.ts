// ABOUTME: Tests for dealing work out among the workers of a pool.
// ABOUTME: The pools themselves need real Web Workers and are covered by the end-to-end tests.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { dealOut } from "./job-pool";

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
