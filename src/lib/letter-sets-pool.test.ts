// ABOUTME: Tests for sharing the Quagmire letter-set scan's periods among workers.
// ABOUTME: The pool itself needs real Web Workers and is covered by the end-to-end tests.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, it } from "vitest";
import { sharePeriods } from "./letter-sets-pool";

describe("sharePeriods", () => {
  it("deals the periods out in turn, so each worker starts on a likely one", () => {
    expect(sharePeriods([6, 12, 3, 9, 4, 5, 7], 3)).toEqual([
      [6, 9, 7],
      [12, 4],
      [3, 5],
    ]);
  });

  it("uses no more workers than there are periods", () => {
    expect(sharePeriods([6, 12], 8)).toEqual([[6], [12]]);
  });
});
