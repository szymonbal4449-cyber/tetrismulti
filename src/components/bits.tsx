import { COLORS, TYPE_COLOR, pieceCells } from "@/game/core";
import type { PieceType } from "@/game/types";

export function TetraIcon({
  t,
  size = 28,
  dim = false,
}: {
  t: PieceType;
  size?: number;
  dim?: boolean;
}) {
  const cells = pieceCells(t, 0);
  const color = COLORS[TYPE_COLOR[t]];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 4 4"
      style={dim ? { opacity: 0.3 } : undefined}
      aria-hidden
    >
      {cells.map(([x, y], i) => (
        <rect
          key={i}
          x={x + 0.06}
          y={y + 0.06}
          width={0.88}
          height={0.88}
          fill={color}
          stroke="rgba(0,0,0,0.5)"
          strokeWidth={0.08}
        />
      ))}
    </svg>
  );
}

export function CrownIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M3 8l4 4 5-6 5 6 4-4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V8z"
        fill="#ffb300"
        stroke="#8a5a00"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function SwordsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M3 3l8 8M3 3v4M3 3h4M21 3l-8 8M21 3v4M21 3h-4M11 13l-2 2 2 2 2-2-2-2zm6 0l2 2-2 2-2-2 2-2zM5 19l4-4M19 19l-4-4"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HandsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 12h4l2-3 4 6 2-3h4M4 12l3-3 3 3M20 12l-3-3-3 3"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FillBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 w-full border border-line bg-ink">
      <div
        className="h-full transition-all duration-500"
        style={{ width: `${Math.min(100, pct)}%`, background: color, boxShadow: `0 0 8px ${color}` }}
      />
    </div>
  );
}
