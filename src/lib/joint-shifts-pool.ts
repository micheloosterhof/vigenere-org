// ABOUTME: Shares the word scan, the ring solutions and the annealing of the joint-shift Quagmire dictionary attack among a pool of Web Workers.
// ABOUTME: Each worker takes a share of every round; the calling thread chooses what goes on to the next round and climbs the survivors.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { dealOut, gather } from "./job-pool";
import { openRoundPool } from "./round-pool";
import { toLetterValues } from "./solve";
import {
  distinctAlphabets,
  type Finalist,
  type QuagmireDictionaryResult,
} from "./solve-quagmire-dictionary";
import {
  climbJointCandidates,
  decideJoint,
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

/** What joint-shifts.worker.ts answers with, by the type of the request. */
export type JointShiftsAnswer = JointCandidate[] | JointShifted[] | Finalist[];

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

const spawn = (): Worker =>
  new Worker(new URL("./joint-shifts.worker.ts", import.meta.url), {
    type: "module",
  });

/**
 * The joint-shift dictionary attack with its word scan, then the ring
 * solutions of the shortlist, then the annealing of its finalists, each
 * spread over as many workers as the machine has cores (capped). Progress is
 * the number of keywords scanned across the pool.
 */
export const breakQuagmireDictionaryJointParallel: JointShiftsSolver = async (
  text,
  words,
  table,
  options,
) => {
  const periods = jointPeriods(toLetterValues(text).length, options);
  const alphabets = distinctAlphabets(words);
  const cores = navigator.hardwareConcurrency ?? 2;
  const shares = dealOut(alphabets, Math.min(cores, MAX_WORKERS));
  const pool = openRoundPool<JointShiftsRequest>(spawn, shares.length);
  try {
    const scanned = await pool.ask<JointCandidate[]>(
      shares.map((share) => ({
        type: "scan",
        text,
        alphabets: share,
        periods,
      })),
      (done) => options.onProgress?.(done, alphabets.length),
    );
    // The shortlist and the finalists are dealt out best first, so each
    // worker starts on a likely one, and gathered in that order again.
    const ringed = await pool.ask<JointShifted[]>(
      dealOut(jointShortlist(scanned.flat()), pool.size).map((candidates) => ({
        type: "ring",
        text,
        candidates,
      })),
    );
    const finalists = climbJointCandidates(text, gather(ringed), table);
    const annealed = await pool.ask<Finalist[]>(
      dealOut(finalists, pool.size).map((part) => ({
        type: "anneal",
        text,
        table,
        finalists: part,
      })),
    );
    return decideJoint(text, gather(annealed));
  } finally {
    pool.close();
  }
};
