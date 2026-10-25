import type { Board, Tile } from "@ludo/engine";

export const COL_W = 100;
export const ROW_H = 92;
export const TILE_R = 30;

/** The whole route meanders gently instead of running ruler-straight. */
export const wave = (col: number) => Math.sin(col * 0.31) * 36;

export const tilePos = (t: Tile) => ({ x: t.x * COL_W, y: t.y * ROW_H + wave(t.col) });

export interface TerrainSlice {
  x: number;
  top: number;
  bottom: number;
}

/** The shore follows the actual route, including its bends and final courtyard. */
export function terrainProfile(board: Board, from: number, to: number, portrait: boolean, last = false): TerrainSlice[] {
  const tiles = board.tiles.filter((t) => t.col >= from && t.col <= to);
  const knots: TerrainSlice[] = [];
  for (let col = from; col <= to; col++) {
    const nearby = tiles.filter((t) => Math.abs(t.col - col) <= 1).map(tilePos);
    const lo = Math.min(...nearby.map((p) => p.y));
    const hi = Math.max(...nearby.map((p) => p.y));
    const center = (lo + hi) / 2;
    const half = Math.max(128, (hi - lo) / 2 + 94);
    knots.push({ x: col * COL_W, top: center - half, bottom: center + half });
  }
  const first = knots[0];
  knots.unshift({ ...first, x: (from - 0.55) * COL_W });
  if (last) {
    const finish = tilePos(board.tiles[board.finish]);
    for (const offset of portrait ? [90, 280, 420] : [90, 280]) {
      knots.push({ x: finish.x + offset, top: finish.y - (portrait ? 188 : 300), bottom: finish.y + (portrait ? 188 : 140) });
    }
  }
  const end = knots[knots.length - 1];
  knots.push({ ...end, x: end.x + 55 });
  return knots;
}

export function terrainAt(profile: TerrainSlice[], x: number): TerrainSlice {
  const next = profile.findIndex((p) => p.x >= x);
  if (next <= 0) return next === 0 ? profile[0] : profile[profile.length - 1];
  const a = profile[next - 1];
  const b = profile[next];
  const t = Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
  const k = t * t * (3 - 2 * t);
  return { x, top: a.top + (b.top - a.top) * k, bottom: a.bottom + (b.bottom - a.bottom) * k };
}

export function boardExtents(board: Board) {
  const ys = board.tiles.map((t) => tilePos(t).y);
  return {
    rawMinY: Math.min(...ys),
    rawMaxY: Math.max(...ys),
    width: (board.cols + 5) * COL_W,
  };
}
