"use client";

import { useEffect, useRef } from "react";
import { sfx } from "@/game/sfx";
import { W, H, s2g, pieceCells } from "@/game/core";
import { boardBase, drawGrid, drawCells } from "@/game/draw";
import { TetraIcon } from "./bits";
import { PLAYER_COLORS, type RoomState, type WirePlayer, type CoopInput, type PieceType } from "@/game/types";

const CELL = 30;

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

interface LerpPiece {
  t: PieceType | null;
  r: number;
  x: number;
  y: number;
}

interface Props {
  room: RoomState;
  selfId: string;
  send: (p: Record<string, unknown>) => void;
}

export function CoopView({ room, selfId, send }: Props) {
  const roomRef = useRef(room);
  roomRef.current = room;
  const sendRef = useRef(send);
  sendRef.current = send;

  const mainRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const linesEl = useRef<HTMLSpanElement>(null);
  const scoreEl = useRef<HTMLSpanElement>(null);
  const comboEl = useRef<HTMLSpanElement>(null);
  const timeEl = useRef<HTMLSpanElement>(null);
  const garbageEl = useRef<HTMLSpanElement>(null);
  const warnRef = useRef<HTMLDivElement>(null);

  const lerps = useRef<Record<string, LerpPiece>>({});
  const particles = useRef<Particle[]>([]);
  const shake = useRef(0);
  const prevLines = useRef(-1);
  const held = useRef<{ dir: 0 | -1 | 1; t: number; arr: number }>({ dir: 0, t: 0, arr: 0 });

  const input = (a: CoopInput) => sendRef.current({ action: "coopInput", input: a });

  /* ------------------------------ keyboard ------------------------------- */
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      const k = ev.key;
      if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " ", "a", "d", "w", "s", "x", "X", "z", "Z"].includes(k))
        ev.preventDefault();
      if (ev.repeat) return;
      switch (k) {
        case "ArrowLeft":
        case "a":
        case "A":
          held.current = { dir: -1, t: 0, arr: 0 };
          input("left");
          sfx("move");
          break;
        case "ArrowRight":
        case "d":
        case "D":
          held.current = { dir: 1, t: 0, arr: 0 };
          input("right");
          sfx("move");
          break;
        case "ArrowDown":
        case "s":
        case "S":
          input("down");
          break;
        case "ArrowUp":
        case "w":
        case "W":
        case "x":
        case "X":
          input("cw");
          sfx("rotate");
          break;
        case "z":
        case "Z":
          input("ccw");
          sfx("rotate");
          break;
        case " ":
          input("hard");
          sfx("hard");
          break;
      }
    };
    const up = (ev: KeyboardEvent) => {
      const k = ev.key;
      if (["ArrowLeft", "a", "A", "ArrowRight", "d", "D"].includes(k)) held.current.dir = 0;
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

    const loop = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const r = roomRef.current;
      const c = r.coop;

      // DAS repeat for held direction
      const h = held.current;
      if (h.dir !== 0 && r.phase === "playing") {
        h.t += dt;
        if (h.t >= 150) {
          h.arr += dt;
          while (h.arr >= 40) {
            h.arr -= 40;
            input(h.dir < 0 ? "left" : "right");
          }
        }
      }

      if (c) {
        // line clear fx
        if (prevLines.current >= 0 && c.lines > prevLines.current) {
          sfx("clear");
          shake.current = Math.max(shake.current, 4);
          for (let i = 0; i < 40; i++)
            particles.current.push({
              x: Math.random() * W * CELL,
              y: (12 + Math.random() * 8) * CELL,
              vx: (Math.random() - 0.5) * 380,
              vy: -Math.random() * 260 - 80,
              life: 0,
              max: 0.5 + Math.random() * 0.4,
              color: [PLAYER_COLORS[0], PLAYER_COLORS[1], PLAYER_COLORS[2], PLAYER_COLORS[3]][i % 4],
              s: 3 + Math.random() * 4,
            });
        }
        prevLines.current = c.lines;

        // lerp pieces toward server targets
        for (const id of Object.keys(c.pieces)) {
          const tp = c.pieces[id];
          const lp = lerps.current[id] ?? { t: null, r: 0, x: tp.x, y: tp.y };
          if (lp.t !== tp.t || lp.r !== tp.r || Math.abs(tp.x - lp.x) + Math.abs(tp.y - lp.y) > 2.5) {
            lp.t = tp.t;
            lp.r = tp.r;
            lp.x = tp.x;
            lp.y = tp.y;
          } else {
            const k = 1 - Math.exp(-dt / 26);
            lp.x += (tp.x - lp.x) * k;
            lp.y += (tp.y - lp.y) * k;
          }
          lp.t = tp.t;
          lp.r = tp.r;
          lerps.current[id] = lp;
        }

        // draw
        const cv = mainRef.current;
        if (cv) {
          const ctx = cv.getContext("2d");
          if (ctx) {
            boardBase(ctx, CELL);
            drawGrid(ctx, CELL, s2g(c.boardStr));
            // garbage row outline
            if (c.garbageY !== null) {
              const a = 0.5 + 0.5 * Math.sin(now / 120);
              ctx.strokeStyle = `rgba(255,77,106,${0.35 + 0.4 * a})`;
              ctx.lineWidth = 2;
              ctx.strokeRect(1, c.garbageY * CELL + 1, W * CELL - 2, CELL - 2);
            }
            // pieces (player-colored)
            r.players.forEach((p, idx) => {
              const lp = lerps.current[p.id];
              if (!lp || !lp.t) return;
              drawCells(
                ctx,
                CELL,
                pieceCells(lp.t, lp.r),
                Math.round(lp.x * 100) / 100,
                Math.round(lp.y * 100) / 100,
                PLAYER_COLORS[idx % 4],
                0.95,
                true
              );
            });
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
              p.vy += (dt / 1000) * 520;
              ctx.globalAlpha = 1 - p.life / p.max;
              ctx.fillStyle = p.color;
              ctx.fillRect(p.x, p.y, p.s, p.s);
              ctx.globalAlpha = 1;
            }
          }
        }

        // HUD
        if (linesEl.current) linesEl.current.textContent = String(c.lines);
        if (scoreEl.current) scoreEl.current.textContent = String(c.score);
        if (comboEl.current) comboEl.current.textContent = c.combo >= 2 ? `COMBO x${c.combo}` : "";
        const m = Math.floor(c.time / 60);
        const s = c.time % 60;
        if (timeEl.current) timeEl.current.textContent = `${m}:${String(s).padStart(2, "0")}`;
        if (garbageEl.current)
          garbageEl.current.textContent = c.garbageY !== null ? "SPADA!" : `${c.nextGarbageIn}s`;
        if (warnRef.current)
          warnRef.current.className =
            "mt-1 h-1.5 w-full " +
            (c.garbageY !== null || c.nextGarbageIn <= 5 ? "pulse-warn" : "");
      }

      // shake
      if (wrapRef.current) {
        if (shake.current > 0.2) {
          const s = shake.current;
          wrapRef.current.style.transform = `translate(${(Math.random() - 0.5) * s}px, ${
            (Math.random() - 0.5) * s
          }px)`;
          shake.current *= 0.88;
        } else wrapRef.current.style.transform = "";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex w-full flex-col items-center gap-5 lg:flex-row lg:items-start lg:justify-center">
      {/* left: team panels */}
      <div className="order-2 flex w-full max-w-[320px] flex-col gap-3 lg:order-1">
        {room.players.map((p, i) => {
          const piece = room.coop?.pieces[p.id];
          const next = room.coop?.next[p.id] ?? [];
          return (
            <div key={p.id} className="panel flex items-center gap-3 p-3">
              <div
                className="h-8 w-1.5 shrink-0"
                style={{ background: PLAYER_COLORS[i % 4], boxShadow: `0 0 10px ${PLAYER_COLORS[i % 4]}` }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-body text-sm font-bold" style={{ color: PLAYER_COLORS[i % 4] }}>
                    {p.nick}
                  </span>
                  {p.id === selfId && <span className="font-arcade text-[7px] text-dim">(TY)</span>}
                  {p.isHost && <span className="text-[10px]">👑</span>}
                  {!p.connected && room.phase === "playing" && (
                    <span className="font-arcade blink text-[7px] text-am">ODŁĄCZONY</span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-arcade text-[7px] text-dim">NASTĘPNE</span>
                  <div className="flex items-center gap-1">
                    {piece && <TetraIcon t={piece.t} size={16} />}
                    {next.map((t, j) => (
                      <TetraIcon key={j} t={t} size={13} dim={j > 0} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* center: shared board */}
      <div className="order-1 lg:order-2">
        <div ref={wrapRef} className="relative">
          <div
            className="pointer-events-none absolute -inset-1"
            style={{ boxShadow: "0 0 40px rgba(61,255,136,0.15), inset 0 0 24px rgba(0,0,0,0.6)" }}
          />
          <canvas
            ref={mainRef}
            width={W * CELL}
            height={H * CELL}
            className="block border-2 border-line bg-ink"
            style={{ maxWidth: "min(300px, 92vw)" }}
          />
          {room.phase === "countdown" && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink/60">
              <div className="font-arcade text-sm text-li title-glow-pk">PRZYGOTUJ SIĘ...</div>
            </div>
          )}
        </div>
        {/* touch controls */}
        <div className="mt-3 grid grid-cols-3 gap-2 lg:hidden">
          <button
            className="btn btn-dim"
            onPointerDown={() => {
              held.current = { dir: -1, t: 0, arr: 0 };
              input("left");
            }}
            onPointerUp={() => (held.current.dir = 0)}
            onPointerLeave={() => (held.current.dir = 0)}
          >
            ←
          </button>
          <button className="btn btn-dim" onPointerDown={() => input("down")}>
            ▼
          </button>
          <button
            className="btn btn-dim"
            onPointerDown={() => {
              held.current = { dir: 1, t: 0, arr: 0 };
              input("right");
            }}
            onPointerUp={() => (held.current.dir = 0)}
            onPointerLeave={() => (held.current.dir = 0)}
          >
            →
          </button>
          <button className="btn btn-dim" onPointerDown={() => input("cw")}>
            ⟳
          </button>
          <button className="btn btn-li" onPointerDown={() => input("hard")}>
            DROP
          </button>
          <button className="btn btn-dim" onPointerDown={() => input("ccw")}>
            ⟲
          </button>
        </div>
      </div>

      {/* right: team stats */}
      <div className="order-3 flex w-full max-w-[300px] flex-col gap-3">
        <div className="panel p-3">
          <div className="font-arcade text-[8px] text-dim">WSPÓLNE WYKRYCIE</div>
          <span className="font-arcade mt-1 block text-lg text-li" ref={scoreEl}>
            0
          </span>
          <div className="mt-2 flex justify-between text-xs text-dim">
            <span>
              LINIE <b className="font-arcade text-[10px] text-tx" ref={linesEl}>0</b>
            </span>
            <span>
              CZAS{" "}
              <b className="font-arcade text-[10px] text-tx" ref={timeEl}>
                0:00
              </b>
            </span>
          </div>
          <span ref={comboEl} className="font-arcade mt-2 block text-[10px] text-am" />
        </div>
        <div className="panel p-3">
          <div className="flex items-center justify-between">
            <span className="font-arcade text-[8px] text-dim">NASTĘPNY MUR</span>
            <span className="font-arcade text-sm text-pk" ref={garbageEl}>
              --
            </span>
          </div>
          <div ref={warnRef} className="mt-1 h-1.5 w-full bg-line" />
          <p className="mt-2 text-[11px] leading-snug text-dim">
            Mury z góry zapuszczają ściany. Czyśćcie linie, by je opuszczać, i nie pozwólcie wieży
            urosnąć nad planszę!
          </p>
        </div>
      </div>
    </div>
  );
}


