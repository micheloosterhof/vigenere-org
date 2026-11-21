// ABOUTME: Web Worker running the Quagmire letter-set scan over its share of the periods.
// ABOUTME: Receives text, the quadgram table, periods and a seed; posts progress and the result.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { seededRng } from "./anneal";
import type { LetterSetsMessage, LetterSetsRequest } from "./letter-sets-pool";
import { breakQuagmireLetterSets } from "./solve-quagmire-letter-sets";

const scope = self as unknown as {
  postMessage(message: LetterSetsMessage): void;
  onmessage: ((event: MessageEvent<LetterSetsRequest>) => void) | null;
};

scope.onmessage = (event) => {
  const { text, table, periods, deepJobs, seed } = event.data;
  try {
    const result = breakQuagmireLetterSets(text, new Uint8Array(table), {
      periods,
      deepJobs,
      rng: seededRng(seed),
      onProgress: (done, total) =>
        scope.postMessage({ type: "progress", done, total }),
    });
    scope.postMessage({ type: "result", result });
  } catch (cause) {
    scope.postMessage({
      type: "error",
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
};
