"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { initMuted, setMuted, sfx } from "@/game/sfx";
import type { Mode } from "@/game/types";

const BG_PIECES: { t: number; d: number; dur: number; delay: number; c: string }[] = [
  { t: 0, d: 4, dur: 26, delay: 0, c: "#00e5ff" },
  { t: 1, d: 22, dur: 34, delay: 6, c: "#ff3ea5" },
  { t: 2, d: 47, dur: 30, delay: 2, c: "#ffd23f" },
  { t: 3, d: 68, dur: 38, delay: 11, c: "#c44dff" },
  { t: 4, d: 84, dur: 28, delay: 4, c: "#3dff88" },
  { t: 5, d: 12, dur: 33, delay: 15, c: "#ff9f2e" },
  { t: 6, d: 58, dur: 36, delay: 9, c: "#ff4d6a" },
  { t: 7, d: 92, dur: 31, delay: 18, c: "#4d7cff" },
];

const SHAPES: [number, number][][] = [
  [[0, 1], [1, 1], [2, 1], [3, 1]],
  [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[2, 0], [0, 1], [1, 1], [2, 1]],
  [[1, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 1], [1, 1], [1, 0], [2, 1]],
  [[0, 1], [0, 0], [1, 1], [2, 1]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[1, 0], [2, 0], [0, 1], [1, 1]],
];

function FallbackPiece({ t, color }: { t: number; color: string }) {
  const cells = SHAPES[t % 8];
  const w = Math.max(...cells.map((c) => c[0])) + 1;
  const h = Math.max(...cells.map((c) => c[1])) + 1;
  return (
    <div
      className="bg-piece opacity-60"
      style={{
        left: `${BG_PIECES[t].d}%`,
        width: w * 16,
        height: h * 16,
        animationDuration: `${BG_PIECES[t].dur}s`,
        animationDelay: `${BG_PIECES[t].delay}s`,
      }}
    >
      {cells.map(([x, y], i) => (
        <span
          key={i}
          style={{
            gridColumn: x + 1,
            gridRow: y + 1,
            background: color,
            boxShadow: `0 0 12px ${color}55`,
            opacity: 0.5,
          }}
        />
      ))}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [nick, setNick] = useState(() => {
    try {
      return sessionStorage.getItem("ta:nick") ?? "";
    } catch {
      return "";
    }
  });
  const [mode, setMode] = useState<Mode>("battle");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [muted, setMutedState] = useState(false);

  useMemo(() => initMuted(), []);

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const createRoom = async () => {
    if (!nick.trim()) {
      setErr("Podaj nick");
      sfx("error");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nick, mode, maxPlayers }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Błąd serwera");
      try {
        sessionStorage.setItem("ta:nick", nick.trim());
        sessionStorage.setItem(`ta:${j.code}:id`, j.id);
      } catch {
        /* ignore */
      }
      sfx("join");
      router.push(`/room/${j.code}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Błąd sieci");
      sfx("error");
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = () => {
    const c = code.trim().toUpperCase();
    if (c.length !== 5) {
      setErr("Kod musi mieć 5 znaków");
      sfx("error");
      return;
    }
    if (!nick.trim()) {
      setErr("Podaj nick");
      sfx("error");
      return;
    }
    try {
      sessionStorage.setItem("ta:nick", nick.trim());
    } catch {
      /* ignore */
    }
    router.push(`/room/${c}`);
  };

  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center px-4 pb-16 pt-10 overflow-hidden">
      {/* falling pieces backdrop */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {BG_PIECES.map((p, i) => (
          <FallbackPiece key={i} t={i} color={p.c} />
        ))}
      </div>

      {/* header */}
      <header className="relative z-10 mb-10 flex flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-3" style={{ transform: "rotate(-1.5deg)" }}>
          <svg width="44" height="44" viewBox="0 0 44 44" className="float-y" aria-hidden>
            <rect x="2" y="20" width="10" height="10" fill="#00e5ff" />
            <rect x="12" y="20" width="10" height="10" fill="#00e5ff" />
            <rect x="22" y="20" width="10" height="10" fill="#00e5ff" />
            <rect x="32" y="20" width="10" height="10" fill="#00e5ff" />
            <rect x="12" y="8" width="10" height="10" fill="#ff3ea5" />
            <rect x="2" y="32" width="10" height="10" fill="#ffd23f" />
          </svg>
          <h1 className="font-arcade text-3xl leading-none text-cy title-glow-cy md:text-5xl">
            TETRA<span className="text-pk title-glow-pk">ARENA</span>
          </h1>
        </div>
        <p className="max-w-xl text-sm text-dim md:text-base">
          Tetris multiplayer online dla <b className="text-tx">2–4 graczy</b>. Tryb{" "}
          <b className="text-pk">walki</b> wysyłajcie śmieci do rywali, tryb{" "}
          <b className="text-li">współpracy</b> budujcie wspólną wieżę. Utwórz pokój, wyślij kod
          znajomym — i gramy.
        </p>
      </header>

      <div className="relative z-10 grid w-full gap-5 md:grid-cols-2">
        {/* CREATE */}
        <section className="panel p-6">
          <h2 className="font-arcade mb-5 text-xs text-cy title-glow-cy">STWÓRZ POKÓJ</h2>
          <label className="mb-1 block font-arcade text-[9px] text-dim">TWÓJ NICK</label>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            maxLength={12}
            placeholder="np. KUBA"
            className="mb-4 w-full border border-line bg-panel2 px-3 py-3 font-body text-base font-semibold text-tx outline-none transition focus:border-cy focus:shadow-[0_0_14px_rgba(0,229,255,0.25)]"
          />

          <label className="mb-2 block font-arcade text-[9px] text-dim">TRYB GRY</label>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => setMode("battle")}
              className={`border-2 p-3 text-left transition ${
                mode === "battle"
                  ? "border-pk bg-pk/10 shadow-[0_0_16px_rgba(255,62,165,0.3)]"
                  : "border-line bg-panel2 hover:border-pk/50"
              }`}
            >
              <span className="font-arcade text-[10px] text-pk">WALKA</span>
              <span className="mt-2 block text-xs leading-snug text-dim">
                Każdy na własnym planszy. Wybijane linie = śmieci do rywali. Ostatni na planie
                wygrywa.
              </span>
            </button>
            <button
              onClick={() => setMode("coop")}
              className={`border-2 p-3 text-left transition ${
                mode === "coop"
                  ? "border-li bg-li/10 shadow-[0_0_16px_rgba(61,255,136,0.3)]"
                  : "border-line bg-panel2 hover:border-li/50"
              }`}
            >
              <span className="font-arcade text-[10px] text-li">WSPÓŁPRACA</span>
              <span className="mt-2 block text-xs leading-snug text-dim">
                Jedna wspólna plansza dla całej drużyny. Mury schodzą z góry — czyśćcie linie,
                nie dajcie się zakopać.
              </span>
            </button>
          </div>

          <label className="mb-2 block font-arcade text-[9px] text-dim">LICZBA GRACZY</label>
          <div className="mb-5 grid grid-cols-3 gap-3">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setMaxPlayers(n)}
                className={`font-arcade text-sm border-2 py-3 transition ${
                  maxPlayers === n
                    ? "border-cy bg-cy/10 text-cy shadow-[0_0_16px_rgba(0,229,255,0.3)]"
                    : "border-line bg-panel2 text-dim hover:border-cy/50"
                }`}
              >
                {n} OS.
              </button>
            ))}
          </div>

          <button className="btn btn-cy w-full" onClick={createRoom} disabled={busy}>
            {busy ? "TWORZENIE..." : "STWÓRZ I WYŚLIJ KOD"}
          </button>
        </section>

        {/* JOIN */}
        <section className="panel flex flex-col p-6">
          <h2 className="font-arcade mb-5 text-xs text-pk title-glow-pk">DOŁĄCZ DO GRY</h2>
          <label className="mb-1 block font-arcade text-[9px] text-dim">KOD POKOJU</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
            onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            placeholder="KX7PF"
            className="mb-4 w-full border border-line bg-panel2 px-3 py-3 text-center font-arcade text-2xl tracking-[0.4em] text-tx outline-none transition focus:border-pk focus:shadow-[0_0_14px_rgba(255,62,165,0.3)]"
          />
          <label className="mb-1 block font-arcade text-[9px] text-dim">TWÓJ NICK</label>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            maxLength={12}
            placeholder="np. OLA"
            className="mb-4 w-full border border-line bg-panel2 px-3 py-3 font-body text-base font-semibold text-tx outline-none transition focus:border-pk focus:shadow-[0_0_14px_rgba(255,62,165,0.25)]"
          />
          <button className="btn btn-pk mt-auto w-full" onClick={joinRoom}>
            DOŁĄCZ →
          </button>

          {err && (
            <p className="pop-in mt-3 border border-pk/40 bg-pk/10 px-3 py-2 text-sm font-semibold text-pk">
              {err}
            </p>
          )}

          <div className="mt-6 border border-line bg-panel2/60 p-4">
            <h3 className="font-arcade mb-3 text-[9px] text-dim">JAK TO DZIAŁA</h3>
            <ol className="space-y-2 text-sm text-dim">
              <li>
                <b className="text-cy">1.</b> Utwórz pokój i wybierz tryb oraz liczbę graczy.
              </li>
              <li>
                <b className="text-cy">2.</b> Wyślij 5-znakowy kod znajomym (SMS, Discord...).
              </li>
              <li>
                <b className="text-cy">3.</b> Znajomi wpisują kod w zakładce DOŁĄCZ — i start!
              </li>
            </ol>
          </div>
        </section>
      </div>

      {/* controls */}
      <section className="panel relative z-10 mt-5 w-full p-6">
        <h2 className="font-arcade mb-4 text-[10px] text-dim">STEROWANIE</h2>
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-dim">
          <span>
            <kbd>←</kbd> <kbd>→</kbd> ruch
          </span>
          <span>
            <kbd>↓</kbd> miękki drop
          </span>
          <span>
            <kbd>↑</kbd> / <kbd>X</kbd> obrót w prawo
          </span>
          <span>
            <kbd>Z</kbd> obrót w lewo
          </span>
          <span>
            <kbd>SPACJA</kbd> twardy drop
          </span>
          <span className="md:hidden">
            <kbd>C</kbd> zamiana (tylko walka)
          </span>
          <span className="text-dim/70">...albo przyciski dotykowe na ekranie</span>
        </div>
      </section>

      <footer className="relative z-10 mt-8 flex items-center gap-4 text-xs text-dim/70">
        <span>TETRA ARENA — graj przez kod pokoju, bez rejestracji</span>
        <button
          onClick={toggleMute}
          className="chip cursor-pointer transition hover:border-cy hover:text-cy"
          title="Dźwięk"
        >
          {muted ? "DŹWIĘK: WYŁ." : "DŹWIĘK: WŁ."}
        </button>
      </footer>
    </main>
  );
}
