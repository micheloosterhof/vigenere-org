// ABOUTME: Route cipher: letters written into a grid by rows or columns are read off along a route (spiral, snake, columns).
// ABOUTME: Includes a breaker that tries every grid width, fill, and route, ranked by bigram fitness.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import type { Mode } from "./cipher";
import { scoreText } from "./solve";

export type Fill = "rows" | "columns";

export const ROUTES = {
  "spiral-cw-tl": "Spiral clockwise from top left",
  "spiral-cw-tr": "Spiral clockwise from top right",
  "spiral-cw-br": "Spiral clockwise from bottom right",
  "spiral-cw-bl": "Spiral clockwise from bottom left",
  "spiral-ccw-tl": "Spiral counterclockwise from top left",
  "spiral-ccw-tr": "Spiral counterclockwise from top right",
  "spiral-ccw-br": "Spiral counterclockwise from bottom right",
  "spiral-ccw-bl": "Spiral counterclockwise from bottom left",
  rows: "Rows, left to right",
  "snake-rows": "Rows, alternating direction",
  columns: "Columns, top to bottom",
  "snake-columns": "Columns, alternating direction",
} as const;

export type Route = keyof typeof ROUTES;

export const FILLS: Record<Fill, string> = {
  rows: "Write in rows",
  columns: "Write in columns",
};

/** Pads the end of a message to fill the grid. */
const NULL = "X";

// Directions as [row step, column step], in clockwise order: right, down, left, up.
const STEPS: [number, number][] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/** The starting corner and first direction of each spiral. */
const SPIRALS: Record<
  string,
  { corner: "tl" | "tr" | "br" | "bl"; clockwise: boolean }
> = {};
for (const route of Object.keys(ROUTES)) {
  const match = /^spiral-(cw|ccw)-(tl|tr|br|bl)$/.exec(route);
  if (match) {
    SPIRALS[route] = {
      clockwise: match[1] === "cw",
      corner: match[2] as "tl" | "tr" | "br" | "bl",
    };
  }
}

function spiralOrder(
  rows: number,
  columns: number,
  corner: "tl" | "tr" | "br" | "bl",
  clockwise: boolean,
): number[] {
  // Clockwise from top left heads right; each corner turns the start a quarter.
  const cornerIndex = { tl: 0, tr: 1, br: 2, bl: 3 }[corner];
  let direction = clockwise ? cornerIndex : (cornerIndex + 1) % 4;
  let row = corner === "tl" || corner === "tr" ? 0 : rows - 1;
  let column = corner === "tl" || corner === "bl" ? 0 : columns - 1;
  const turn = clockwise ? 1 : 3;
  const visited = new Uint8Array(rows * columns);
  const order: number[] = [];
  for (let count = 0; count < rows * columns; count += 1) {
    order.push(row * columns + column);
    visited[row * columns + column] = 1;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const [dr, dc] = STEPS[direction];
      const nextRow = row + dr;
      const nextColumn = column + dc;
      if (
        nextRow >= 0 &&
        nextRow < rows &&
        nextColumn >= 0 &&
        nextColumn < columns &&
        visited[nextRow * columns + nextColumn] === 0
      ) {
        row = nextRow;
        column = nextColumn;
        break;
      }
      direction = (direction + turn) % 4;
    }
  }
  return order;
}

/** Cell indices (row-major) in the order the route visits them. */
function routeOrder(rows: number, columns: number, route: Route): number[] {
  const spiral = SPIRALS[route];
  if (spiral) {
    return spiralOrder(rows, columns, spiral.corner, spiral.clockwise);
  }
  const order: number[] = [];
  if (route === "rows" || route === "snake-rows") {
    for (let r = 0; r < rows; r += 1) {
      for (let i = 0; i < columns; i += 1) {
        const c = route === "snake-rows" && r % 2 === 1 ? columns - 1 - i : i;
        order.push(r * columns + c);
      }
    }
  } else {
    for (let c = 0; c < columns; c += 1) {
      for (let i = 0; i < rows; i += 1) {
        const r = route === "snake-columns" && c % 2 === 1 ? rows - 1 - i : i;
        order.push(r * columns + c);
      }
    }
  }
  return order;
}

function fillOrder(rows: number, columns: number, fill: Fill): number[] {
  return routeOrder(rows, columns, fill === "rows" ? "rows" : "columns");
}

/**
 * Encrypts or decrypts the route cipher. The message's letters (uppercased,
 * everything else dropped) are written into a grid `columns` wide, by rows or
 * by columns, padded with X to fill it, and read off along the route.
 * Decryption reverses this and keeps any padding.
 */
export function routeCipher(
  text: string,
  columns: number,
  fill: Fill,
  route: Route,
  mode: Mode,
): string {
  if (!Number.isInteger(columns) || columns < 1) {
    throw new Error("columns must be a whole number of at least 1");
  }
  if (!(route in ROUTES)) {
    throw new Error(`unknown route: ${route}`);
  }
  const letters = [...text.toUpperCase().replace(/[^A-Z]/g, "")];
  if (mode === "decrypt" && letters.length % columns !== 0) {
    throw new Error(
      `ciphertext length (${letters.length}) must be a multiple of the column count`,
    );
  }
  const rows = Math.max(1, Math.ceil(letters.length / columns));
  while (letters.length < rows * columns) {
    letters.push(NULL);
  }
  const written = fillOrder(rows, columns, fill);
  const read = routeOrder(rows, columns, route);
  const grid = new Array<string>(rows * columns);
  const output = new Array<string>(rows * columns);
  if (mode === "encrypt") {
    written.forEach((cell, i) => (grid[cell] = letters[i]));
    read.forEach((cell, i) => (output[i] = grid[cell]));
  } else {
    read.forEach((cell, i) => (grid[cell] = letters[i]));
    written.forEach((cell, i) => (output[i] = grid[cell]));
  }
  return output.join("");
}

export interface RouteCandidate {
  columns: number;
  fill: Fill;
  route: Route;
  /** Average bigram log10 probability of the decrypted text; higher is more English-like. */
  fitness: number;
  plaintext: string;
}

/**
 * Breaks a route cipher by trying every grid width that divides the letter
 * count, both fills, and every route, ranked best first. Several settings can
 * describe the same reading, so ties are expected.
 */
export function breakRoute(text: string): RouteCandidate[] {
  const length = text.toUpperCase().replace(/[^A-Z]/g, "").length;
  if (length < 4) {
    throw new Error("text must contain at least four letters");
  }
  const candidates: RouteCandidate[] = [];
  for (let columns = 2; columns <= length / 2; columns += 1) {
    if (length % columns !== 0) {
      continue;
    }
    for (const fill of Object.keys(FILLS) as Fill[]) {
      for (const route of Object.keys(ROUTES) as Route[]) {
        const plaintext = routeCipher(text, columns, fill, route, "decrypt");
        candidates.push({
          columns,
          fill,
          route,
          fitness: scoreText(plaintext),
          plaintext,
        });
      }
    }
  }
  if (candidates.length === 0) {
    throw new Error(
      "the letter count is prime, so no rectangular grid fits it",
    );
  }
  return candidates.sort((a, b) => b.fitness - a.fitness);
}
