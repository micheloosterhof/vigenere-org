// ABOUTME: Keeps the address bar in sync with a tool form, so the URL is
// ABOUTME: always a shareable deep link. Debounced; null state clears the URL.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { shareSearch } from "../lib/share-url";

// A page can carry both an encrypt/decrypt form and a breaker; this mode
// value addresses a link to the breaker, any other mode to the form.
const BREAK_MODE = "break";

export function liveShareUrl(
  read: () => ReadonlyArray<[name: string, value: string]> | null,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const state = read();
      const search = state === null ? "" : shareSearch(state);
      history.replaceState(null, "", location.pathname + search);
    }, 300);
  };
}

/** The page's deep-link parameters when they carry text for `target`, else null. */
export function deepLink(target: "tool" | "breaker"): URLSearchParams | null {
  const params = new URLSearchParams(location.search);
  if (params.get("text") === null) {
    return null;
  }
  const forBreaker = params.get("mode") === BREAK_MODE;
  return forBreaker === (target === "breaker") ? params : null;
}

/**
 * Mirrors a breaker's ciphertext into the URL as `?text=...&mode=break` and
 * runs the breaker when the page loads from such a link. Call after the
 * solve button's click handler is attached.
 */
export function breakerShareUrl(
  input: HTMLTextAreaElement,
  solve: HTMLButtonElement,
): void {
  const syncUrl = liveShareUrl(() =>
    input.value === ""
      ? null
      : [
          ["text", input.value],
          ["mode", BREAK_MODE],
        ],
  );
  input.addEventListener("input", syncUrl);

  const params = deepLink("breaker");
  if (params) {
    input.value = params.get("text") ?? "";
    solve.click();
  }
}
