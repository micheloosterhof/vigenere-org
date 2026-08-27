// ABOUTME: Constants describing the quantized English quadgram table in /data/english-quadgrams.bin.
// ABOUTME: Each byte b maps back to a log10 probability as MIN + b * SCALE; index is base-26 on A=0.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause

export const QUADGRAM_TABLE_URL = "/data/english-quadgrams.bin";
export const QUADGRAM_TABLE_SIZE = 456976;
export const QUADGRAM_MIN_LOG10 = -11.625737060717677;
export const QUADGRAM_LOG10_SCALE = 0.03576287131602463;
