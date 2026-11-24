// ABOUTME: The worker side of the round pool: answers each request it is sent.
// ABOUTME: Posts the request's progress and answer, or the message of the error it threw.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import type { RoundMessage } from "./round-pool";

/** Makes this worker answer the pool's requests with `answer`, which may report how much it has done. */
export function serveRounds<Request, Answer>(
  answer: (request: Request, onProgress: (done: number) => void) => Answer,
): void {
  const scope = self as unknown as {
    postMessage(message: RoundMessage<Answer>): void;
    onmessage: ((event: MessageEvent<Request>) => void) | null;
  };

  scope.onmessage = (event) => {
    try {
      scope.postMessage({
        type: "answer",
        answer: answer(event.data, (done) =>
          scope.postMessage({ type: "progress", done }),
        ),
      });
    } catch (cause) {
      scope.postMessage({
        type: "error",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };
}
