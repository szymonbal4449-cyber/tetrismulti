import { W, H, COLORS, TYPE_COLOR, pieceCells } from "./core";
import type { PieceType } from "./types";

export function boardBase(ctx: CanvasRenderingContext2D, cell: number, withGrid = true) {
  ctx.fillStyle = "#070a18";
  ctx.fillRect(0, 0, W * cell, H * cell);
  if (withGrid) {
    ctx.strokeStyle = "rgba(120,130,200,0.09)";
    ctx.lineWidth = 1;
    for (let x = 1; x < W; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cell + 0.5, 0);
      ctx.lineTo(x * cell + 0.5, H * cell);
      ctx.stroke();
    }
    for (let y = 1; y < H; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cell + 0.5);
      ctx.lineTo(W * cell, y * cell + 0.5);
      ctx.stroke();
    }
  }
}

export function drawCell(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  s: number,
  color: string,
  glow = false
) {
  if (glow) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = s * 0.55;
  }
  ctx.fillStyle = color;
  ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
  if (glow) ctx.restore();
  const be = Math.max(2, Math.floor(s * 0.16));
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(px + 1, py + 1, s - 2, be);
  ctx.fillRect(px + 1, py + 1, be, s - 2);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(px + 1, py + s - 1 - be, s - 2, be);
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.strokeRect(px + 1.5, py + 1.5, s - 3, s - 3);
}

export function drawGrid(ctx: CanvasRenderingContext2D, cell: number, grid: number[]) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = grid[y * W + x];
      if (v) drawCell(ctx, x * cell, y * cell, cell, COLORS[v] ?? "#ffffff");
    }
  }
}

export function drawCells(
  ctx: CanvasRenderingContext2D,
  cell: number,
  cells: [number, number][],
  x: number,
  y: number,
  color: string,
  alpha = 1,
  glow = false
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const [dx, dy] of cells) {
    const by = y + dy;
    if (by < 0) continue;
    drawCell(ctx, (x + dx) * cell, by * cell, cell, color, glow);
  }
  ctx.restore();
}

export function drawPiece(
  ctx: CanvasRenderingContext2D,
  cell: number,
  t: PieceType,
  r: number,
  x: number,
  y: number,
  glow = true,
  alpha = 1
) {
  drawCells(ctx, cell, pieceCells(t, r), x, y, COLORS[TYPE_COLOR[t]], alpha, glow);
}

export function drawGhost(
  ctx: CanvasRenderingContext2D,
  cell: number,
  cells: [number, number][],
  x: number,
  y: number,
  color: string
) {
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (const [dx, dy] of cells) {
    const by = y + dy;
    if (by < 0) continue;
    ctx.strokeRect((x + dx) * cell + 2, by * cell + 2, cell - 4, cell - 4);
  }
  ctx.restore();
}
