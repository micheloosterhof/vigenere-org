// ABOUTME: Web Worker scanning its share of the keywords for the joint-shift Quagmire dictionary attack.
// ABOUTME: Receives text, keywords and periods; posts progress and the best candidates of each period.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import type { JointScanMessage, JointScanRequest } from "./joint-shifts-pool";
import { scanJointCandidates } from "./solve-quagmire-dictionary-joint";

const scope = self as unknown as {
  postMessage(message: JointScanMessage): void;
  onmessage: ((event: MessageEvent<JointScanRequest>) => void) | null;
};

scope.onmessage = (event) => {
  const { text, alphabets, periods } = event.data;
  try {
    const candidates = scanJointCandidates(text, alphabets, periods, (done) =>
      scope.postMessage({ type: "progress", done }),
    );
    scope.postMessage({ type: "result", candidates });
  } catch (cause) {
    scope.postMessage({
      type: "error",
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
};
