// ABOUTME: Web Worker running the automatic cipher identification off the main thread.
// ABOUTME: Receives text and the quadgram table; posts progress and the autosolve result.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { autosolve } from "./autosolve";
import {
  breakPolyalphabeticParallel,
  canSpawnWorkers,
} from "./polyalphabetic-pool";

interface Request {
  text: string;
  table: ArrayBuffer;
  words?: string[];
}

const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<Request>) => Promise<void>) | null;
};

scope.onmessage = async (event) => {
  const { text, table, words } = event.data;
  try {
    const result = await autosolve(text, new Uint8Array(table), {
      words,
      onProgress: (progress) =>
        scope.postMessage({ type: "progress", ...progress }),
      // The slow fallback fans out to nested workers where the browser allows it.
      solvePolyalphabetic: canSpawnWorkers()
        ? breakPolyalphabeticParallel
        : undefined,
    });
    scope.postMessage({ type: "result", result });
  } catch (cause) {
    scope.postMessage({
      type: "error",
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
};
