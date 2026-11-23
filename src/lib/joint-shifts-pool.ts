// ABOUTME: Shares the word scan and the annealing of the joint-shift Quagmire dictionary attack among a pool of Web Workers.
// ABOUTME: Each worker scores a share of the keywords, then anneals a share of the finalists; the calling thread ranks the candidates in between.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { dealOut } from "./job-pool";
import { toLetterValues } from "./solve";
import type {
  Finalist,
  QuagmireDictionaryResult,
} from "./solve-quagmire-dictionary";
import {
  decideJoint,
  distinctAlphabets,
  jointPeriods,
  rankJointCandidates,
  type JointCandidate,
  type JointFinalist,
} from "./solve-quagmire-dictionary-joint";

// More workers than this gain little: the ranking between the scan and the
// annealing runs on one thread.
const MAX_WORKERS = 8;

/** What joint-shifts.worker.ts accepts: a share of the keywords to scan, then a share of the finalists to anneal. */
export type JointShiftsRequest =
  | {
      type: "scan";
      text: string;
      /** One keyword per alphabet. */
      alphabets: string[];
      periods: number[];
    }
  | {
      type: "anneal";
      text: string;
      table: Uint8Array;
      finalists: JointFinalist[];
    };

/** What joint-shifts.worker.ts posts back. */
export type JointShiftsMessage =
  | { type: "progress"; done: number }
  | { type: "candidates"; candidates: JointCandidate[] }
  | { type: "finalists"; finalists: Finalist[] }
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
 * The joint-shift dictionary attack with its word scan, and then the
 * annealing of its finalists, spread over as many workers as the machine has
 * cores (capped). Progress is the number of keywords scanned across the pool.
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
    const attempt = (step: () => void): void => {
      try {
        step();
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
      attempt(() => {
        const result = decideJoint(text, []);
        settle(() => resolve(result));
      });
      return;
    }
    const done = new Array<number>(shares.length).fill(0);
    const candidates: JointCandidate[] = [];
    let pending = shares.length;
    let finalists: JointFinalist[] = [];
    // What each worker made of its share of the finalists.
    let annealed: Finalist[][] = [];

    // Once every share is scanned: rank the candidates here and deal the
    // finalists out, best first, so each worker starts on a likely one.
    const annealFinalists = (): void => {
      finalists = rankJointCandidates(text, candidates, table);
      const parts = dealOut(finalists, workers.length);
      annealed = new Array<Finalist[]>(parts.length);
      pending = parts.length;
      if (pending === 0) {
        decide();
        return;
      }
      parts.forEach((part, i) => {
        const request: JointShiftsRequest = {
          type: "anneal",
          text,
          table,
          finalists: part,
        };
        workers[i].postMessage(request);
      });
    };
    // Once every finalist is annealed: put them back in the order they were
    // dealt from, and decide.
    const decide = (): void => {
      const result = decideJoint(
        text,
        finalists.map(
          (_, rank) =>
            annealed[rank % annealed.length][
              Math.floor(rank / annealed.length)
            ],
        ),
      );
      settle(() => resolve(result));
    };

    shares.forEach((share, i) => {
      const worker = new Worker(
        new URL("./joint-shifts.worker.ts", import.meta.url),
        { type: "module" },
      );
      workers.push(worker);
      worker.onmessage = (event: MessageEvent<JointShiftsMessage>) => {
        const message = event.data;
        if (message.type === "progress") {
          done[i] = message.done;
          options.onProgress?.(
            done.reduce((sum, n) => sum + n, 0),
            alphabets.length,
          );
        } else if (message.type === "candidates") {
          candidates.push(...message.candidates);
          pending -= 1;
          if (pending === 0) {
            attempt(annealFinalists);
          }
        } else if (message.type === "finalists") {
          annealed[i] = message.finalists;
          pending -= 1;
          if (pending === 0) {
            attempt(decide);
          }
        } else {
          settle(() => reject(new Error(message.message)));
        }
      };
      worker.onerror = (event) => {
        settle(() => reject(new Error(event.message)));
      };
      const request: JointShiftsRequest = {
        type: "scan",
        text,
        alphabets: share,
        periods,
      };
      worker.postMessage(request);
    });
  });
