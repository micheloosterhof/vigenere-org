// ABOUTME: Builds the shareable deep-link query string for a tool's form state.
// ABOUTME: Empty values are dropped so the address bar stays a minimal working link.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause

export function shareSearch(
  entries: ReadonlyArray<[name: string, value: string]>,
): string {
  const params = new URLSearchParams();
  for (const [name, value] of entries) {
    if (value !== "") {
      params.set(name, value);
    }
  }
  const search = params.toString();
  return search === "" ? "" : `?${search}`;
}
