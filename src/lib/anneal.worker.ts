// ABOUTME: Web Worker running annealing jobs for the Bifid, Trifid, and double transposition breakers.
// ABOUTME: Takes the quadgram table once, then one job per message; posts progress and each result.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { runJob, type AnnealJob, type AnnealJobResult } from "./anneal-jobs";

export type AnnealWorkerRequest =
  | { type: "init"; table: ArrayBuffer }
  | { type: "job"; job: AnnealJob; text: string };

export type AnnealWorkerMessage =
  | { type: "progress"; fraction: number }
  | { type: "result"; result: AnnealJobResult }
  | { type: "error"; message: string };

const scope = self as unknown as {
  postMessage(message: AnnealWorkerMessage): void;
  onmessage: ((event: MessageEvent<AnnealWorkerRequest>) => void) | null;
};

let table: Uint8Array | null = null;

scope.onmessage = (event) => {
  const request = event.data;
  if (request.type === "init") {
    table = new Uint8Array(request.table);
    return;
  }
  try {
    if (table === null) {
      throw new Error("worker received a job before the quadgram table");
    }
    const result = runJob(request.job, request.text, table, (fraction) =>
      scope.postMessage({ type: "progress", fraction }),
    );
    scope.postMessage({ type: "result", result });
  } catch (cause) {
    scope.postMessage({
      type: "error",
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
};
