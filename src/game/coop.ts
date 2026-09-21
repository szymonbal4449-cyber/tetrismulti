import {
  W,
  H,
  ROT,
  SPAWN_X,
  SPAWN_Y,
  TYPE_COLOR,
  collide,
  kickFor,
  newBag,
  fullRows,
  clearRows,
  emptyGrid,
  randGarbageRow,
  pieceCells,
} from "./core";
import type { PieceType, CoopInput } from "./types";

interface CP {
  t: PieceType;
  r: number;
  x: number;
  y: number;
  queue: PieceType[];
  fallAcc: number;
  lockT: number;
  lockResets: number;
}

const TICK = 100;
const LOCK_DELAY = 450;
const SCORES = [0, 100, 300, 500, 800];

/**
 * Server-authoritative co-op game. One shared 10x20 board, every player
 * drops their own piece. A garbage wall descends from the top every so
 * often and merges into the stack — top-out (piece locked above the
 * visible area) ends the run.
 */
export class CoopGame {
  board = emptyGrid();
  pieces = new Map<string, CP>();
  order: string[];

  lines = 0;
  score = 0;
  combo = 0;
  maxCombo = 0;

  garbageY: number | null = null;
  garbageCells: number[] = [];
  private gStep = 0;
  private nextGarbageAt = 0;

  startedAt = Date.now();
  over = false;
  overAt = 0;

  constructor(ids: string[]) {
    this.order = ids;
    this.startedAt = Date.now();
    this.nextGarbageAt = this.startedAt + 20000;
    for (const id of ids) {
      const cp: CP = {
        t: "I",
        r: 0,
        x: 0,
        y: 0,
        queue: newBag(),
        fallAcc: 0,
        lockT: 0,
        lockResets: 0,
      };
      this.pieces.set(id, cp);
      this.spawn(id, cp);
    }
  }

  private take(cp: CP): PieceType {
    if (cp.queue.length === 0) cp.queue = newBag();
    return cp.queue.shift()!;
  }

  next(id: string, n = 3): PieceType[] {
    const cp = this.pieces.get(id);
    if (!cp) return [];
    while (cp.queue.length < n) cp.queue.push(...newBag());
    return cp.queue.slice(0, n);
  }

  private spawn(id: string, cp: CP) {
    cp.t = this.take(cp);
    cp.r = 0;
    cp.x = SPAWN_X[cp.t];
    cp.y = SPAWN_Y[cp.t];
    cp.fallAcc = 0;
    cp.lockT = 0;
    cp.lockResets = 0;
    if (collide(this.board, pieceCells(cp.t, cp.r), cp.x, cp.y)) this.topOut();
  }

  private canMove(cp: CP, ox: number, oy: number): boolean {
    return !collide(this.board, pieceCells(cp.t, cp.r), cp.x + ox, cp.y + oy);
  }

  private dropInterval(): number {
    const level = Math.floor(this.lines / 8) + 1;
    return Math.max(90, 700 * Math.pow(0.85, level - 1));
  }

  tickStep(now: number) {
    if (this.over) return;
    const iv = this.dropInterval();
    for (const id of this.order) {
      const cp = this.pieces.get(id);
      if (!cp) continue;
      if (this.canMove(cp, 0, 1)) {
        cp.fallAcc += TICK;
        let moved = false;
        while (cp.fallAcc >= iv) {
          cp.fallAcc -= iv;
          if (this.canMove(cp, 0, 1)) {
            cp.y++;
            moved = true;
          } else break;
        }
        if (moved) {
          cp.lockT = 0;
          cp.lockResets = 0;
        }
      } else {
        cp.lockT += TICK;
        if (cp.lockT >= LOCK_DELAY) this.lock(id);
      }
      if (this.over) return;
    }
    this.tickGarbage(now);
  }

  private tickGarbage(now: number) {
    if (this.garbageY === null) {
      if (now >= this.nextGarbageAt) this.spawnGarbage(now);
      return;
    }
    this.gStep += TICK;
    while (this.gStep >= 2000 && !this.over) {
      this.gStep -= 2000;
      // try to descend; if blocked by the stack (or floor) it merges in
      const below = this.garbageY + 1;
      const blocked =
        below >= H || this.garbageCells.some((v, x) => v !== 0 && this.board[below * W + x] !== 0);
      if (blocked) this.fuseGarbage();
      else this.garbageY++;
    }
  }

  private fuseGarbage() {
    if (this.garbageY === null) return;
    for (let x = 0; x < W; x++) {
      if (this.garbageCells[x] !== 0) this.board[this.garbageY * W + x] = this.garbageCells[x];
    }
    this.garbageY = null;
    this.garbageCells = [];
    this.gStep = 0;
  }

  private spawnGarbage(now: number) {
    this.garbageCells = randGarbageRow();
    this.garbageY = 0;
    this.gStep = 0;
    this.nextGarbageAt =
      now + Math.max(10000, 22000 - Math.floor(this.lines / 8) * 1500);
  }

  nextGarbageIn(now: number): number {
    if (this.garbageY !== null) return 0;
    return Math.max(0, Math.ceil((this.nextGarbageAt - now) / 1000));
  }

  timeSurvived(now: number): number {
    return Math.max(0, Math.floor(((this.over ? this.overAt : now) - this.startedAt) / 1000));
  }

  input(id: string, a: CoopInput): boolean {
    const cp = this.pieces.get(id);
    if (!cp || this.over) return false;
    switch (a) {
      case "left":
        if (this.canMove(cp, -1, 0)) {
          cp.x--;
          this.onGroundReset(cp);
          return true;
        }
        return false;
      case "right":
        if (this.canMove(cp, 1, 0)) {
          cp.x++;
          this.onGroundReset(cp);
          return true;
        }
        return false;
      case "cw":
      case "ccw": {
        if (cp.t === "O") return true;
        const dir = a === "cw" ? 1 : -1;
        const nr = (cp.r + dir + 4) % 4;
        for (const [dx, dy] of kickFor(cp.t, cp.r, nr)) {
          if (this.canMove(cp, dx, dy)) {
            cp.r = nr;
            cp.x += dx;
            cp.y += dy;
            this.onGroundReset(cp);
            return true;
          }
        }
        return false;
      }
      case "down":
        if (this.canMove(cp, 0, 1)) {
          cp.y++;
          cp.fallAcc = 0;
          return true;
        }
        return false;
      case "hard": {
        let d = 0;
        while (this.canMove(cp, 0, 1)) {
          cp.y++;
          d++;
        }
        this.score += 2 * d;
        this.lock(id);
        return d > 0 || true;
      }
    }
  }

  private onGroundReset(cp: CP) {
    if (!this.canMove(cp, 0, 1) && cp.lockResets < 12) {
      cp.lockT = 0;
      cp.lockResets++;
    }
  }

  private hasBoardOverlap(cp: CP, y: number): boolean {
    for (const [dx, dy] of pieceCells(cp.t, cp.r)) {
      const bx = cp.x + dx;
      const by = y + dy;
      if (by >= 0 && bx >= 0 && bx < W && by < H && this.board[by * W + bx] !== 0) return true;
    }
    return false;
  }

  private lock(id: string) {
    const cp = this.pieces.get(id);
    if (!cp || this.over) return;
    // nudge up if another piece locked into our cells this tick
    let py = cp.y;
    let guard = 0;
    while (this.hasBoardOverlap(cp, py) && py > -3 && guard++ < 30) py--;
    let topOut = false;
    for (const [dx, dy] of pieceCells(cp.t, cp.r)) {
      const bx = cp.x + dx;
      const by = py + dy;
      if (by < 0) {
        topOut = true;
        continue;
      }
      if (bx < 0 || bx >= W || by >= H || this.board[by * W + bx] !== 0) {
        topOut = true;
        continue;
      }
      this.board[by * W + bx] = TYPE_COLOR[cp.t];
    }
    const rows = fullRows(this.board);
    if (rows.length) {
      const n = rows.length;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.score += SCORES[n] + (this.combo > 1 ? 50 * (this.combo - 1) : 0);
      this.lines += n;
      if (this.garbageY !== null) for (const r of rows) if (this.garbageY < r) this.garbageY++;
      this.board = clearRows(this.board, rows);
    } else {
      this.combo = 0;
    }
    if (topOut) {
      this.topOut();
      return;
    }
    this.spawn(id, cp);
  }

  private topOut() {
    if (this.over) return;
    this.over = true;
    this.overAt = Date.now();
  }
}
