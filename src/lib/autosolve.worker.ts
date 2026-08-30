// ABOUTME: Web Worker running the automatic cipher identification off the main thread.
// ABOUTME: Receives text and the quadgram table; posts progress and the autosolve result.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { autosolve } from "./autosolve";

interface Request {
  text: string;
  table: ArrayBuffer;
  words?: string[];
}

const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<Request>) => void) | null;
};

scope.onmessage = (event) => {
  const { text, table, words } = event.data;
  try {
    const result = autosolve(text, new Uint8Array(table), {
      words,
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
