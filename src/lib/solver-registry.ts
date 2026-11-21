// ABOUTME: Lists the requirements of every solver on the site in one place.
// ABOUTME: The ids are the full set of choices open to whatever routes a ciphertext to a solver.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { AFFINE_REQUIREMENTS } from "./affine";
import { RAIL_FENCE_REQUIREMENTS } from "./railfence";
import { ROUTE_REQUIREMENTS } from "./route";
import {
  CAESAR_REQUIREMENTS,
  PERIODIC_REQUIREMENTS,
  PORTA_REQUIREMENTS,
} from "./solve";
import {
  CIPHERTEXT_AUTOKEY_REQUIREMENTS,
  PLAINTEXT_AUTOKEY_REQUIREMENTS,
} from "./solve-autokey";
import { DOUBLE_TRANSPOSITION_REQUIREMENTS } from "./solve-double-transposition";
import { FRACTIONATION_REQUIREMENTS } from "./solve-fractionation";
import { POLYALPHABETIC_REQUIREMENTS } from "./solve-polyalphabetic";
import { QUAGMIRE_REQUIREMENTS } from "./solve-quagmire";
import { QUAGMIRE_DICTIONARY_REQUIREMENTS } from "./solve-quagmire-dictionary";
import { QUAGMIRE_DICTIONARY_JOINT_REQUIREMENTS } from "./solve-quagmire-dictionary-joint";
import { QUAGMIRE_LETTER_SETS_REQUIREMENTS } from "./solve-quagmire-letter-sets";
import { SUBSTITUTION_REQUIREMENTS } from "./solve-substitution";
import type { SolverRequirements } from "./solver-requirements";
import { COLUMNAR_REQUIREMENTS } from "./transposition";

export const SOLVER_REQUIREMENTS: readonly SolverRequirements[] = [
  CAESAR_REQUIREMENTS,
  AFFINE_REQUIREMENTS,
  PERIODIC_REQUIREMENTS,
  PORTA_REQUIREMENTS,
  SUBSTITUTION_REQUIREMENTS,
  POLYALPHABETIC_REQUIREMENTS,
  QUAGMIRE_REQUIREMENTS,
  QUAGMIRE_DICTIONARY_REQUIREMENTS,
  QUAGMIRE_DICTIONARY_JOINT_REQUIREMENTS,
  QUAGMIRE_LETTER_SETS_REQUIREMENTS,
  CIPHERTEXT_AUTOKEY_REQUIREMENTS,
  PLAINTEXT_AUTOKEY_REQUIREMENTS,
  RAIL_FENCE_REQUIREMENTS,
  COLUMNAR_REQUIREMENTS,
  ROUTE_REQUIREMENTS,
  DOUBLE_TRANSPOSITION_REQUIREMENTS,
  FRACTIONATION_REQUIREMENTS,
];
