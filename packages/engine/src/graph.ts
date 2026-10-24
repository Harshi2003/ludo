import type { Board } from './types';

/** Undirected path distance in tiles; used for ability ranges. */
export function distance(board: Board, from: number, to: number, limit = Infinity): number {
  if (from === to) return 0;
  const seen = new Map<number, number>([[from, 0]]);
  const q = [from];
  while (q.length) {
    const t = q.shift()!;
    const d = seen.get(t)!;
    if (d >= limit) continue;
    const tile = board.tiles[t];
    for (const n of [...tile.next, ...tile.prev]) {
      if (seen.has(n)) continue;
      if (n === to) return d + 1;
      seen.set(n, d + 1);
      q.push(n);
    }
  }
  return Infinity;
}

export function progress(board: Board, tile: number): number {
  return board.distToFinish[board.starts[0]] - board.distToFinish[tile];
}

/** Every distinct tile reachable by exactly n steps in one direction (or reaching the finish early). */
export function enumeratePaths(
  board: Board,
  from: number,
  n: number,
  dir: 'fwd' | 'back',
  blocked: Set<number>,
): number[][] {
  const out = new Map<number, number[]>();
  const walk = (t: number, path: number[]) => {
    if (path.length === n || board.tiles[t].finish) {
      if (path.length && !out.has(t)) out.set(t, path);
      return;
    }
    const tile = board.tiles[t];
    const nexts = dir === 'fwd' ? tile.next : tile.prev.filter((p) => board.tiles[p].start === undefined);
    for (const nx of nexts) if (!blocked.has(nx)) walk(nx, [...path, nx]);
  };
  walk(from, []);
  return [...out.values()];
}

/** Deterministic forced movement: follow the route that stays closest to your current height. */
export function forcedPath(board: Board, from: number, n: number, blocked: Set<number>): number[] {
  const path: number[] = [];
  let t = from;
  for (let i = 0; i < Math.abs(n); i++) {
    const tile = board.tiles[t];
    if (n > 0 && tile.finish) break;
    const options = (n > 0 ? tile.next : tile.prev).filter((x) => !blocked.has(x));
    if (!options.length) break;
    const y = tile.y;
    t = options.reduce((a, b) => (Math.abs(board.tiles[b].y - y) < Math.abs(board.tiles[a].y - y) ? b : a));
    path.push(t);
  }
  return path;
}
