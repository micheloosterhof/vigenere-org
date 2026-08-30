// ABOUTME: Web Worker running the Quagmire III solver off the main thread.
// ABOUTME: Receives text, the quadgram table, and an optional period; posts progress and the result.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { breakQuagmire } from "./solve-quagmire";

interface Request {
  text: string;
  table: ArrayBuffer;
  period?: number;
}

const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<Request>) => void) | null;
};

scope.onmessage = (event) => {
  const { text, table, period } = event.data;
  try {
    const result = breakQuagmire(text, new Uint8Array(table), {
      period,
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
