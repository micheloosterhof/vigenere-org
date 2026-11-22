// ABOUTME: Shares the word scan of the joint-shift Quagmire dictionary attack among a pool of Web Workers.
// ABOUTME: Each worker scores a share of the keywords; the candidates are joined and finished on the calling thread.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { dealOut } from "./job-pool";
import { toLetterValues } from "./solve";
import type { QuagmireDictionaryResult } from "./solve-quagmire-dictionary";
import {
  distinctAlphabets,
  finishJoint,
  jointPeriods,
  type JointCandidate,
} from "./solve-quagmire-dictionary-joint";

// More workers than this gain little: the stages after the scan run on one thread.
const MAX_WORKERS = 8;

/** What joint-shifts.worker.ts accepts. */
export interface JointScanRequest {
  text: string;
  /** One keyword per alphabet. */
  alphabets: string[];
  periods: number[];
}

/** What joint-shifts.worker.ts posts back. */
export type JointScanMessage =
  | { type: "progress"; done: number }
  | { type: "result"; candidates: JointCandidate[] }
  | { type: "error"; message: string };

/** Breaks a short Quagmire by the joint-shift dictionary attack; the pool and the single-thread solver both fit. */
export type JointShiftsSolver = (
  text: string,
  words: string[],
  table: Uint8Array,
  options: {
    period?: number;
    onProgress?: (done: number, total: number) => void;
  },
) => Promise<QuagmireDictionaryResult>;

/**
 * The joint-shift dictionary attack with its word scan spread over as many
 * workers as the machine has cores (capped). Progress is the number of
 * keywords scanned across the pool.
 */
export const breakQuagmireDictionaryJointParallel: JointShiftsSolver = (
  text,
  words,
  table,
  options,
) =>
  new Promise((resolve, reject) => {
    const workers: Worker[] = [];
    let settled = false;
    const settle = (outcome: () => void): void => {
      if (!settled) {
        settled = true;
        for (const worker of workers) {
          worker.terminate();
        }
        outcome();
      }
    };
    const finish = (candidates: JointCandidate[]): void => {
      try {
        const result = finishJoint(text, candidates, table);
        settle(() => resolve(result));
      } catch (cause) {
        settle(() => reject(cause));
      }
    };

    let periods: number[];
    try {
      periods = jointPeriods(toLetterValues(text).length, options);
    } catch (cause) {
      reject(cause);
      return;
    }
    const alphabets = distinctAlphabets(words);
    const cores = navigator.hardwareConcurrency ?? 2;
    const shares = dealOut(alphabets, Math.min(cores, MAX_WORKERS));
    if (shares.length === 0) {
      finish([]);
      return;
    }
    const done = new Array<number>(shares.length).fill(0);
    const candidates: JointCandidate[] = [];
    let pending = shares.length;

    shares.forEach((share, i) => {
      const worker = new Worker(
        new URL("./joint-shifts.worker.ts", import.meta.url),
        { type: "module" },
      );
      workers.push(worker);
      worker.onmessage = (event: MessageEvent<JointScanMessage>) => {
        const message = event.data;
        if (message.type === "progress") {
          done[i] = message.done;
          options.onProgress?.(
            done.reduce((sum, n) => sum + n, 0),
            alphabets.length,
          );
        } else if (message.type === "result") {
          candidates.push(...message.candidates);
          pending -= 1;
          if (pending === 0) {
            finish(candidates);
          }
        } else {
          settle(() => reject(new Error(message.message)));
        }
      };
      worker.onerror = (event) => {
        settle(() => reject(new Error(event.message)));
      };
      const request: JointScanRequest = { text, alphabets: share, periods };
      worker.postMessage(request);
    });
  });
