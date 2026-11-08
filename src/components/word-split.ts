// ABOUTME: The "Split into words" toggle: shows decrypted text with spaces restored, on by default.
// ABOUTME: The choice is shared by every output on the site and remembered in the browser.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { buildWordModel, splitWords, type WordModel } from "../lib/segment";
import { loadWordlist } from "../lib/wordlist";

export const WORD_SPLIT_STORAGE_KEY = "vigenere.org:split-words";
const CHANGE_EVENT = "word-split:change";

let model: Promise<WordModel> | null = null;

function loadModel(): Promise<WordModel> {
  model ??= loadWordlist().then(buildWordModel);
  return model;
}

function enabled(): boolean {
  try {
    return localStorage.getItem(WORD_SPLIT_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function remember(on: boolean): void {
  try {
    localStorage.setItem(WORD_SPLIT_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked: the toggle still works for this page view.
  }
}

/**
 * Wires an output field to the toggle inside `root` ([data-word-split]) and
 * returns the setter to use instead of assigning output.value: it shows the
 * raw text at once and the word-split version once the word list has loaded.
 */
export function wordSplitOutput(
  root: HTMLElement,
  output: HTMLTextAreaElement,
): (raw: string) => void {
  const toggle = root.querySelector<HTMLInputElement>("[data-word-split]");
  let raw = output.value;
  let generation = 0;

  const render = (): void => {
    generation += 1;
    const current = generation;
    output.value = raw;
    if (!enabled() || raw === "") {
      return;
    }
    loadModel()
      .then((loaded) => {
        if (current === generation) {
          output.value = splitWords(raw, loaded);
        }
      })
      .catch(() => {
        // Without the word list the raw text stays, which is still correct.
      });
  };

  if (toggle) {
    toggle.checked = enabled();
    toggle.addEventListener("change", () => {
      remember(toggle.checked);
      document.dispatchEvent(new Event(CHANGE_EVENT));
    });
  }
  document.addEventListener(CHANGE_EVENT, () => {
    if (toggle) {
      toggle.checked = enabled();
    }
    render();
  });

  return (text) => {
    raw = text;
    render();
  };
}
