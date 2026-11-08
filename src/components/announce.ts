// ABOUTME: Screen-reader announcements: a visually hidden polite live region per tool form.
// ABOUTME: Created when the form initializes, so later text changes are announced reliably.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause

/** Long results are cut so a screen reader does not read out a whole message. */
const MAX_ANNOUNCED = 160;

/**
 * Adds a hidden role="status" region to `root` and returns a function that
 * announces a message through it. A live region must exist before its text
 * changes, which is why it is created up front rather than on first use.
 */
export function liveRegion(root: HTMLElement): (message: string) => void {
  const region = document.createElement("div");
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  region.className = "sr-only";
  root.append(region);
  return (message) => {
    const text =
      message.length > MAX_ANNOUNCED
        ? `${message.slice(0, MAX_ANNOUNCED)}…`
        : message;
    // Clearing first makes a repeat of the same message announce again.
    region.textContent = "";
    requestAnimationFrame(() => {
      region.textContent = text;
    });
  };
}
