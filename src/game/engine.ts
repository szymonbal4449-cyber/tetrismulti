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
  insertTopRows,
  emptyGrid,
  randGarbageRow,
  pieceCells,
} from "./core";
import type { PieceType } from "./types";

export type SfxName =
  | "move"
  | "rotate"
  | "lock"
  | "clear"
  | "hard"
  | "garbage"
  | "hold"
  | "topout"
  | "tick"
  | "go"
  | "join"
  | "win"
  | "over"
  | "error";

export interface LockEvent {
  grid: number[];
  cleared: number;
  combo: number;
  maxCombo: number;
  score: number;
  lines: number;
  dead: boolean;
}

interface Cur {
  t: PieceType;
  r: number;
  x: number;
  y: number;
}

const DAS = 160;
const ARR = 40;
const SOFT_MS = 45;
const LOCK_DELAY = 450;
const SCORES = [0, 100, 300, 500, 800];

/**
 * Client-side battle Tetris engine. The local player's board is
 * authoritative on the client (snappy controls); line clears / locks are
 * reported to the server which then dishes garbage out to the opponents.
 */
export class BattleEngine {
  grid = emptyGrid();
  cur: Cur | null = null;
  queue: PieceType[] = [];
  hold: PieceType | null = null;
  canHold = true;

  score = 0;
  lines = 0;
  combo = 0;
  maxCombo = 0;
  /** garbage rows we have already consumed from the server */
  garbageConsumed = 0;

  running = false;
  dead = false;
  started = false;

  private hLeft = false;
  private hRight = false;
  private hDown = false;
  private dasDir = 0;
  private dasT = 0;
  private arrT = 0;
  private softAcc = 0;
  private dropAcc = 0;
  private lockT = 0;
  private lockResets = 0;

  /** >0 while a cleared row is flashing white */
  flashT = 0;
  flashRows: number[] = [];
  /** >0 while a garbage warning flashes at the top */
  garbageFlashT = 0;

  onLock: ((e: LockEvent) => void) | null = null;
  onSfx: ((n: SfxName) => void) | null = null;

  constructor() {
    this.queue = newBag();
    this.queue.push(...newBag());
    this.cur = this.makeCur(this.queue.shift()!);
  }

  private sfx(n: SfxName) {
    this.onSfx?.(n);
  }

  private makeCur(t: PieceType): Cur {
    return { t, r: 0, x: SPAWN_X[t], y: SPAWN_Y[t] };
  }

  private refill() {
    if (this.queue.length < 7) this.queue.push(...newBag());
  }

  level(): number {
    return Math.floor(this.lines / 5) + 1;
  }

  dropInterval(): number {
    return Math.max(70, 720 * Math.pow(0.85, this.level() - 1));
  }

  /** resync after a refresh mid-game */
  load(grid: number[], score: number, lines: number, combo: number, maxCombo: number, garbage: number) {
    this.grid = grid;
    this.score = score;
    this.lines = lines;
    this.combo = combo;
    this.maxCombo = maxCombo;
    this.garbageConsumed = garbage;
    if (this.queue.length < 7) this.queue = newBag();
    this.cur = this.makeCur(this.queue.shift()!);
    this.refill();
    this.hLeft = this.hRight = this.hDown = false;
    this.dasDir = 0;
    this.lockT = 0;
  }

  start() {
    if (!this.cur) return;
    if (collide(this.grid, ROT[this.cur.t][this.cur.r], this.cur.x, this.cur.y)) {
      this.dead = true;
      this.running = false;
      this.emitLock(0, true);
      return;
    }
    this.running = true;
    this.started = true;
  }

  stop() {
    this.running = false;
  }

  grounded(): boolean {
    const c = this.cur;
    if (!c) return true;
    return collide(this.grid, ROT[c.t][c.r], c.x, c.y + 1);
  }

  ghostY(): number {
    const c = this.cur;
    if (!c) return 0;
    let y = c.y;
    while (!collide(this.grid, ROT[c.t][c.r], c.x, y + 1)) y++;
    return y;
  }

  press(dir: "left" | "right") {
    if (dir === "left") this.hLeft = true;
    else this.hRight = true;
  }
  release(dir: "left" | "right") {
    if (dir === "left") this.hLeft = false;
    else this.hRight = false;
  }
  pressDown() {
    this.hDown = true;
  }
  releaseDown() {
    this.hDown = false;
  }

  rotate(dir: 1 | -1) {
    const c = this.cur;
    if (!c || !this.running) return;
    if (c.t === "O") {
      this.sfx("rotate");
      return;
    }
    const nr = (c.r + dir + 4) % 4;
    for (const [dx, dy] of kickFor(c.t, c.r, nr)) {
      if (!collide(this.grid, ROT[c.t][nr], c.x + dx, c.y + dy)) {
        c.r = nr;
        c.x += dx;
        c.y += dy;
        this.sfx("rotate");
        this.onGroundReset();
        return;
      }
    }
  }

  private moveH(dir: -1 | 1): boolean {
    const c = this.cur;
    if (!c) return false;
    if (!collide(this.grid, ROT[c.t][c.r], c.x + dir, c.y)) {
      c.x += dir;
      this.sfx("move");
      this.onGroundReset();
      return true;
    }
    return false;
  }

  private onGroundReset() {
    if (this.grounded() && this.lockResets < 15) {
      this.lockT = 0;
      this.lockResets++;
    }
  }

  hardDrop() {
    const c = this.cur;
    if (!c || !this.running) return;
    let d = 0;
    while (!collide(this.grid, ROT[c.t][c.r], c.x, c.y + 1)) {
      c.y++;
      d++;
    }
    this.score += 2 * d;
    this.sfx("hard");
    this.lock();
  }

  holdSwap() {
    const c = this.cur;
    if (!c || !this.running || !this.canHold) return;
    this.sfx("hold");
    if (this.hold) {
      const h = this.hold;
      this.hold = c.t;
      this.cur = this.makeCur(h);
    } else {
      this.hold = c.t;
      this.cur = this.makeCur(this.queue.shift()!);
      this.refill();
    }
    this.canHold = false;
    this.lockT = 0;
    this.lockResets = 0;
    this.dropAcc = 0;
  }

  /** insert n garbage rows at the top (server told us we received n rows) */
  insertGarbage(n: number) {
    for (let i = 0; i < n; i++) {
      this.grid = insertTopRows(this.grid, [randGarbageRow()]);
      const c = this.cur;
      if (c) {
        let guard = 0;
        while (c.y > -4 && collide(this.grid, ROT[c.t][c.r], c.x, c.y) && guard++ < 40) c.y--;
      }
    }
    this.garbageFlashT = 350;
    this.lockT = 0;
    this.sfx("garbage");
  }

  update(dt: number) {
    if (!this.running || !this.cur) return;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.garbageFlashT > 0) this.garbageFlashT -= dt;

    // horizontal DAS / ARR
    const wantL = this.hLeft;
    const wantR = this.hRight;
    if (wantL !== wantR && (wantL || wantR)) {
      const dir: -1 | 1 = wantL ? -1 : 1;
      if (this.dasDir !== dir) {
        this.dasDir = dir;
        this.dasT = 0;
        this.arrT = 0;
        this.moveH(dir);
      } else {
        this.dasT += dt;
        if (this.dasT >= DAS) {
          this.arrT += dt;
          while (this.arrT >= ARR && this.running && this.cur) {
            this.arrT -= ARR;
            if (!this.moveH(dir)) break;
          }
        }
      }
    } else {
      this.dasDir = 0;
      this.dasT = 0;
      this.arrT = 0;
    }

    // soft drop
    if (this.hDown) {
      this.softAcc += dt;
      while (this.softAcc >= SOFT_MS && this.running && this.cur) {
        this.softAcc -= SOFT_MS;
        if (!this.grounded()) {
          this.cur.y++;
          this.score += 1;
          this.dropAcc = 0;
        } else break;
      }
    } else this.softAcc = 0;

    // gravity / lock delay
    if (this.grounded()) {
      this.lockT += dt;
      if (this.lockT >= LOCK_DELAY) this.lock();
    } else {
      this.lockT = 0;
      this.lockResets = 0;
      this.dropAcc += dt;
      const iv = this.dropInterval();
      while (this.dropAcc >= iv && this.running && this.cur) {
        this.dropAcc -= iv;
        if (this.grounded()) break;
        this.cur.y++;
      }
    }
  }

  private lock() {
    const c = this.cur;
    if (!c) return;
    let topOut = false;
    for (const [dx, dy] of pieceCells(c.t, c.r)) {
      const bx = c.x + dx;
      const by = c.y + dy;
      if (by < 0 || by >= H || bx < 0 || bx >= W) {
        topOut = true;
        continue;
      }
      this.grid[by * W + bx] = TYPE_COLOR[c.t];
    }
    let cleared = 0;
    const rows = fullRows(this.grid);
    if (rows.length) {
      cleared = rows.length;
      this.grid = clearRows(this.grid, rows);
      this.lines += cleared;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.flashT = 240;
      this.flashRows = rows;
      this.score +=
        SCORES[cleared] * this.level() + (this.combo > 1 ? 50 * (this.combo - 1) * this.level() : 0);
      this.sfx("clear");
    } else {
      this.combo = 0;
      this.sfx("lock");
    }
    this.emitLock(cleared, topOut);
  }

  private emitLock(cleared: number, topOut: boolean) {
    const e: LockEvent = {
      grid: [...this.grid],
      cleared,
      combo: this.combo,
      maxCombo: this.maxCombo,
      score: this.score,
      lines: this.lines,
      dead: topOut,
    };
    this.canHold = true;
    if (topOut) {
      this.running = false;
      this.dead = true;
      this.cur = null;
      this.sfx("topout");
    } else {
      this.cur = this.makeCur(this.queue.shift()!);
      this.refill();
      this.lockT = 0;
      this.lockResets = 0;
      this.dropAcc = 0;
    }
    this.onLock?.(e);
  }
}
