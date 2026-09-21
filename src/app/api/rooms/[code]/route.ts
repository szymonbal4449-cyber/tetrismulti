import { NextResponse } from "next/server";
import { ensureTicker, getRoomState, roomAction, type ActionPayload } from "@/server/rooms";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(req: Request, ctx: Ctx) {
  ensureTicker();
  const { code } = await ctx.params;
  const self = new URL(req.url).searchParams.get("s") ?? undefined;
  const state = getRoomState(code, self);
  if (!state) return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });
  return NextResponse.json(state);
}

export async function POST(req: Request, ctx: Ctx) {
  ensureTicker();
  const { code } = await ctx.params;
  let body: Partial<ActionPayload> & { playerId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Złe żądanie" }, { status: 400 });
  }
  const res = roomAction(code, body.playerId, body as ActionPayload);
  if (res.error) return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, state: res.state, joinedId: res.joinedId });
}
