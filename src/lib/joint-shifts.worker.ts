// ABOUTME: Web Worker taking a share of a round of the joint-shift Quagmire dictionary attack: keywords to scan, candidates to solve round the ring, or finalists to anneal.
// ABOUTME: Answers with the best candidates of each period, the ring solutions, or the annealed finalists; reports the scan's progress.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import type {
  JointShiftsAnswer,
  JointShiftsRequest,
} from "./joint-shifts-pool";
import { serveRounds } from "./round-worker";
import {
  annealJointFinalists,
  ringJointCandidates,
  scanJointCandidates,
} from "./solve-quagmire-dictionary-joint";

serveRounds<JointShiftsRequest, JointShiftsAnswer>((request, onProgress) => {
  if (request.type === "scan") {
    return scanJointCandidates(
      request.text,
      request.alphabets,
      request.periods,
      onProgress,
    );
  }
  if (request.type === "ring") {
    return ringJointCandidates(request.text, request.candidates);
  }
  return annealJointFinalists(request.text, request.finalists, request.table);
});
