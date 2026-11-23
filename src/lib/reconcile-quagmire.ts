// ABOUTME: Fits one shared mixed alphabet plus per-column shifts to known plaintext/ciphertext pairs.
// ABOUTME: Confirms a periodic cipher is Quagmire III and recovers its alphabet without any search.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause

const ALPHABET_SIZE = 26;
const CODE_A = 65;

// A shared alphabet is accepted only if it explains at least this share of the
// text; genuinely independent per-column alphabets score far worse.
const MAX_RESIDUAL = 0.15;

// How often a pair of letters must recur in its column to enter the
// equations, tried in turn. The general solver errs by column: it takes one
// ciphertext letter for a wrong plaintext letter wherever it occurs, and such
// a pair recurs like a right one. One wrong pair in the equations leaves no
// alphabet that fits. The wrong pairs belong to rare letters, so when nothing
// fits, the fit is tried again from the more frequent pairs alone, and the
// letters left out of the equations are placed afterwards by vote.
const MIN_PAIR_COUNTS = [2, 3, 4, 6, 8, 12];

// A fit has 25 + period free choices: a place for every letter but the first
// and a shift for every column. Each can be spent on explaining one pair of a
// plaintext letter and its ciphertext letter in a column, so a short text is
// explained by any alphabet. A fit must explain this many different pairs
// beyond its free choices. In bench/results/shared-alphabet-fit.tsv, with no
// such bar, a shared alphabet is fitted to 97 of 8,800 texts with an
// unrelated alphabet per column, and each of those fits explains at least 3
// pairs fewer than it has free choices.
const PAIRS_BEYOND_FREE = 4;

export interface SharedAlphabetOptions {
  /** How many different pairs a fit must explain beyond its free choices; a benchmark lowers it to see what the bar keeps out. */
  pairsBeyondFree?: number;
}

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
 * A pair seen fewer than `minCount` times gives no edge.
 */
function majorityEdges(
  cipher: number[],
  plain: number[],
  period: number,
  length: number,
  minCount: number,
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
    // A pair seen once is never an edge: one wrong plaintext letter creates
    // a lone bad pair, so it is more likely noise than signal.
    if (bestCount >= minCount) {
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
 * Letters that no chain of edges joins fall into separate parts, each with a
 * base of its own.
 */
function buildForms(
  edges: Edge[],
  period: number,
): {
  coeffOf: (number[] | null)[];
  equations: Equation[];
  parts: number[][];
} {
  const coeffOf: (number[] | null)[] = new Array(ALPHABET_SIZE).fill(null);
  const adjacency: Edge[][] = Array.from({ length: ALPHABET_SIZE }, () => []);
  for (const edge of edges) {
    adjacency[edge.plain].push(edge);
    adjacency[edge.cipher].push(edge);
  }
  const equations: Equation[] = [];
  const parts: number[][] = [];
  const zero = (): number[] => new Array<number>(period).fill(0);

  for (let seed = 0; seed < ALPHABET_SIZE; seed += 1) {
    if (coeffOf[seed] !== null || adjacency[seed].length === 0) {
      continue;
    }
    coeffOf[seed] = zero();
    const part = [seed];
    parts.push(part);
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
          part.push(other);
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
  return { coeffOf, equations, parts };
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

/** All nonzero vectors spanned by a basis over Z_prime, or none when there are more than `cap`. */
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

// The most shift vectors tried over each prime field. Equations that leave
// more open (over Z13, more than two free dimensions) say too little about
// the shifts to be worth trying each one, which costs a placement by vote.
// With this cap, bench/results/shared-alphabet-fit.tsv has the fit found on
// all 1,999 texts of 75 or more letters per column and on 396 of 399 of 50,
// and a text with no shared alphabet given up on in 27 ms on average at
// period 2, in 3 ms or less at longer periods.
const CANDIDATE_CAP = 169;

/**
 * Tries to explain every ciphertext letter as `index[cipher] = index[plain] +
 * offset[column]` for one shared letter-to-index map and a shift per column.
 * Returns null when no single alphabet fits, i.e. the columns are independent,
 * or when the text holds too few different pairs of letters to tell.
 */
export function reconcileSharedAlphabet(
  cipher: number[],
  plain: number[],
  period: number,
  options: SharedAlphabetOptions = {},
): SharedAlphabetFit | null {
  const length = Math.min(cipher.length, plain.length);
  if (length < ALPHABET_SIZE) {
    return null;
  }
  const minPairs =
    ALPHABET_SIZE - 1 + period + (options.pairsBeyondFree ?? PAIRS_BEYOND_FREE);
  for (const minCount of MIN_PAIR_COUNTS) {
    const fit = fitFromEdges(
      majorityEdges(cipher, plain, period, length, minCount),
      cipher,
      plain,
      period,
      length,
      minPairs,
    );
    if (fit !== null) {
      return fit;
    }
  }
  return null;
}

/** The best shared alphabet that the edges' equations allow, or null if none fits. */
function fitFromEdges(
  edges: Edge[],
  cipher: number[],
  plain: number[],
  period: number,
  length: number,
  minPairs: number,
): SharedAlphabetFit | null {
  const { coeffOf, equations, parts } = buildForms(edges, period);

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
        parts,
        cipher,
        plain,
        period,
        length,
        offsets,
        minPairs,
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

/**
 * Places the groups of letters that the equations did not tie to the placed
 * letters. A group is a part of the letter graph, whose letters lie a known
 * number of places after its first one, or a lone letter that no equation
 * reached. Every place a letter of a group occurs beside a placed letter
 * names the position its group must start at, given the column's offset. The
 * group and free start with the most such places is settled first, and the
 * count is taken again. When no place names a start, nothing in the text
 * ties a group to the placed letters and every free start explains the text
 * as well, so a group of several letters takes the first.
 */
function placeByVote(
  index: number[],
  groups: number[][],
  after: number[],
  cipher: number[],
  plain: number[],
  period: number,
  length: number,
  offsets: number[],
): void {
  const taken = new Array<boolean>(ALPHABET_SIZE).fill(false);
  for (const position of index) {
    if (position >= 0) {
      taken[position] = true;
    }
  }
  const groupOf = new Array<number>(ALPHABET_SIZE).fill(-1);
  groups.forEach((letters, group) => {
    for (const letter of letters) {
      groupOf[letter] = group;
    }
  });
  const placed = new Array<boolean>(groups.length).fill(false);
  const fits = (group: number, start: number): boolean =>
    groups[group].every((letter) => !taken[mod(start + after[letter])]);
  for (;;) {
    const votes = new Int32Array(groups.length * ALPHABET_SIZE);
    for (let i = 0; i < length; i += 1) {
      const p = plain[i];
      const c = cipher[i];
      const offset = offsets[i % period];
      if (index[p] < 0 && index[c] >= 0) {
        const start = mod(index[c] - offset - after[p]);
        votes[groupOf[p] * ALPHABET_SIZE + start] += 1;
      } else if (index[c] < 0 && index[p] >= 0) {
        const start = mod(index[p] + offset - after[c]);
        votes[groupOf[c] * ALPHABET_SIZE + start] += 1;
      }
    }
    let most = 0;
    let group = -1;
    let start = -1;
    for (let g = 0; g < groups.length; g += 1) {
      if (placed[g]) {
        continue;
      }
      for (let at = 0; at < ALPHABET_SIZE; at += 1) {
        if (votes[g * ALPHABET_SIZE + at] > most && fits(g, at)) {
          most = votes[g * ALPHABET_SIZE + at];
          group = g;
          start = at;
        }
      }
    }
    for (let g = 0; group < 0 && g < groups.length; g += 1) {
      if (!placed[g] && groups[g].length > 1) {
        for (let at = 0; group < 0 && at < ALPHABET_SIZE; at += 1) {
          if (fits(g, at)) {
            group = g;
            start = at;
          }
        }
      }
    }
    if (group < 0) {
      return;
    }
    for (const letter of groups[group]) {
      index[letter] = mod(start + after[letter]);
      taken[index[letter]] = true;
    }
    placed[group] = true;
  }
}

/**
 * Builds the alphabet for a candidate offset vector, or null if it is not a
 * valid permutation, leaves too much of the text unexplained, or explains
 * fewer than `minPairs` different pairs of letters.
 */
function fitFromOffsets(
  coeffOf: (number[] | null)[],
  parts: number[][],
  cipher: number[],
  plain: number[],
  period: number,
  length: number,
  offsets: number[],
  minPairs: number,
): SharedAlphabetFit | null {
  // How many places each letter lies after the first letter of its part.
  const after = new Array<number>(ALPHABET_SIZE).fill(0);
  const partOf = new Array<number>(ALPHABET_SIZE).fill(-1);
  let largest: number[] = [];
  for (const [part, letters] of parts.entries()) {
    for (const letter of letters) {
      const coeff = coeffOf[letter] as number[];
      after[letter] = mod(coeff.reduce((sum, v, c) => sum + v * offsets[c], 0));
      partOf[letter] = part;
    }
    if (new Set(letters.map((letter) => after[letter])).size < letters.length) {
      return null;
    }
    if (letters.length > largest.length) {
      largest = letters;
    }
  }
  // The largest part starts the alphabet; the other letters are placed
  // against it.
  const index = new Array<number>(ALPHABET_SIZE).fill(-1);
  for (const letter of largest) {
    index[letter] = after[letter];
  }
  if (largest.length < ALPHABET_SIZE) {
    // Wrong offsets show in the letters the equations reached, so the vote is
    // taken only for offsets that explain those.
    let covered = 0;
    let bad = 0;
    for (let i = 0; i < length; i += 1) {
      const p = plain[i];
      const c = cipher[i];
      if (partOf[p] >= 0 && partOf[p] === partOf[c]) {
        covered += 1;
        if (mod(after[p] + offsets[i % period]) !== after[c]) {
          bad += 1;
        }
      }
    }
    if (bad > MAX_RESIDUAL * covered) {
      return null;
    }
    const groups = parts.filter((letters) => letters !== largest);
    for (let letter = 0; letter < ALPHABET_SIZE; letter += 1) {
      if (partOf[letter] < 0) {
        groups.push([letter]);
      }
    }
    placeByVote(index, groups, after, cipher, plain, period, length, offsets);
  }
  let bad = 0;
  const explained = new Set<number>();
  for (let i = 0; i < length; i += 1) {
    const from = index[plain[i]];
    const to = index[cipher[i]];
    // A letter without a place explains nothing.
    if (from >= 0 && to >= 0 && mod(from + offsets[i % period]) === to) {
      explained.add(
        ((i % period) * ALPHABET_SIZE + plain[i]) * ALPHABET_SIZE + cipher[i],
      );
    } else {
      bad += 1;
    }
  }
  const residual = bad / length;
  if (residual > MAX_RESIDUAL || explained.size < minPairs) {
    return null;
  }

  const assigned = index.filter((v) => v >= 0);
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
