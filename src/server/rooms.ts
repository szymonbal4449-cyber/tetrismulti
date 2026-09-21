import { db } from "@/db";
import { rooms as roomsTable } from "@/db/schema";
import { emptyGrid, g2s, s2g } from "@/game/core";
import { CoopGame } from "@/game/coop";
import type { Mode, Phase, RoomState, WirePlayer, CoopInput } from "@/game/types";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const COUNTDOWN_MS = 3200;

interface RoomPlayer {
  id: string;
  nick: string;
  isHost: boolean;
  joinedAt: number;
  lastSeen: number;
  alive: boolean;
  lines: number;
  score: number;
  combo: number;
  maxCombo: number;
  garbage: number;
  grid: number[];
}

interface Room {
  code: string;
  mode: Mode;
  maxPlayers: number;
  hostId: string;
  phase: Phase;
  countdownEndsAt: number | null;
  players: RoomPlayer[];
  coop: CoopGame | null;
  lastCoopTick: number;
  winnerIds: string[];
  version: number;
  createdAt: number;
}

const rooms = new Map<string, Room>();

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function genCode(): string {
  for (let tries = 0; tries < 50; tries++) {
    let c = "";
    for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  return uid().slice(0, 5).toUpperCase();
}

function cleanNick(n: unknown): string {
  const s = String(n ?? "").trim().replace(/\s+/g, " ").slice(0, 12);
  return s.length >= 1 ? s : "GRACZ";
}

function bump(room: Room) {
  room.version++;
}

/* ----------------------- persistence (best effort) ----------------------- */

function persist(room: Room, status?: string) {
  try {
    const winner =
      room.winnerIds.length === 1
        ? room.players.find((p) => p.id === room.winnerIds[0])?.nick ?? null
        : null;
    const finalScore =
      room.mode === "coop"
        ? room.coop?.lines ?? 0
        : Math.max(0, ...room.players.map((p) => p.score));
    const vals = {
      code: room.code,
      mode: room.mode,
      maxPlayers: room.maxPlayers,
      status: status ?? room.phase,
      hostNick: room.players.find((p) => p.id === room.hostId)?.nick ?? null,
      players: room.players.length,
      winner,
      finalScore,
    };
    void db
      .insert(roomsTable)
      .values(vals)
      .onConflictDoUpdate({
        target: roomsTable.code,
        set: {
          status: vals.status,
          maxPlayers: vals.maxPlayers,
          hostNick: vals.hostNick,
          players: vals.players,
          winner: vals.winner,
          finalScore: vals.finalScore,
          updatedAt: new Date(),
        },
      })
      .catch(() => {
        /* db optional at runtime */
      });
  } catch {
    /* ignore */
  }
}

/* ------------------------------- creation -------------------------------- */

export function createRoom(nick: unknown, mode: Mode, maxPlayers: number): { code: string; id: string } {
  const code = genCode();
  const id = uid();
  const room: Room = {
    code,
    mode,
    maxPlayers: Math.min(4, Math.max(2, maxPlayers)),
    hostId: id,
    phase: "lobby",
    countdownEndsAt: null,
    players: [
      {
        id,
        nick: cleanNick(nick),
        isHost: true,
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        alive: true,
        lines: 0,
        score: 0,
        combo: 0,
        maxCombo: 0,
        garbage: 0,
        grid: emptyGrid(),
      },
    ],
    coop: null,
    lastCoopTick: 0,
    winnerIds: [],
    version: 1,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  persist(room, "lobby");
  return { code, id };
}

function joinRoom(code: string, nick: unknown): { id?: string; error?: string } {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { error: "Pokój nie istnieje" };
  if (room.phase !== "lobby") return { error: "Gra już się rozpoczęła" };
  if (room.players.length >= room.maxPlayers) return { error: "Pokój jest pełny" };
  const id = uid();
  let name = cleanNick(nick);
  const taken = new Set(room.players.map((p) => p.nick.toLowerCase()));
  if (taken.has(name.toLowerCase())) {
    let i = 2;
    while (taken.has((name + i).toLowerCase())) i++;
    name = (name + i).slice(0, 12);
  }
  room.players.push({
    id,
    nick: name,
    isHost: false,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    alive: true,
    lines: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    garbage: 0,
    grid: emptyGrid(),
  });
  bump(room);
  persist(room);
  return { id };
}

/* ------------------------------ state wire ------------------------------- */

function checkWinner(room: Room) {
  if (room.phase !== "playing") return;
  if (room.mode !== "battle") return;
  const alive = room.players.filter((p) => p.alive);
  if (alive.length <= 1) {
    room.phase = "over";
    room.winnerIds = alive.map((a) => a.id);
    bump(room);
    persist(room, "finished");
  }
}

function stepRoom(room: Room, now: number) {
  if (room.phase === "countdown" && room.countdownEndsAt && now >= room.countdownEndsAt) {
    room.phase = "playing";
    room.countdownEndsAt = null;
    if (room.mode === "coop") {
      room.coop = new CoopGame(room.players.map((p) => p.id));
      room.lastCoopTick = now;
    }
    bump(room);
    persist(room, "playing");
  }
  if (room.phase !== "playing") return;

  if (room.mode === "coop" && room.coop) {
    const c = room.coop;
    if (now - room.lastCoopTick > 1500) room.lastCoopTick = now; // tab was asleep
    let steps = 0;
    while (room.lastCoopTick + 100 <= now && !c.over && steps++ < 12) {
      room.lastCoopTick += 100;
      c.tickStep(now);
    }
    if (room.lastCoopTick + 100 <= now) room.lastCoopTick = now;
    if (c.over) {
      room.phase = "over";
      room.winnerIds = [];
      bump(room);
      persist(room, "finished");
    }
  } else {
    // battle: eliminate players who vanished (tab closed / network loss)
    for (const p of room.players) {
      if (p.alive && now - p.lastSeen > 20000) {
        p.alive = false;
        bump(room);
      }
    }
    checkWinner(room);
  }
}

function toWire(room: Room, now: number): RoomState {
  for (const p of room.players) p.lastSeen = Math.max(p.lastSeen, now - 4000); // poll = presence
  const players: WirePlayer[] = [...room.players]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((p) => ({
      id: p.id,
      nick: p.nick,
      isHost: p.id === room.hostId,
      connected: now - p.lastSeen < 6000,
      alive: p.alive,
      lines: p.lines,
      score: p.score,
      combo: p.combo,
      maxCombo: p.maxCombo,
      garbage: p.garbage,
      gridStr: room.mode === "battle" ? g2s(p.grid) : "",
    }));
  const c = room.coop;
  const coop = c
    ? {
        boardStr: g2s(c.board),
        garbageY: c.garbageY,
        nextGarbageIn: c.nextGarbageIn(now),
        lines: c.lines,
        score: c.score,
        combo: c.combo,
        maxCombo: c.maxCombo,
        time: c.timeSurvived(now),
        pieces: Object.fromEntries(
          [...c.pieces.entries()].map(([id, cp]) => [id, { t: cp.t, r: cp.r, x: cp.x, y: cp.y }])
        ),
        next: Object.fromEntries(c.order.map((id) => [id, c.next(id, 3)])),
      }
    : null;
  return {
    code: room.code,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    phase: room.phase,
    countdownEndsAt: room.countdownEndsAt,
    players,
    coop,
    winnerIds: room.winnerIds,
    version: room.version,
  };
}

export function getRoomState(code: string, selfId?: string): RoomState | null {
  const room = rooms.get(code.toUpperCase());
  if (!room) return null;
  const now = Date.now();
  stepRoom(room, now);
  if (selfId) {
    const p = room.players.find((x) => x.id === selfId);
    if (p) p.lastSeen = now;
  }
  return toWire(room, now);
}

/* -------------------------------- actions -------------------------------- */

export interface ActionPayload {
  action: string;
  nick?: unknown;
  grid?: string;
  cleared?: number;
  combo?: number;
  maxCombo?: number;
  score?: number;
  lines?: number;
  dead?: boolean;
  input?: CoopInput;
}

export function roomAction(
  code: string,
  playerId: string | undefined,
  body: ActionPayload
): { state?: RoomState; error?: string; joinedId?: string } {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { error: "Pokój nie istnieje" };
  const now = Date.now();
  stepRoom(room, now);

  if (body.action === "join") {
    const r = joinRoom(room.code, body.nick);
    if (r.error) return { error: r.error };
    return { state: toWire(room, now), joinedId: r.id };
  }
  const me = playerId ? room.players.find((p) => p.id === playerId) : undefined;
  if (!me) return { error: "Nie jesteś w tym pokoju" };

  switch (body.action) {
    case "start": {
      if (me.id !== room.hostId) return { error: "Tylko host może zacząć grę" };
      if (room.phase !== "lobby") return { error: "Gra już trwa" };
      if (room.players.length < 2) return { error: "Potrzebni są minimum 2 gracze" };
      for (const p of room.players) {
        p.alive = true;
        p.lines = 0;
        p.score = 0;
        p.combo = 0;
        p.maxCombo = 0;
        p.garbage = 0;
        p.grid = emptyGrid();
        p.lastSeen = now;
      }
      room.winnerIds = [];
      room.coop = null;
      room.phase = "countdown";
      room.countdownEndsAt = now + COUNTDOWN_MS;
      bump(room);
      return { state: toWire(room, now) };
    }
    case "restart": {
      const allowed = me.id === room.hostId || room.players.every((p) => p.id !== room.hostId);
      if (!allowed) return { error: "Tylko host może restartować" };
      room.phase = "lobby";
      room.coop = null;
      room.countdownEndsAt = null;
      room.winnerIds = [];
      for (const p of room.players) {
        p.alive = true;
        p.lines = 0;
        p.score = 0;
        p.combo = 0;
        p.maxCombo = 0;
        p.garbage = 0;
        p.grid = emptyGrid();
      }
      bump(room);
      persist(room, "lobby");
      return { state: toWire(room, now) };
    }
    case "battleLock": {
      if (room.mode !== "battle" || room.phase !== "playing") return { error: "Nie można" };
      if (!me.alive) return { error: "Game over" };
      me.grid = typeof body.grid === "string" ? s2g(body.grid) : emptyGrid();
      me.lines = Number(body.lines) || 0;
      me.score = Number(body.score) || 0;
      me.combo = Number(body.combo) || 0;
      me.maxCombo = Number(body.maxCombo) || 0;
      const cleared = Number(body.cleared) || 0;
      if (cleared > 0) {
        const sent = Math.min(6, cleared + Math.max(0, me.combo - 1));
        for (const o of room.players) {
          if (o.id !== me.id) o.garbage += sent;
        }
      }
      if (body.dead) me.alive = false;
      bump(room);
      checkWinner(room);
      return { state: toWire(room, now) };
    }
    case "coopInput": {
      if (room.mode !== "coop" || !room.coop || room.phase !== "playing") return { error: "Nie teraz" };
      room.coop.input(me.id, body.input ?? "left");
      return { state: toWire(room, Date.now()) };
    }
    case "leave": {
      room.players = room.players.filter((p) => p.id !== me.id);
      if (room.players.length === 0) {
        rooms.delete(room.code);
        return { state: toWire({ ...room, players: [] }, now) };
      }
      if (me.id === room.hostId) {
        room.hostId = [...room.players].sort((a, b) => a.joinedAt - b.joinedAt)[0].id;
      }
      if (room.mode === "battle" && room.phase === "playing") {
        checkWinner(room);
      }
      if (room.mode === "coop") room.coop?.pieces.delete(me.id);
      bump(room);
      persist(room);
      return { state: toWire(room, now) };
    }
    default:
      return { error: "Nieznana akcja" };
  }
}

/* ----------------------------- background tick --------------------------- */
/* Keeps rooms alive even between polls (works on persistent Node servers;   */
/* on serverless the poll-driven stepRoom above covers it).                   */

const g = globalThis as unknown as { __taTicker?: ReturnType<typeof setInterval> };

export function ensureTicker() {
  if (g.__taTicker) return;
  g.__taTicker = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.players.length === 0) {
        rooms.delete(room.code);
        continue;
      }
      try {
        stepRoom(room, now);
      } catch {
        /* never crash the loop */
      }
    }
  }, 100);
  try {
    (g.__taTicker as unknown as { unref?: () => void }).unref?.();
  } catch {
    /* ignore */
  }
}


