// ABOUTME: The worker side of the job pool: takes the quadgram table once, then runs one job per message.
// ABOUTME: Posts each job's progress and result, or the message of the error it threw.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import type { JobWorkerMessage, JobWorkerRequest } from "./job-pool";

/** Makes this worker answer the pool's messages by running each job with `run`. */
export function serveJobs<Job, Result>(
  run: (
    job: Job,
    text: string,
    table: Uint8Array,
    onProgress: (fraction: number) => void,
  ) => Result,
): void {
  const scope = self as unknown as {
    postMessage(message: JobWorkerMessage<Result>): void;
    onmessage: ((event: MessageEvent<JobWorkerRequest<Job>>) => void) | null;
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
      const result = run(request.job, request.text, table, (fraction) =>
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
}
