// ABOUTME: Fits one shared mixed alphabet plus per-column shifts to known plaintext/ciphertext pairs.
// ABOUTME: Confirms a periodic cipher is Quagmire III and recovers its alphabet without any search.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause

const ALPHABET_SIZE = 26;
const CODE_A = 65;

// A shared alphabet is accepted only if it explains at least this share of the
// text; genuinely independent per-column alphabets score far worse.
const MAX_RESIDUAL = 0.15;

export interface SharedAlphabetFit {
  /** The recovered shared mixed alphabet, as a permutation of A-Z. */
  alphabet: string;
  /** Per-column shift on top of the alphabet. */
  offsets: number[];
  /** Fraction of positions the fit fails to explain; low means it really is Quagmire III. */
  residual: number;
  /** Decrypts ciphertext values through the recovered alphabet and offsets. */
  decrypt(cipher: number[]): number[];
}

function mod(value: number): number {
  return ((value % ALPHABET_SIZE) + ALPHABET_SIZE) % ALPHABET_SIZE;
}

interface Edge {
  plain: number;
  cipher: number;
  column: number;
}

function modInverse(value: number, prime: number): number {
  const v = ((value % prime) + prime) % prime;
  for (let i = 1; i < prime; i += 1) {
    if ((v * i) % prime === 1) {
      return i;
    }
  }
  return 0;
}

// The offset constraints are homogeneous (every cycle of the graph sums its
// column shifts to zero), so an equation is just its coefficient vector.
type Equation = number[];

/**
 * One edge per (column, plaintext letter), taking the most common ciphertext so
 * a few wrong plaintext letters are outvoted rather than adding bad equations.
 */
function majorityEdges(
  cipher: number[],
  plain: number[],
  period: number,
  length: number,
): Edge[] {
  const counts = new Map<number, number[]>();
  for (let i = 0; i < length; i += 1) {
    const key = (i % period) * ALPHABET_SIZE + plain[i];
    let histogram = counts.get(key);
    if (histogram === undefined) {
      histogram = new Array<number>(ALPHABET_SIZE).fill(0);
      counts.set(key, histogram);
    }
    histogram[cipher[i]] += 1;
  }
  const edges: Edge[] = [];
  for (const [key, histogram] of counts) {
    let bestCipher = 0;
    let bestCount = -1;
    for (let c = 0; c < ALPHABET_SIZE; c += 1) {
      if (histogram[c] > bestCount) {
        bestCount = histogram[c];
        bestCipher = c;
      }
    }
    // Skip singletons: one wrong plaintext letter creates a lone bad pair, so
    // an edge seen only once is more likely noise than signal.
    if (bestCount >= 2) {
      edges.push({
        column: Math.floor(key / ALPHABET_SIZE),
        plain: key % ALPHABET_SIZE,
        cipher: bestCipher,
      });
    }
  }
  return edges;
}

/**
 * Walks a spanning tree of the letter graph, writing each reachable letter's
 * index as base + coeff·offsets. Every edge not used by the tree becomes an
 * equation in the offsets, since both of its endpoints already have a form.
 */
function buildForms(
  edges: Edge[],
  period: number,
): { coeffOf: (number[] | null)[]; equations: Equation[] } {
  const coeffOf: (number[] | null)[] = new Array(ALPHABET_SIZE).fill(null);
  const adjacency: Edge[][] = Array.from({ length: ALPHABET_SIZE }, () => []);
  for (const edge of edges) {
    adjacency[edge.plain].push(edge);
    adjacency[edge.cipher].push(edge);
  }
  const equations: Equation[] = [];
  const zero = (): number[] => new Array<number>(period).fill(0);

  for (let seed = 0; seed < ALPHABET_SIZE; seed += 1) {
    if (coeffOf[seed] !== null || adjacency[seed].length === 0) {
      continue;
    }
    coeffOf[seed] = zero();
    const queue = [seed];
    while (queue.length > 0) {
      const letter = queue.shift() as number;
      const coeff = coeffOf[letter] as number[];
      for (const edge of adjacency[letter]) {
        // index[cipher] - index[plain] = offset[column], so index is a linear
        // combination of the offsets: coeff records those combinations.
        const other = edge.plain === letter ? edge.cipher : edge.plain;
        const sign = edge.plain === letter ? 1 : -1;
        if (coeffOf[other] === null) {
          const next = [...coeff];
          next[edge.column] = mod(next[edge.column] + sign);
          coeffOf[other] = next;
          queue.push(other);
        } else {
          // A second path to the same letter must agree: their coefficient
          // vectors differ by exactly this edge, giving a cycle equation.
          const known = coeffOf[other] as number[];
          const equation = coeff.map((v, c) => mod(v - known[c]));
          equation[edge.column] = mod(equation[edge.column] + sign);
          equations.push(equation);
        }
      }
    }
  }
  return { coeffOf, equations };
}

/** Basis of the equations' null space over the prime field Z_prime. */
function nullSpaceBasis(
  equations: Equation[],
  period: number,
  prime: number,
): number[][] {
  const rows = equations.map((equation) =>
    equation.map((c) => ((c % prime) + prime) % prime),
  );
  const pivotOf = new Array<number>(period).fill(-1);
  let pivotRow = 0;
  for (let col = 0; col < period && pivotRow < rows.length; col += 1) {
    let selected = -1;
    for (let r = pivotRow; r < rows.length; r += 1) {
      if (rows[r][col] % prime !== 0) {
        selected = r;
        break;
      }
    }
    if (selected < 0) {
      continue;
    }
    [rows[pivotRow], rows[selected]] = [rows[selected], rows[pivotRow]];
    const inverse = modInverse(rows[pivotRow][col], prime);
    for (let c = col; c < period; c += 1) {
      rows[pivotRow][c] = (rows[pivotRow][c] * inverse) % prime;
    }
    for (let r = 0; r < rows.length; r += 1) {
      if (r !== pivotRow && rows[r][col] % prime !== 0) {
        const factor = rows[r][col];
        for (let c = col; c < period; c += 1) {
          rows[r][c] =
            (((rows[r][c] - factor * rows[pivotRow][c]) % prime) + prime) %
            prime;
        }
      }
    }
    pivotOf[col] = pivotRow;
    pivotRow += 1;
  }
  const basis: number[][] = [];
  for (let free = 0; free < period; free += 1) {
    if (pivotOf[free] >= 0) {
      continue;
    }
    const vector = new Array<number>(period).fill(0);
    vector[free] = 1;
    for (let col = 0; col < period; col += 1) {
      if (pivotOf[col] >= 0) {
        vector[col] = (prime - rows[pivotOf[col]][free]) % prime;
      }
    }
    basis.push(vector);
  }
  return basis;
}

/** All nonzero vectors spanned by a basis over Z_prime, capped for safety. */
function spannedVectors(
  basis: number[][],
  period: number,
  prime: number,
  cap: number,
): number[][] {
  const vectors: number[][] = [];
  const total = prime ** basis.length;
  if (basis.length === 0 || total > cap) {
    return vectors;
  }
  for (let code = 1; code < total; code += 1) {
    const vector = new Array<number>(period).fill(0);
    let rest = code;
    for (const basisVector of basis) {
      const scalar = rest % prime;
      rest = Math.floor(rest / prime);
      if (scalar > 0) {
        for (let c = 0; c < period; c += 1) {
          vector[c] = (vector[c] + scalar * basisVector[c]) % prime;
        }
      }
    }
    vectors.push(vector);
  }
  return vectors;
}

function crt(mod2: number, mod13: number): number {
  for (let x = 0; x < ALPHABET_SIZE; x += 1) {
    if (x % 2 === ((mod2 % 2) + 2) % 2 && x % 13 === ((mod13 % 13) + 13) % 13) {
      return x;
    }
  }
  return 0;
}

/**
 * Tries to explain every ciphertext letter as `index[cipher] = index[plain] +
 * offset[column]` for one shared letter-to-index map and a shift per column.
 * Returns null when no single alphabet fits, i.e. the columns are independent.
 */
const CANDIDATE_CAP = 8192;

export function reconcileSharedAlphabet(
  cipher: number[],
  plain: number[],
  period: number,
): SharedAlphabetFit | null {
  const length = Math.min(cipher.length, plain.length);
  if (length < ALPHABET_SIZE) {
    return null;
  }
  const edges = majorityEdges(cipher, plain, period, length);
  const { coeffOf, equations } = buildForms(edges, period);

  // The true offsets are a nonzero null-space vector of the cycle equations
  // whose alphabet comes out a real permutation; the trivial zero vector does
  // not. Enumerate the null space over each prime field and combine.
  const zeroVector = new Array<number>(period).fill(0);
  const candidatesMod2 = [
    zeroVector,
    ...spannedVectors(
      nullSpaceBasis(equations, period, 2),
      period,
      2,
      CANDIDATE_CAP,
    ),
  ];
  const candidatesMod13 = [
    zeroVector,
    ...spannedVectors(
      nullSpaceBasis(equations, period, 13),
      period,
      13,
      CANDIDATE_CAP,
    ),
  ];

  let bestFit: SharedAlphabetFit | null = null;
  for (const offsetsMod2 of candidatesMod2) {
    for (const offsetsMod13 of candidatesMod13) {
      const offsets = offsetsMod2.map((value, c) =>
        crt(value, offsetsMod13[c]),
      );
      if (offsets.every((value) => value === 0)) {
        continue;
      }
      const fit = fitFromOffsets(
        coeffOf,
        cipher,
        plain,
        period,
        length,
        offsets,
      );
      if (
        fit !== null &&
        (bestFit === null || fit.residual < bestFit.residual)
      ) {
        bestFit = fit;
        if (fit.residual === 0) {
          return fit;
        }
      }
    }
  }
  return bestFit;
}

/** Builds the alphabet for a candidate offset vector, or null if it is not a valid permutation. */
function fitFromOffsets(
  coeffOf: (number[] | null)[],
  cipher: number[],
  plain: number[],
  period: number,
  length: number,
  offsets: number[],
): SharedAlphabetFit | null {
  const index = new Array<number>(ALPHABET_SIZE).fill(-1);
  for (let letter = 0; letter < ALPHABET_SIZE; letter += 1) {
    const coeff = coeffOf[letter];
    if (coeff !== null) {
      index[letter] = mod(coeff.reduce((sum, v, c) => sum + v * offsets[c], 0));
    }
  }
  const assigned = index.filter((v) => v >= 0);
  if (new Set(assigned).size !== assigned.length) {
    return null;
  }
  let bad = 0;
  for (let i = 0; i < length; i += 1) {
    if (mod(index[plain[i]] + offsets[i % period]) !== index[cipher[i]]) {
      bad += 1;
    }
  }
  const residual = bad / length;
  if (residual > MAX_RESIDUAL) {
    return null;
  }

  const used = new Set(assigned);
  const free: number[] = [];
  for (let position = 0; position < ALPHABET_SIZE; position += 1) {
    if (!used.has(position)) {
      free.push(position);
    }
  }
  for (let letter = 0; letter < ALPHABET_SIZE; letter += 1) {
    if (index[letter] < 0) {
      index[letter] = free.shift() as number;
    }
  }
  const alphabet = new Array<number>(ALPHABET_SIZE);
  index.forEach((position, letter) => {
    alphabet[position] = letter;
  });
  return {
    alphabet: alphabet.map((v) => String.fromCharCode(CODE_A + v)).join(""),
    offsets,
    residual,
    decrypt: (values) =>
      values.map((x, i) => alphabet[mod(index[x] - offsets[i % period])]),
  };
}
