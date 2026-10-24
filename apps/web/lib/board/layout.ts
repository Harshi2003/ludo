import type { Board, Tile } from "@ludo/engine";

export const COL_W = 100;
export const ROW_H = 92;
export const TILE_R = 30;

/** The whole route meanders gently instead of running ruler-straight. */
export const wave = (col: number) => Math.sin(col * 0.31) * 36;

export const tilePos = (t: Tile) => ({ x: t.x * COL_W, y: t.y * ROW_H + wave(t.col) });

export function boardExtents(board: Board) {
  const ys = board.tiles.map((t) => t.y * ROW_H);
  return {
    rawMinY: Math.min(...ys),
    rawMaxY: Math.max(...ys),
    width: (board.cols + 2) * COL_W,
  };
}
