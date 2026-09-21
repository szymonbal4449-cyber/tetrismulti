export type PieceType = "I" | "J" | "L" | "O" | "S" | "T" | "Z";
export type Mode = "battle" | "coop";
export type Phase = "lobby" | "countdown" | "playing" | "over";
export type CoopInput = "left" | "right" | "cw" | "ccw" | "down" | "hard";

export const PLAYER_COLORS = ["#00e5ff", "#ff3ea5", "#ffb300", "#3dff88"];

export interface WirePlayer {
  id: string;
  nick: string;
  isHost: boolean;
  connected: boolean;
  alive: boolean;
  lines: number;
  score: number;
  combo: number;
  maxCombo: number;
  /** battle: how many garbage rows are pending for this player */
  garbage: number;
  /** battle: server mirror of the player board (200 chars, 0-8) */
  gridStr: string;
}

export interface CoopPieceWire {
  t: PieceType;
  r: number;
  x: number;
  y: number;
}

export interface CoopWire {
  boardStr: string;
  garbageY: number | null;
  nextGarbageIn: number;
  lines: number;
  score: number;
  combo: number;
  maxCombo: number;
  time: number;
  pieces: Record<string, CoopPieceWire>;
  next: Record<string, PieceType[]>;
}

export interface RoomState {
  code: string;
  mode: Mode;
  maxPlayers: number;
  phase: Phase;
  countdownEndsAt: number | null;
  players: WirePlayer[];
  coop: CoopWire | null;
  winnerIds: string[];
  version: number;
}
