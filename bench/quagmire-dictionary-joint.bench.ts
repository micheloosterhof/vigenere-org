// ABOUTME: Benchmark of the Quagmire keyword dictionary attack that solves the column shifts together.
// ABOUTME: Covers 4 to 16 letters per column at periods 4 to 12, with the period unknown to the solver.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { it } from "vitest";
import { breakQuagmireDictionaryJoint } from "../src/lib/solve-quagmire-dictionary-joint";
import { runDictionaryGrid } from "./quagmire-dictionary-grid";

it("quagmire joint-shift dictionary attack grid", () => {
  runDictionaryGrid(
    "quagmire-dictionary-joint",
    breakQuagmireDictionaryJoint,
    [4, 6, 8, 12],
    [4, 6, 8, 12, 16],
  );
});
