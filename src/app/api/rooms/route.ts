import { NextResponse } from "next/server";
import { createRoom, ensureTicker } from "@/server/rooms";
import type { Mode } from "@/game/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  ensureTicker();
  let body: { nick?: string; mode?: string; maxPlayers?: number } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Złe żądanie" }, { status: 400 });
  }
  const mode: Mode = body.mode === "coop" ? "coop" : "battle";
  const maxPlayers = Math.min(4, Math.max(2, Number(body.maxPlayers) || 2));
  if (!body.nick || String(body.nick).trim().length < 1) {
    return NextResponse.json({ ok: false, error: "Podaj nick" }, { status: 400 });
  }
  const res = createRoom(body.nick, mode, maxPlayers);
  return NextResponse.json({ ok: true, ...res });
}
