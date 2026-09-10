// ABOUTME: Keeps the address bar in sync with a tool form, so the URL is
// ABOUTME: always a shareable deep link. Debounced; null state clears the URL.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { shareSearch } from "../lib/share-url";

// A page can carry both an encrypt/decrypt form and a breaker; this mode
// value addresses a link to the breaker, any other mode to the form.
const BREAK_MODE = "break";
const DEBOUNCE_MS = 300;
const FLUSH_EVENT = "share-url:flush";

export function liveShareUrl(
  read: () => ReadonlyArray<[name: string, value: string]> | null,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const write = (): void => {
    timer = undefined;
    const state = read();
    const search = state === null ? "" : shareSearch(state);
    history.replaceState(null, "", location.pathname + search);
  };
  // Only a form with an edit still pending writes on flush, so forms that
  // were not touched cannot clear another form's state from the URL.
  document.addEventListener(FLUSH_EVENT, () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      write();
    }
  });
  return () => {
    clearTimeout(timer);
    timer = setTimeout(write, DEBOUNCE_MS);
  };
}

/** Writes any pending form state to the URL now, so a copy of it is current. */
export function flushShareUrl(): void {
  document.dispatchEvent(new Event(FLUSH_EVENT));
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
 * Mirrors a breaker's ciphertext, plus any extra `fields`, into the URL as
 * `?text=...&mode=break` and runs the breaker when the page loads from such
 * a link. Call after the solve button's click handler is attached.
 */
export function breakerShareUrl(
  input: HTMLTextAreaElement,
  solve: HTMLButtonElement,
  fields: ReadonlyArray<[name: string, field: HTMLInputElement]> = [],
): void {
  const syncUrl = liveShareUrl(() =>
    input.value === ""
      ? null
      : [
          ["text", input.value],
          ...fields.map(([name, field]): [string, string] => [
            name,
            field.value,
          ]),
          ["mode", BREAK_MODE],
        ],
  );
  input.addEventListener("input", syncUrl);
  for (const [, field] of fields) {
    field.addEventListener("input", syncUrl);
  }

  const params = deepLink("breaker");
  if (params) {
    input.value = params.get("text") ?? "";
    for (const [name, field] of fields) {
      const value = params.get(name);
      if (value !== null) {
        field.value = value;
      }
    }
    solve.click();
  }
}
