// ABOUTME: Loads the quantized English quadgram table over HTTP, cached per page.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { QUADGRAM_TABLE_URL } from "./data/english-quadgrams-meta";

let table: Promise<Uint8Array> | null = null;

export function loadQuadgramTable(): Promise<Uint8Array> {
  table ??= fetch(QUADGRAM_TABLE_URL).then(async (response) => {
    if (!response.ok) {
      throw new Error("could not load the English quadgram data");
    }
    return new Uint8Array(await response.arrayBuffer());
  });
  return table;
}
