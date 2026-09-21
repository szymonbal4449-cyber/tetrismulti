"use client";

import { useEffect, useRef } from "react";
import { BattleEngine } from "@/game/engine";
import { sfx } from "@/game/sfx";
import { COLORS, TYPE_COLOR, W, H, g2s, s2g, pieceCells } from "@/game/core";
import { boardBase, drawGrid, drawPiece, drawGhost } from "@/game/draw";
import type { RoomState, WirePlayer } from "@/game/types";

const CELL = 28;
const MINI = 11;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  s: number;
}

interface Props {
  room: RoomState;
  selfId: string;
  send: (p: Record<string, unknown>) => void;
}

export function BattleView({ room, selfId, send }: Props) {
  const roomRef = useRef(room);
  roomRef.current = room;
  const sendRef = useRef(send);
  sendRef.current = send;

  const engRef = useRef<BattleEngine | null>(null);
  if (!engRef.current) {
    const e = new BattleEngine();
    e.onLock = (ev) =>
      sendRef.current({
        action: "battleLock",
        grid: g2s(ev.grid),
        cleared: ev.cleared,
        combo: ev.combo,
        maxCombo: ev.maxCombo,
        score: ev.score,
        lines: ev.lines,
        dead: ev.dead,
      });
    engRef.current = e;
  }

  const mainRef = useRef<HTMLCanvasElement>(null);
  const miniRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const nextRef = useRef<HTMLCanvasElement>(null);
  const holdRef = useRef<HTMLCanvasElement>(null);
  const shakeWrapRef = useRef<HTMLDivElement>(null);
  const scoreEl = useRef<HTMLSpanElement>(null);
  const linesEl = useRef<HTMLSpanElement>(null);
  const comboEl = useRef<HTMLSpanElement>(null);
  const levelEl = useRef<HTMLSpanElement>(null);
  const garbageEl = useRef<HTMLSpanElement>(null);

  const particles = useRef<Particle[]>([]);
  const shake = useRef(0);

  /* ------------------------------ engine fx ------------------------------ */
  useEffect(() => {
    const e = engRef.current!;
    e.onSfx = (n) => {
      sfx(n);
      if (n === "clear") {
        for (const row of e.flashRows) {
          for (let i = 0; i < 10; i++) {
            particles.current.push({
              x: Math.random() * W * CELL,
              y: (row + 0.5) * CELL,
              vx: (Math.random() - 0.5) * 340,
              vy: -Math.random() * 220 - 60,
              life: 0,
              max: 0.5 + Math.random() * 0.4,
              color: ["#00e5ff", "#ffd23f", "#ff3ea5", "#ffffff"][Math.floor(Math.random() * 4)],
              s: 3 + Math.random() * 4,
            });
          }
        }
        shake.current = Math.max(shake.current, 4);
      } else if (n === "garbage") {
        for (let i = 0; i < 14; i++) {
          particles.current.push({
            x: Math.random() * W * CELL,
            y: Math.random() * CELL * 2,
            vx: (Math.random() - 0.5) * 120,
            vy: Math.random() * 160 + 40,
            life: 0,
            max: 0.5,
            color: "#5c668c",
            s: 4 + Math.random() * 5,
          });
        }
        shake.current = Math.max(shake.current, 9);
      } else if (n === "hard") {
        shake.current = Math.max(shake.current, 3);
      } else if (n === "topout") {
        shake.current = Math.max(shake.current, 12);
      }
    };
    return () => {
      e.onSfx = null;
    };
  }, []);

  /* ------------------------------ keyboard ------------------------------- */
  useEffect(() => {
    const e = engRef.current!;
    const down = (ev: KeyboardEvent) => {
      const k = ev.key;
      if (
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowDown",
          "ArrowUp",
          " ",
          "a",
          "d",
          "w",
          "s",
          "x",
          "X",
          "z",
          "Z",
          "c",
          "C",
        ].includes(k)
      )
        ev.preventDefault();
      if (ev.repeat) return;
      switch (k) {
        case "ArrowLeft":
        case "a":
        case "A":
          e.press("left");
          break;
        case "ArrowRight":
        case "d":
        case "D":
          e.press("right");
          break;
        case "ArrowDown":
        case "s":
        case "S":
          e.pressDown();
          break;
        case "ArrowUp":
        case "w":
        case "W":
        case "x":
        case "X":
          e.rotate(1);
          break;
        case "z":
        case "Z":
          e.rotate(-1);
          break;
        case " ":
          e.hardDrop();
          break;
        case "c":
        case "C":
          e.holdSwap();
          break;
      }
    };
    const up = (ev: KeyboardEvent) => {
      switch (ev.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          e.release("left");
          break;
        case "ArrowRight":
        case "d":
        case "D":
          e.release("right");
          break;
        case "ArrowDown":
        case "s":
        case "S":
          e.releaseDown();
          break;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  /* ------------------------------- rAF loop ------------------------------ */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const drawMiniPiece = (
      cv: HTMLCanvasElement | null,
      t: string | null
    ) => {
      if (!cv) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (!t) return;
      const cells = pieceCells(t as "I", 0);
      const xs = cells.map((c) => c[0]);
      const ys = cells.map((c) => c[1]);
      const minx = Math.min(...xs);
      const miny = Math.min(...ys);
      const bw = Math.max(...xs) - minx + 1;
      const bh = Math.max(...ys) - miny + 1;
      const c = 13;
      const ox = (cv.width - bw * c) / 2 - minx * c;
      const oy = (cv.height - bh * c) / 2 - miny * c;
      for (const [dx, dy] of cells) {
        const px = ox + dx * c;
        const py = oy + dy * c;
        ctx.fillStyle = COLORS[TYPE_COLOR[t as "I"]];
        ctx.fillRect(px + 1, py + 1, c - 2, c - 2);
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillRect(px + 1, py + 1, c - 2, 2);
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.strokeRect(px + 1.5, py + 1.5, c - 3, c - 3);
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const e = engRef.current!;
      const r = roomRef.current;
      const self = r.players.find((p) => p.id === selfId);

      // (re)start engine at the end of the countdown
      if (!e.started && !e.dead) {
        const ready =
          (r.phase === "playing" && self) ||
          (r.phase === "countdown" && self && Date.now() >= (r.countdownEndsAt ?? 0));
        if (ready && self) {
          e.load(
            s2g(self.gridStr),
            self.score,
            self.lines,
            self.combo,
            self.maxCombo,
            self.garbage
          );
          e.start();
        }
      }
      if (r.phase === "over" || (self && !self.alive)) e.stop();

      e.update(dt);

      // consume server-queued garbage
      if (self && self.alive) {
        const diff = self.garbage - e.garbageConsumed;
        if (diff > 0) {
          e.insertGarbage(diff);
          e.garbageConsumed = self.garbage;
        }
      }

      // main canvas
      const cv = mainRef.current;
      if (cv) {
        const ctx = cv.getContext("2d");
        if (ctx) {
          boardBase(ctx, CELL);
          drawGrid(ctx, CELL, e.grid);
          if (e.cur) {
            const g = e.ghostY();
            if (g > e.cur.y)
              drawGhost(ctx, CELL, pieceCells(e.cur.t, e.cur.r), e.cur.x, g, COLORS[TYPE_COLOR[e.cur.t]]);
            drawPiece(ctx, CELL, e.cur.t, e.cur.r, e.cur.x, e.cur.y);
          }
          if (e.flashT > 0) {
            ctx.fillStyle = `rgba(255,255,255,${(e.flashT / 240) * 0.85})`;
            for (const row of e.flashRows) ctx.fillRect(0, row * CELL, W * CELL, CELL);
          }
          if (e.garbageFlashT > 0) {
            const a = (e.garbageFlashT / 350) * 0.5;
            const grad = ctx.createLinearGradient(0, 0, 0, CELL * 5);
            grad.addColorStop(0, `rgba(255,77,106,${a})`);
            grad.addColorStop(1, "rgba(255,77,106,0)");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W * CELL, CELL * 5);
          }
          // particles
          const arr = particles.current;
          for (let i = arr.length - 1; i >= 0; i--) {
            const p = arr[i];
            p.life += dt / 1000;
            if (p.life >= p.max) {
              arr.splice(i, 1);
              continue;
            }
            p.x += (p.vx * dt) / 1000;
            p.y += (p.vy * dt) / 1000;
            p.vy += (dt / 1000) * 500;
            ctx.globalAlpha = 1 - p.life / p.max;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.s, p.s);
            ctx.globalAlpha = 1;
          }
        }
      }

      // mini boards of opponents
      for (const p of r.players) {
        if (p.id === selfId) continue;
        const mc = miniRefs.current[p.id];
        if (!mc) continue;
        const mctx = mc.getContext("2d");
        if (!mctx) continue;
        boardBase(mctx, MINI, false);
        if (p.gridStr) drawGrid(mctx, MINI, s2g(p.gridStr));
        if (!p.alive) {
          mctx.fillStyle = "rgba(4,5,14,0.72)";
          mctx.fillRect(0, 0, mc.width, mc.height);
          mctx.fillStyle = "#ff4d6a";
          mctx.font = "bold 16px monospace";
          mctx.textAlign = "center";
          mctx.fillText("OUT", mc.width / 2, mc.height / 2);
        }
      }

      // next / hold
      drawMiniPiece(nextRef.current, e.cur ? e.queue[0] ?? null : null);
      drawMiniPiece(holdRef.current, e.hold);

      // HUD text
      if (scoreEl.current) scoreEl.current.textContent = String(e.score);
      if (linesEl.current) linesEl.current.textContent = String(e.lines);
      if (levelEl.current) levelEl.current.textContent = String(e.level());
      if (comboEl.current)
        comboEl.current.textContent = e.combo >= 2 ? `COMBO x${e.combo}` : "";
      if (garbageEl.current)
        garbageEl.current.textContent = self ? String(Math.max(0, self.garbage - e.garbageConsumed)) : "0";

      // shake
      if (shakeWrapRef.current) {
        if (shake.current > 0.2) {
          const s = shake.current;
          shakeWrapRef.current.style.transform = `translate(${(Math.random() - 0.5) * s}px, ${
            (Math.random() - 0.5) * s
          }px)`;
          shake.current *= 0.88;
        } else {
          shakeWrapRef.current.style.transform = "";
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [selfId]);

  const opponents: WirePlayer[] = room.players.filter((p) => p.id !== selfId);
  const self = room.players.find((p) => p.id === selfId);
  const fillPct = self ? Math.round((self.gridStr.replace(/0/g, "").length / 20) * 100) : 0;

  return (
    <div className="flex w-full flex-col items-center gap-5 lg:flex-row lg:items-start lg:justify-center">
      {/* left: own stats */}
      <div className="order-2 flex w-full max-w-[300px] flex-col gap-3 lg:order-1">
        <div className="panel p-3">
          <div className="font-arcade text-[8px] text-dim">WYKRYCIE</div>
          <span className="font-arcade mt-1 block text-lg text-cy" ref={scoreEl}>
            0
          </span>
          <div className="mt-2 flex justify-between text-xs text-dim">
            <span>
              LINIE <b className="font-arcade text-[10px] text-tx" ref={linesEl}>0</b>
            </span>
            <span>
              POZIOM <b className="font-arcade text-[10px] text-tx" ref={levelEl}>1</b>
            </span>
          </div>
        </div>
        <div className="panel p-3">
          <div className="font-arcade mb-1 text-[8px] text-dim">ZAPAS (HOLD)</div>
          <div className="flex h-[68px] items-center justify-center border border-line bg-ink">
            <canvas ref={holdRef} width={72} height={68} />
          </div>
        </div>
        <div className="panel p-3">
          <div className="font-arcade mb-1 text-[8px] text-dim">PRZYSZŁOŚĆ</div>
          <div className="flex items-center justify-center gap-1 border border-line bg-ink p-1">
            <canvas ref={nextRef} width={72} height={68} />
          </div>
        </div>
        <div className={`panel p-3 ${self && !self.alive ? "border-pk/60" : ""}`}>
          <div className="flex items-center justify-between">
            <span className="font-arcade text-[8px] text-dim">ŚMIECI DO CIEBIE</span>
            <span className="font-arcade text-sm text-pk" ref={garbageEl}>
              0
            </span>
          </div>
          <div className="mt-2 text-xs text-dim">
            Wypełnienie twojej planszy:{" "}
            <b className="text-tx">{Math.min(100, fillPct)}%</b>
          </div>
          <span ref={comboEl} className="font-arcade mt-2 block text-[10px] text-am" />
        </div>
      </div>

      {/* center: main board */}
      <div className="order-1 lg:order-2">
        <div ref={shakeWrapRef} className="relative">
          <div
            className="pointer-events-none absolute -inset-1"
            style={{ boxShadow: "0 0 40px rgba(0,229,255,0.18), inset 0 0 24px rgba(0,0,0,0.6)" }}
          />
          <canvas
            ref={mainRef}
            width={W * CELL}
            height={H * CELL}
            className="block border-2 border-line bg-ink"
            style={{ maxWidth: "min(280px, 92vw)" }}
          />
          {self && !self.alive && room.phase === "playing" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/70">
              <div className="font-arcade text-xl text-pk title-glow-pk pop-in">TOP OUT!</div>
              <div className="mt-3 text-sm text-dim">Czekasz na wynik...</div>
            </div>
          )}
        </div>
        {/* touch controls */}
        <div className="mt-3 grid grid-cols-3 gap-2 lg:hidden">
          <button
            className="btn btn-dim"
            onPointerDown={() => engRef.current?.press("left")}
            onPointerUp={() => engRef.current?.release("left")}
            onPointerLeave={() => engRef.current?.release("left")}
          >
            ←
          </button>
          <button
            className="btn btn-dim"
            onPointerDown={() => engRef.current?.pressDown()}
            onPointerUp={() => engRef.current?.releaseDown()}
            onPointerLeave={() => engRef.current?.releaseDown()}
          >
            ▼
          </button>
          <button
            className="btn btn-dim"
            onPointerDown={() => engRef.current?.press("right")}
            onPointerUp={() => engRef.current?.release("right")}
            onPointerLeave={() => engRef.current?.release("right")}
          >
            →
          </button>
          <button className="btn btn-dim" onPointerDown={() => engRef.current?.rotate(1)}>
            ⟳
          </button>
          <button className="btn btn-cy" onPointerDown={() => engRef.current?.hardDrop()}>
            DROP
          </button>
          <button className="btn btn-dim" onPointerDown={() => engRef.current?.holdSwap()}>
            HOLD
          </button>
        </div>
      </div>

      {/* right: opponents */}
      <div className="order-3 flex w-full max-w-[300px] flex-col gap-3">
        <div className="font-arcade text-[9px] text-dim">PRZECIWNIKOWIE</div>
        {opponents.map((p, i) => {
          const pct = Math.round((p.gridStr.replace(/0/g, "").length / 20) * 100);
          return (
            <div
              key={p.id}
              className={`panel flex items-center gap-3 p-3 ${p.alive ? "" : "opacity-60"}`}
            >
              <div
                className="h-3 w-3 shrink-0"
                style={{
                  background: ["#00e5ff", "#ff3ea5", "#ffb300", "#3dff88"][(i + 1) % 4],
                  boxShadow: "0 0 8px currentColor",
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-body text-sm font-bold text-tx">{p.nick}</span>
                  {p.isHost && <span className="text-[10px]">👑</span>}
                  {!p.alive && <span className="font-arcade text-[8px] text-pk">OUT</span>}
                </div>
                <div className="mt-1 h-1.5 w-full border border-line bg-ink">
                  <div
                    className="h-full transition-all duration-700"
                    style={{ width: `${Math.min(100, pct)}%`, background: "#ff4d6a" }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-dim">
                  <span>{p.lines} linii</span>
                  <span>{p.score} pkt</span>
                </div>
              </div>
              <canvas
                ref={(el) => {
                  miniRefs.current[p.id] = el;
                }}
                width={W * MINI}
                height={H * MINI}
                className="block shrink-0 border border-line"
              />
            </div>
          );
        })}
        {opponents.length === 0 && (
          <div className="panel p-4 text-center text-xs text-dim">Brak przeciwników</div>
        )}
      </div>
    </div>
  );
}
