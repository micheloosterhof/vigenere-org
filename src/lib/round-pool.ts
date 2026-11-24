// ABOUTME: A fixed set of Web Workers that takes work in rounds: one request to each worker, their answers gathered in worker order.
// ABOUTME: For attacks whose stages each split into parts, with a choice made on the calling thread between the stages.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause

/** What a round worker posts back: how much of its request it has done, its answer, or the message of the error it threw. */
export type RoundMessage<Answer> =
  | { type: "progress"; done: number }
  | { type: "answer"; answer: Answer }
  | { type: "error"; message: string };

export interface RoundPool<Request> {
  /** How many workers the pool has: the most requests a round can hold. */
  size: number;
  /**
   * One round: gives each request to a worker and resolves with the workers'
   * answers in the order of the requests, whichever worker answers first.
   * `onProgress` gets the sum of what the workers report done.
   */
  ask<Answer>(
    requests: Request[],
    onProgress?: (done: number) => void,
  ): Promise<Answer[]>;
  /** Stops every worker. */
  close(): void;
}

/** Starts `size` workers, each made by `spawn`, to take rounds of requests. */
export function openRoundPool<Request>(
  spawn: () => Worker,
  size: number,
): RoundPool<Request> {
  const workers = Array.from({ length: size }, spawn);
  return {
    size,
    ask<Answer>(
      requests: Request[],
      onProgress?: (done: number) => void,
    ): Promise<Answer[]> {
      return new Promise((resolve, reject) => {
        const answers = new Array<Answer>(requests.length);
        const done = new Array<number>(requests.length).fill(0);
        let pending = requests.length;
        if (pending === 0) {
          resolve(answers);
          return;
        }
        requests.forEach((request, i) => {
          const worker = workers[i];
          worker.onmessage = (event: MessageEvent<RoundMessage<Answer>>) => {
            const message = event.data;
            if (message.type === "progress") {
              done[i] = message.done;
              onProgress?.(done.reduce((sum, n) => sum + n, 0));
            } else if (message.type === "answer") {
              answers[i] = message.answer;
              pending -= 1;
              if (pending === 0) {
                resolve(answers);
              }
            } else {
              reject(new Error(message.message));
            }
          };
          worker.onerror = (event) => {
            reject(new Error(event.message));
          };
          worker.postMessage(request);
        });
      });
    },
    close(): void {
      for (const worker of workers) {
        worker.terminate();
      }
    },
  };
}
