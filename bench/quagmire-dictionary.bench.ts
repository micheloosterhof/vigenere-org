// ABOUTME: Benchmark of the Quagmire keyword dictionary attack that picks each column's shift on its own.
// ABOUTME: Covers 5 to 24 letters per column at periods 3 to 12, with the period unknown to the solver.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { breakQuagmireDictionary } from "../src/lib/solve-quagmire-dictionary";
import { runDictionaryGrid } from "./quagmire-dictionary-grid";

it("quagmire dictionary attack grid", () => {
  runDictionaryGrid(
    "quagmire-dictionary",
    (text, words, table) => breakQuagmireDictionary(text, words, table),
    [3, 5, 8, 12],
    [5, 8, 12, 16, 24],
  );
});
