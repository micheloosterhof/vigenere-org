// ABOUTME: Briefly swaps a button's label for a status message, then restores it.
// ABOUTME: Shared feedback for the clipboard and copy-link buttons on tool pages.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause

const FEEDBACK_MS = 1200;

export function flash(button: HTMLButtonElement, message: string): void {
  const original = button.dataset.label ?? button.textContent ?? "";
  button.dataset.label = original;
  button.textContent = message;
  window.setTimeout(() => {
    button.textContent = original;
  }, FEEDBACK_MS);
}
