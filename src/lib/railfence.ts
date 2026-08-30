// ABOUTME: Rail fence transposition cipher: characters zigzag over rails and are read off row by row.
// ABOUTME: Includes a breaker that tries every rail count and ranks the decryptions by bigram fitness.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import type { Mode } from "./cipher";
import { scoreText } from "./solve";

const MAX_RAILS = 20;

export interface RailCandidate {
  rails: number;
  /** Average bigram log10 probability of the decrypted text; higher is more English-like. */
  fitness: number;
  plaintext: string;
}

/** The rail each position visits as the text zigzags down and up the fence. */
function railPattern(length: number, rails: number): number[] {
  const cycle = 2 * (rails - 1);
  return Array.from({ length }, (_, i) => {
    const phase = i % cycle;
    return phase < rails ? phase : cycle - phase;
  });
}

/**
 * Encrypts or decrypts the rail fence cipher with the given number of rails.
 * Every character takes part in the zigzag, so spaces and punctuation move too.
 */
export function railFence(text: string, rails: number, mode: Mode): string {
  if (!Number.isInteger(rails) || rails < 1) {
    throw new Error("rails must be a positive whole number");
  }
  const chars = [...text];
  if (rails === 1 || chars.length <= 1) {
    return text;
  }
  const pattern = railPattern(chars.length, rails);
  if (mode === "encrypt") {
    const rows: string[][] = Array.from({ length: rails }, () => []);
    chars.forEach((char, i) => rows[pattern[i]].push(char));
    return rows.flat().join("");
  }
  const counts = new Array<number>(rails).fill(0);
  for (const rail of pattern) {
    counts[rail] += 1;
  }
  const cursors: number[] = [];
  let offset = 0;
  for (const count of counts) {
    cursors.push(offset);
    offset += count;
  }
  return pattern.map((rail) => chars[cursors[rail]++]).join("");
}

/**
 * Breaks a rail fence cipher by trying every rail count up to twenty and
 * ranking the decryptions by how English-like they are.
 */
export function breakRailFence(text: string): RailCandidate[] {
  const longest = Math.min(MAX_RAILS, [...text].length - 1);
  const candidates: RailCandidate[] = [];
  for (let rails = 2; rails <= longest; rails += 1) {
    const plaintext = railFence(text, rails, "decrypt");
    candidates.push({ rails, fitness: scoreText(plaintext), plaintext });
  }
  return candidates.sort((a, b) => b.fitness - a.fitness);
}
