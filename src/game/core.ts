import type { PieceType } from "./types";

export const W = 10;
export const H = 20;
export const GARBAGE = 8;

/** cell value -> neon color */
export const COLORS: Record<number, string> = {
  1: "#00e5ff", // I
  2: "#ffd23f", // O
  3: "#c44dff", // T
  4: "#3dff88", // S
  5: "#ff4d6a", // Z
  6: "#4d7cff", // J
  7: "#ff9f2e", // L
  8: "#5c668c", // garbage
};

export const TYPE_COLOR: Record<PieceType, number> = {
  I: 1,
  O: 2,
  T: 3,
  S: 4,
  Z: 5,
  J: 6,
  L: 7,
};

const BASES: Record<PieceType, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
};

function rotCW(m: number[][]): number[][] {
  const n = m.length;
  return m.map((row, y) => row.map((_, x) => m[n - 1 - x][y]));
}

/** ROT[type][rotation] = list of [dx, dy] cells (y grows downward) */
const ROT: Record<PieceType, [number, number][][]> = {} as unknown as Record<
  PieceType,
  [number, number][][]
>;
for (const t of Object.keys(BASES) as PieceType[]) {
  const rots: number[][][] = [BASES[t]];
  for (let i = 1; i < 4; i++) rots.push(rotCW(rots[i - 1]));
  ROT[t] = rots.map((r) => {
    const cells: [number, number][] = [];
    r.forEach((row, y) =>
      row.forEach((v, x) => {
        if (v) cells.push([x, y]);
      })
    );
    return cells;
  });
}
export { ROT };

export const SPAWN_X: Record<PieceType, number> = {
  I: 3,
  J: 3,
  L: 3,
  O: 4,
  S: 3,
  T: 3,
  Z: 3,
};
export const SPAWN_Y: Record<PieceType, number> = {
  I: -1,
  J: 0,
  L: 0,
  O: 0,
  S: 0,
  T: 0,
  Z: 0,
};

type K = [number, number];

/* SRS wall kicks, converted to y-down coordinates */
const JLSTZ: Record<string, K[]> = {
  "0>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "1>2": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "2>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "3>0": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "1>0": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "2>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "3>2": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "0>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};
const IK: Record<string, K[]> = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "2>1": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "3>2": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "0>3": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

export function kickFor(t: PieceType, from: number, to: number): K[] {
  if (t === "I") return IK[`${from}>${to}`];
  if (t === "O") return [[0, 0]];
  return JLSTZ[`${from}>${to}`];
}

export const pieceCells = (t: PieceType, r: number): [number, number][] =>
  ROT[t][((r % 4) + 4) % 4];

/* ---------------- grid helpers (flat, row-major, W*H) ---------------- */

export const emptyGrid = (): number[] => new Array(W * H).fill(0);

export const g2s = (g: number[]): string => {
  let s = "";
  for (let i = 0; i < g.length; i++) s += g[i];
  return s;
};

export const s2g = (s: string): number[] => {
  const g = emptyGrid();
  for (let i = 0; i < g.length && i < s.length; i++) {
    const c = s.charCodeAt(i) - 48;
    g[i] = c >= 0 && c <= 8 ? c : 0;
  }
  return g;
};

export function collide(
  g: number[],
  cells: [number, number][],
  x: number,
  y: number
): boolean {
  for (const [dx, dy] of cells) {
    const bx = x + dx;
    const by = y + dy;
    if (bx < 0 || bx >= W || by >= H) return true;
    if (by >= 0 && g[by * W + bx]) return true;
  }
  return false;
}

export function newBag(): PieceType[] {
  const a: PieceType[] = ["I", "J", "L", "O", "S", "T", "Z"];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function fullRows(g: number[]): number[] {
  const r: number[] = [];
  for (let y = 0; y < H; y++) {
    let full = true;
    for (let x = 0; x < W; x++)
      if (!g[y * W + x]) {
        full = false;
        break;
      }
    if (full) r.push(y);
  }
  return r;
}

export function clearRows(g: number[], rows: number[]): number[] {
  const skip = new Set(rows);
  const kept: number[] = [];
  for (let y = 0; y < H; y++)
    if (!skip.has(y)) for (let x = 0; x < W; x++) kept.push(g[y * W + x]);
  const out = emptyGrid();
  const top = H - kept.length / W;
  for (let i = 0; i < kept.length / W; i++)
    for (let x = 0; x < W; x++) out[(top + i) * W + x] = kept[i * W + x];
  return out;
}

export function insertTopRows(g: number[], rows: number[][]): number[] {
  const shift = rows.length;
  const out = emptyGrid();
  for (let y = 0; y < H - shift; y++)
    for (let x = 0; x < W; x++) out[(y + shift) * W + x] = g[y * W + x];
  for (let r = 0; r < shift; r++)
    for (let x = 0; x < W; x++) out[r * W + x] = rows[r][x];
  return out;
}

export function randGarbageRow(): number[] {
  const row = new Array(W).fill(GARBAGE);
  const gaps = new Set<number>();
  while (gaps.size < 3) gaps.add(Math.floor(Math.random() * W));
  for (const g of gaps) row[g] = 0;
  return row;
}
