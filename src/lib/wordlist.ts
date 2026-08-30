// ABOUTME: Loads the English keyword list over HTTP, cached per page.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { WORDLIST_URL } from "./data/english-words-meta";

let words: Promise<string[]> | null = null;

export function loadWordlist(): Promise<string[]> {
  words ??= fetch(WORDLIST_URL).then(async (response) => {
    if (!response.ok) {
      throw new Error("could not load the English word list");
    }
    return (await response.text()).split("\n").filter((word) => word !== "");
  });
  return words;
}
