// ABOUTME: Shares the word scan, the ring solutions and the annealing of the joint-shift Quagmire dictionary attack among a pool of Web Workers.
// ABOUTME: Each worker takes a share of every round; the calling thread chooses what goes on to the next round and climbs the survivors.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { dealOut, gather } from "./job-pool";
import { toLetterValues } from "./solve";
import type {
  Finalist,
  QuagmireDictionaryResult,
} from "./solve-quagmire-dictionary";
import {
  climbJointCandidates,
  decideJoint,
  distinctAlphabets,
  jointPeriods,
  jointShortlist,
  type JointCandidate,
  type JointFinalist,
  type JointShifted,
} from "./solve-quagmire-dictionary-joint";

// More workers than this gain little: the rounds are short, and each worker
// gets a copy of the quadgram table.
const MAX_WORKERS = 8;

/** What joint-shifts.worker.ts accepts: its share of the keywords to scan, of the shortlist to solve round the ring, or of the finalists to anneal. */
export type JointShiftsRequest =
  | {
      type: "scan";
      text: string;
      /** One keyword per alphabet. */
      alphabets: string[];
      periods: number[];
    }
  | { type: "ring"; text: string; candidates: JointCandidate[] }
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
  | { type: "ring"; candidates: JointShifted[] }
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
 * The joint-shift dictionary attack with its word scan, then the ring
 * solutions of the shortlist, then the annealing of its finalists, each
 * spread over as many workers as the machine has cores (capped). Progress is
 * the number of keywords scanned across the pool.
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
    // What each worker made of its share of a round.
    const scanned: JointCandidate[][] = [];
    const ringed: JointShifted[][] = [];
    const annealed: Finalist[][] = [];
    let pending = 0;
    let next = (): void => {};

    // Starts a round: one request to each of the first workers, and what to
    // do when all have answered.
    const send = (requests: JointShiftsRequest[], then: () => void): void => {
      pending = requests.length;
      next = then;
      if (pending === 0) {
        then();
        return;
      }
      requests.forEach((request, i) => {
        workers[i].postMessage(request);
      });
    };
    const answered = (): void => {
      pending -= 1;
      if (pending === 0) {
        attempt(next);
      }
    };

    // The shortlist and the finalists are dealt out best first, so each
    // worker starts on a likely one, and gathered in that order again.
    const ring = (): void => {
      const parts = dealOut(jointShortlist(scanned.flat()), workers.length);
      send(
        parts.map((candidates) => ({ type: "ring", text, candidates })),
        anneal,
      );
    };
    const anneal = (): void => {
      const finalists = climbJointCandidates(text, gather(ringed), table);
      const parts = dealOut(finalists, workers.length);
      send(
        parts.map((part) => ({ type: "anneal", text, table, finalists: part })),
        decide,
      );
    };
    const decide = (): void => {
      const result = decideJoint(text, gather(annealed));
      settle(() => resolve(result));
    };

    shares.forEach((_, i) => {
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
          scanned[i] = message.candidates;
          answered();
        } else if (message.type === "ring") {
          ringed[i] = message.candidates;
          answered();
        } else if (message.type === "finalists") {
          annealed[i] = message.finalists;
          answered();
        } else {
          settle(() => reject(new Error(message.message)));
        }
      };
      worker.onerror = (event) => {
        settle(() => reject(new Error(event.message)));
      };
    });
    send(
      shares.map((share) => ({
        type: "scan",
        text,
        alphabets: share,
        periods,
      })),
      ring,
    );
  });
