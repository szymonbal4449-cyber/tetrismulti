"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BattleView } from "@/components/BattleView";
import { CoopView } from "@/components/CoopView";
import { CrownIcon, SwordsIcon, HandsIcon } from "@/components/bits";
import { initMuted, setMuted, sfx } from "@/game/sfx";
import { PLAYER_COLORS, type RoomState, type WirePlayer } from "@/game/types";

function ModeChip({ mode }: { mode: string }) {
  return mode === "battle" ? (
    <span className="chip flex items-center gap-2 text-pk">
      <SwordsIcon size={12} /> WALKA
    </span>
  ) : (
    <span className="chip flex items-center gap-2 text-li">
      <HandsIcon size={12} /> WSPÓŁPRACA
    </span>
  );
}

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const code = use(params).code.toUpperCase();
  const router = useRouter();

  const [room, setRoom] = useState<RoomState | null | undefined>(undefined);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [joinNick, setJoinNick] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinErr, setJoinErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);

  const key = `ta:${code}:id`;
  const prevPlayers = useRef<string>("");
  const prevAlive = useRef<string>("");

  useEffect(() => {
    initMuted();
    try {
      const v = sessionStorage.getItem(key);
      if (v) setSelfId(v);
      setJoinNick(sessionStorage.getItem("ta:nick") ?? "");
    } catch {
      /* ignore */
    }
  }, [key]);

  const send = useCallback(
    (payload: Record<string, unknown>) => {
      if (!selfId) return;
      fetch(`/api/rooms/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: selfId, ...payload }),
      })
        .then((r) => r.json())
        .then((j) => {
          if (j.ok && j.state) setRoom(j.state);
          else if (!j.ok) sfx("error");
        })
        .catch(() => {});
    },
    [code, selfId]
  );

  /* ------------------------------- polling ------------------------------- */
  useEffect(() => {
    let stop = false;
    const phase = room?.phase ?? "lobby";
    const iv =
      phase === "playing"
        ? room?.mode === "coop"
          ? 110
          : 300
        : phase === "countdown"
          ? 140
          : phase === "over"
            ? 1500
            : 700;
    const tick = async () => {
      try {
        const r = await fetch(`/api/rooms/${code}${selfId ? `?s=${selfId}` : ""}`);
        if (!r.ok) {
          if (!stop) setRoom(null);
          return;
        }
        const st = (await r.json()) as RoomState;
        if (stop) return;
        setRoom(st);
        if (selfId && !st.players.some((p) => p.id === selfId)) {
          try {
            sessionStorage.removeItem(key);
          } catch {
            /* ignore */
          }
          setSelfId(null);
        }
      } catch {
        /* transient network error — keep last state */
      }
    };
    tick();
    const t = window.setInterval(tick, iv);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [code, selfId, key, room?.phase, room?.mode]);

  /* ---------------------------- join/leave fx ----------------------------- */
  useEffect(() => {
    if (!room) return;
    const ids = room.players.map((p) => p.id).join(",");
    if (prevPlayers.current && prevPlayers.current !== ids) {
      const joined = room.players.find((p) => !prevPlayers.current.includes(p.id));
      if (joined && selfId && joined.id !== selfId) {
        sfx("join");
        setToast(`${joined.nick} dołączył do gry!`);
        window.setTimeout(() => setToast(null), 2500);
      }
    }
    prevPlayers.current = ids;
  }, [room, selfId]);

  useEffect(() => {
    if (!room || room.mode !== "battle") return;
    const alive = room.players.filter((p) => p.alive).map((p) => p.id).join(",");
    if (prevAlive.current && prevAlive.current !== alive) {
      const out = room.players.find((p) => !p.alive && prevAlive.current.includes(p.id));
      if (out) {
        sfx("topout");
        setToast(`${out.nick} — TOP OUT!`);
        window.setTimeout(() => setToast(null), 2500);
      }
    }
    prevAlive.current = room.phase === "playing" ? alive : "";
  }, [room]);

  /* ------------------------------ countdown ------------------------------- */
  useEffect(() => {
    if (!room || room.phase !== "countdown" || !room.countdownEndsAt) {
      setCount(null);
      return;
    }
    const calc = () => {
      const rem = Math.ceil((room.countdownEndsAt! - Date.now()) / 1000);
      setCount((prev) => {
        if (rem <= 0) return null;
        if (prev !== rem && prev !== null) sfx("tick");
        return rem > 0 ? rem : prev;
      });
    };
    calc();
    const t = window.setInterval(calc, 100);
    return () => window.clearInterval(t);
  }, [room?.phase, room?.countdownEndsAt]);

  /* ------------------------------ game over ------------------------------- */
  useEffect(() => {
    if (!room || room.phase !== "over" || !selfId) return;
    if (room.mode === "battle") {
      sfx(room.winnerIds.includes(selfId) && room.winnerIds.length === 1 ? "win" : "over");
    } else {
      sfx("over");
    }
  }, [room?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = async () => {
    if (!joinNick.trim()) {
      setJoinErr("Podaj nick");
      sfx("error");
      return;
    }
    setJoinBusy(true);
    setJoinErr("");
    try {
      const r = await fetch(`/api/rooms/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", nick: joinNick }),
      });
      const j = await r.json();
      if (!j.ok) {
        setJoinErr(j.error ?? "Błąd");
        sfx("error");
        return;
      }
      try {
        sessionStorage.setItem(key, j.joinedId);
        sessionStorage.setItem("ta:nick", joinNick.trim());
      } catch {
        /* ignore */
      }
      setSelfId(j.joinedId);
      sfx("join");
    } catch {
      setJoinErr("Błąd sieci");
    } finally {
      setJoinBusy(false);
    }
  };

  const leave = () => {
    send({ action: "leave" });
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    router.push("/");
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      sfx("hold");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const self: WirePlayer | undefined = room?.players.find((p) => p.id === selfId);
  const isHost = !!self?.isHost;

  /* -------------------------------- render -------------------------------- */
  return (
    <main className="mx-auto max-w-6xl px-3 pb-12 pt-4">
      {/* header */}
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <button
          onClick={leave}
          className="chip cursor-pointer transition hover:border-pk hover:text-pk"
          title="Wyjdź do menu"
        >
          ← MENU
        </button>
        <span className="chip text-cy">KOD: {code}</span>
        {room && <ModeChip mode={room.mode} />}
        {room && (
          <span className="chip">
            {room.players.length}/{room.maxPlayers} GRACZY
          </span>
        )}
        <button
          onClick={() => {
            setMuted(!muted);
            setMutedState(!muted);
          }}
          className="chip ml-auto cursor-pointer transition hover:border-cy hover:text-cy"
        >
          {muted ? "DŹWIĘK: WYŁ." : "DŹWIĘK: WŁ."}
        </button>
      </header>

      {room === undefined && selfId === null && (
        <div className="font-arcade blink text-center text-xs text-dim">ŁĄCZENIE...</div>
      )}

      {room === null && (
        <div className="panel mx-auto max-w-md p-8 text-center">
          <div className="font-arcade mb-3 text-sm text-pk">BRAK POKOJU</div>
          <p className="mb-5 text-sm text-dim">
            Pokój <b className="text-tx">{code}</b> nie istnieje (albo serwer został zrestartowany i
            pokoje wyczerpały się z pamięci).
          </p>
          <button className="btn btn-cy" onClick={() => router.push("/")}>
            WRÓĆ DO MENU
          </button>
        </div>
      )}

      {/* JOIN panel */}
      {room && selfId === null && (
        <div className="panel mx-auto max-w-lg p-8">
          <div className="mb-6 flex items-center justify-center gap-2">
            <span className="font-arcade text-[10px] text-dim">DOŁĄCZASZ DO</span>
            <span className="font-arcade text-lg tracking-[0.3em] text-cy title-glow-cy">{code}</span>
          </div>
          <ModeChip mode={room.mode} />
          <div className="mt-6">
            <label className="font-arcade mb-1 block text-[9px] text-dim">TWÓJ NICK</label>
            <input
              value={joinNick}
              onChange={(e) => setJoinNick(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && join()}
              maxLength={12}
              className="w-full border border-line bg-panel2 px-3 py-3 text-base font-semibold text-tx outline-none focus:border-cy"
            />
            {joinErr && <p className="mt-2 text-sm font-semibold text-pk">{joinErr}</p>}
            <button className="btn btn-cy mt-4 w-full" onClick={join} disabled={joinBusy}>
              {joinBusy ? "DOŁĄCZANIE..." : "DOŁĄCZ DO GRY"}
            </button>
          </div>
        </div>
      )}

      {/* LOBBY */}
      {room && self && room.phase === "lobby" && (
        <div className="mx-auto max-w-2xl">
          <div className="panel p-6 text-center">
            <div className="font-arcade mb-2 text-[9px] text-dim">KOD POKOJU — WYŚLIJ ZNAJOMYM</div>
            <div className="flex items-center justify-center gap-2">
              {code.split("").map((ch, i) => (
                <span
                  key={i}
                  className="font-arcade flex h-14 w-12 items-center justify-center border-2 border-cy bg-panel2 text-2xl text-cy"
                  style={{ boxShadow: "0 0 14px rgba(0,229,255,0.25)" }}
                >
                  {ch}
                </span>
              ))}
              <button
                onClick={copyCode}
                className={`btn ${copied ? "btn-li" : "btn-dim"} ml-2`}
                style={copied ? { color: "#3dff88", borderColor: "#3dff88" } : undefined}
              >
                {copied ? "SKOPIOWANO!" : "KOPYUJ"}
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <ModeChip mode={room.mode} />
              <span className="chip">MIEJSC: {room.maxPlayers}</span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: room.maxPlayers }).map((_, i) => {
              const p = room.players[i];
              return p ? (
                <div
                  key={p.id}
                  className="panel flex items-center gap-3 p-4 pop-in"
                  style={{ borderColor: `${PLAYER_COLORS[i % 4]}55` }}
                >
                  <div
                    className="h-9 w-2"
                    style={{ background: PLAYER_COLORS[i % 4], boxShadow: `0 0 10px ${PLAYER_COLORS[i % 4]}` }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-body truncate text-base font-bold" style={{ color: PLAYER_COLORS[i % 4] }}>
                        {p.nick}
                      </span>
                      {p.isHost && <CrownIcon />}
                      {p.id === selfId && <span className="font-arcade text-[7px] text-dim">(TY)</span>}
                    </div>
                    <div className="font-arcade text-[7px] text-dim">{p.connected ? "POŁĄCZONY" : "BŁĄD ŁĄCZA"}</div>
                  </div>
                </div>
              ) : (
                <div key={`e${i}`} className="panel flex items-center gap-3 border-dashed p-4 opacity-70">
                  <div className="h-9 w-2 border border-line" />
                  <div>
                    <div className="font-arcade blink text-[9px] text-dim">CZEKA NA GRACZA...</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="panel mt-4 flex flex-col items-center gap-3 p-5">
            {self.isHost ? (
              <>
                <button
                  className="btn btn-cy w-full max-w-xs"
                  disabled={room.players.length < 2}
                  onClick={() => {
                    sfx("go");
                    send({ action: "start" });
                  }}
                >
                  {room.players.length < 2 ? "CZEKAJ NA 2+ GRACZY..." : "▶ START GRY"}
                </button>
                <p className="text-center text-xs text-dim">
                  Host startuje — wszyscy muszą mieć otwarty ten ekran.
                </p>
              </>
            ) : (
              <div className="font-arcade blink text-[10px] text-am">
                CZEKAM NA START OD {room.players.find((p) => p.isHost)?.nick ?? "HOSTA"}...
              </div>
            )}
            <button className="btn btn-dim w-full max-w-xs" onClick={leave}>
              WYJDŹ Z POKOJU
            </button>
          </div>
        </div>
      )}

      {/* GAME */}
      {room &&
        self &&
        (room.phase === "countdown" || room.phase === "playing") && (
          <div className="relative">
            {room.mode === "battle" ? (
              <BattleView room={room} selfId={selfId!} send={send} />
            ) : (
              <CoopView room={room} selfId={selfId!} send={send} />
            )}
            {room.phase === "countdown" && count !== null && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-ink/60">
                <div
                  key={count}
                  className="font-arcade pop-in text-7xl text-cy title-glow-cy"
                >
                  {count}
                </div>
                <div className="font-arcade mt-4 text-[10px] text-dim">
                  {room.mode === "battle" ? "PRZYGOTUJ SIĘ DO WALKI" : "ZESPÓŁ, PRZYGOTUJ SIĘ"}
                </div>
              </div>
            )}
          </div>
        )}

      {/* OVER */}
      {room && self && room.phase === "over" && (
        <OverScreen room={room} selfId={selfId!} isHost={self.isHost} onRestart={() => send({ action: "restart" })} onLeave={leave} />
      )}

      {/* toast */}
      {toast && (
        <div className="font-arcade pop-in fixed left-1/2 top-4 z-50 -translate-x-1/2 border-2 border-pk bg-ink/95 px-5 py-3 text-[10px] text-pk" style={{ boxShadow: "0 0 24px rgba(255,62,165,0.4)" }}>
          {toast}
        </div>
      )}
    </main>
  );
}

/* -------------------------------- over view ------------------------------- */

function OverScreen({
  room,
  selfId,
  isHost,
  onRestart,
  onLeave,
}: {
  room: RoomState;
  selfId: string;
  isHost: boolean;
  onRestart: () => void;
  onLeave: () => void;
}) {
  const winner =
    room.mode === "battle"
      ? room.players.find((p) => room.winnerIds.includes(p.id))
      : undefined;
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  const c = room.coop;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="panel p-8 text-center pop-in">
        {room.mode === "battle" ? (
          <>
            <div className="font-arcade text-[9px] text-dim">KONIEC WALKI</div>
            <h2 className="font-arcade mt-3 text-xl text-cy title-glow-cy md:text-2xl">
              {winner ? (
                <>
                  WYGRYWA <span className="text-am">{winner.nick}</span>
                </>
              ) : (
                "REMIS!"
              )}
            </h2>
            {winner?.id === selfId && <div className="mt-2 text-sm text-dim">Jesteś nowym królem aren!</div>}
          </>
        ) : (
          <>
            <div className="font-arcade text-[9px] text-dim">KONIEC WSPÓŁPRACY</div>
            <h2 className="font-arcade mt-3 text-xl text-pk title-glow-pk md:text-2xl">
              WIEŻA UPADŁA
            </h2>
            {c && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <span className="chip text-li">LINIE: {c.lines}</span>
                <span className="chip text-cy">PUNKTY: {c.score}</span>
                <span className="chip text-am">CZAS: {Math.floor(c.time / 60)}:{String(c.time % 60).padStart(2, "0")}</span>
                <span className="chip text-pk">MAX COMBO: x{Math.max(1, c.maxCombo)}</span>
              </div>
            )}
          </>
        )}

        <div className="mt-6 border border-line bg-panel2/50 p-4">
          <div className="font-arcade mb-3 text-[8px] text-dim">WYNIKI</div>
          <div className="space-y-2">
            {sorted.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 text-sm">
                <span className={`font-arcade w-6 text-center text-[10px] ${i === 0 ? "text-am" : "text-dim"}`}>
                  {i + 1}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-left font-semibold"
                  style={{ color: PLAYER_COLORS[i % 4] }}
                >
                  {p.nick}
                  {p.id === selfId && <span className="text-dim"> (TY)</span>}
                </span>
                <span className="text-dim">{p.lines} linii</span>
                <span className="w-20 text-right font-arcade text-[10px] text-tx">{p.score}</span>
                <span className="w-16 text-right text-xs text-dim">combo x{Math.max(0, p.maxCombo)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {isHost && (
            <button className="btn btn-cy w-full max-w-xs" onClick={onRestart}>
              ZAGRAJ PONOWNIE
            </button>
          )}
          <button className="btn btn-dim w-full max-w-xs" onClick={onLeave}>
            WYJDŹ DO MENU
          </button>
        </div>
        {!isHost && (
          <p className="mt-3 text-xs text-dim">To {room.players.find((p) => p.isHost)?.nick ?? "host"} decyduje o rewanżu.</p>
        )}
      </div>
    </div>
  );
}
