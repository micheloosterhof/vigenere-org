// ABOUTME: Keeps the address bar in sync with a tool form, so the URL is
// ABOUTME: always a shareable deep link. Debounced; null state clears the URL.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { shareSearch } from "../lib/share-url";

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
