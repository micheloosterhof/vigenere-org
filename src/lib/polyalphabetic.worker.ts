// ABOUTME: Web Worker running the polyalphabetic solver off the main thread.
// ABOUTME: Receives text, the quadgram table, and its share of the restarts; posts progress and the result.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { breakPolyalphabetic } from "./solve-polyalphabetic";
import type {
  PolyalphabeticMessage,
  PolyalphabeticRequest,
} from "./polyalphabetic-pool";

const scope = self as unknown as {
  postMessage(message: PolyalphabeticMessage): void;
  onmessage: ((event: MessageEvent<PolyalphabeticRequest>) => void) | null;
};

scope.onmessage = (event) => {
  const { text, table, period, maxPeriod, restarts, seedFromFrequency } =
    event.data;
  try {
    const result = breakPolyalphabetic(text, new Uint8Array(table), {
      period,
      maxPeriod,
      restarts,
      seedFromFrequency,
      onProgress: (progress) =>
        scope.postMessage({ type: "progress", ...progress }),
    });
    scope.postMessage({ type: "result", result });
  } catch (cause) {
    scope.postMessage({
      type: "error",
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
};
