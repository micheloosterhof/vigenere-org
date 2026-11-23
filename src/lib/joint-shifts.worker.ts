// ABOUTME: Web Worker taking a share of the joint-shift Quagmire dictionary attack: keywords to scan, or finalists to anneal.
// ABOUTME: Posts scan progress and the best candidates of each period, or the annealed finalists.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import type {
  JointShiftsMessage,
  JointShiftsRequest,
} from "./joint-shifts-pool";
import {
  annealJointFinalists,
  scanJointCandidates,
} from "./solve-quagmire-dictionary-joint";

const scope = self as unknown as {
  postMessage(message: JointShiftsMessage): void;
  onmessage: ((event: MessageEvent<JointShiftsRequest>) => void) | null;
};

scope.onmessage = (event) => {
  const request = event.data;
  try {
    if (request.type === "scan") {
      const candidates = scanJointCandidates(
        request.text,
        request.alphabets,
        request.periods,
        (done) => scope.postMessage({ type: "progress", done }),
      );
      scope.postMessage({ type: "candidates", candidates });
    } else {
      const finalists = annealJointFinalists(
        request.text,
        request.finalists,
        request.table,
      );
      scope.postMessage({ type: "finalists", finalists });
    }
  } catch (cause) {
    scope.postMessage({
      type: "error",
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
};
