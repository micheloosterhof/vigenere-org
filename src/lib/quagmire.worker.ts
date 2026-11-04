// ABOUTME: Web Worker running the Quagmire III solvers off the main thread.
// ABOUTME: Tries the keyword dictionary attack first, then falls back to the statistical solver.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { breakQuagmire } from "./solve-quagmire";
import { breakQuagmireDictionary } from "./solve-quagmire-dictionary";
import {
  breakPolyalphabeticParallel,
  canSpawnWorkers,
} from "./polyalphabetic-pool";

interface Request {
  text: string;
  table: ArrayBuffer;
  words: string[];
  period?: number;
}

const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<Request>) => Promise<void>) | null;
};

scope.onmessage = async (event) => {
  const { text, table, words, period } = event.data;
  const bytes = new Uint8Array(table);
  try {
    const dictionary = breakQuagmireDictionary(text, words, bytes, {
      period,
      onProgress: (done, total) =>
        scope.postMessage({
          type: "progress",
          phase: "dictionary",
          done,
          total,
        }),
    });
    if (dictionary.found) {
      scope.postMessage({ type: "result", method: "dictionary", dictionary });
      return;
    }
    const result = await breakQuagmire(text, bytes, {
      period,
      onProgress: (progress) =>
        scope.postMessage({ type: "progress", phase: "general", ...progress }),
      // The general solve fans out to nested workers where the browser allows it.
      solvePolyalphabetic: canSpawnWorkers()
        ? breakPolyalphabeticParallel
        : undefined,
    });
    scope.postMessage({ type: "result", method: "general", result });
  } catch (cause) {
    scope.postMessage({
      type: "error",
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
};
