// ABOUTME: Web Worker scanning its share of the keywords for the per-column Quagmire dictionary attack.
// ABOUTME: Answers with its best candidates by bigram fitness and reports how many keywords it has scanned.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import type { DictionaryScanRequest } from "./quagmire-dictionary-pool";
import { serveRounds } from "./round-worker";
import {
  scanDictionary,
  type DictionaryCandidate,
} from "./solve-quagmire-dictionary";

serveRounds<DictionaryScanRequest, DictionaryCandidate[]>(
  (request, onProgress) =>
    scanDictionary(request.text, request.words, {
      period: request.period,
      onProgress,
    }),
);
