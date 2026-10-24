import { rand, shuffle, weighted } from './rng';
import type { Board, Tile, TileTypeDef, ZoneDef, ZoneType } from './types';

export type PlayerCount = 2 | 3 | 4;

export const BOARD_TARGET: Record<PlayerCount, number> = { 2: 100, 3: 135, 4: 145 };
/** Fewer mesh lanes than players forces collisions. */
export const MESH_LANES: Record<PlayerCount, number> = { 2: 1, 3: 2, 4: 2 };
export const SPECIAL_RATIO: Record<PlayerCount, number> = { 2: 0.15, 3: 0.18, 4: 0.2 };
const HARMFUL_SHARE = { low: 0.3, medium: 0.45, high: 0.6 };
const NEUTRAL_SHARE = 0.22;

const START_LEN = 4;
const LANE_GAP = 2.2;
const BRANCH_OFFSET = 0.6;
const MIN_LEN: Record<ZoneType, number> = { lane: 4, crossing: 5, merge: 6, branch: 5, funnel: 4 };

export interface BoardGenOptions {
  players: PlayerCount;
  seed: number;
  zones: ZoneDef[];
  tiles: TileTypeDef[];
}

export function generateBoard(opts: BoardGenOptions): Board {
  let scale = 1;
  let board = buildGraph(opts, scale);
  for (let i = 0; i < 8; i++) {
    const r = BOARD_TARGET[opts.players] / board.tiles.length;
    if (Math.abs(r - 1) < 0.06) break;
    scale *= r;
    board = buildGraph(opts, scale);
  }
  const rng = { rng: opts.seed ^ 0x9e3779b9 };
  for (let attempt = 0; attempt < 12; attempt++) {
    placeSpecials(board, opts, rng);
    if (fairness(board, opts.tiles).ok) break;
  }
  return board;
}

// ─── Graph construction ────────────────────────────────────────────────────

function buildGraph(opts: BoardGenOptions, scale: number): Board {
  const P = opts.players;
  const M = MESH_LANES[P];
  const tiles: Tile[] = [];
  const laneY = (i: number) => (i - (M - 1) / 2) * LANE_GAP;

  const add = (col: number, y: number, zone: number, lane: number, extra: Partial<Tile> = {}) => {
    const t: Tile = {
      id: tiles.length, col, x: col, y, zone, lane, next: [], prev: [],
      type: 'normal', checkpoint: false, shared: false, ...extra,
    };
    tiles.push(t);
    return t.id;
  };
  const link = (a: number, b: number) => {
    if (!tiles[a].next.includes(b)) {
      tiles[a].next.push(b);
      tiles[b].prev.push(a);
    }
  };

  // Start lanes span the same height as the mesh, one-way into it.
  const span = Math.max(M - 1, 1) * LANE_GAP;
  const starts: number[] = [];
  const startEnds: number[] = [];
  for (let p = 0; p < P; p++) {
    const y = -span / 2 + (p * span) / (P - 1);
    let prev = -1;
    for (let k = 0; k < START_LEN; k++) {
      const id = add(k, y, -1, -1 - p, { start: p, checkpoint: k === 0 });
      if (prev >= 0) link(prev, id);
      else starts.push(id);
      prev = id;
    }
    startEnds.push(prev);
  }

  // Each start feeds the one or two mesh lanes nearest to it (middle seats get a choice).
  let cur: number[][] = Array.from({ length: M }, () => []);
  for (let p = 0; p < P; p++) {
    const pos = (p * (M - 1)) / (P - 1);
    for (const l of new Set([Math.floor(pos), Math.ceil(pos)])) cur[l].push(startEnds[p]);
  }

  let col = START_LEN;
  const rejoined = new Set<number>();
  const zoneCols: Board['zoneCols'] = [];
  const zones = opts.zones.some((z) => z.type === 'funnel')
    ? opts.zones
    : [...opts.zones, { id: 'funnel', name: 'Finish', type: 'funnel' as const, length: 5, danger: 'high' as const, description: '' }];

  zones.forEach((z, zi) => {
    const L = Math.max(MIN_LEN[z.type], Math.round(z.length * scale));
    const first = col;
    const singles = () => Array.from({ length: M }, (_, i) => [i]);

    /** One column; each group of lanes shares a single tile. */
    const column = (groups: number[][], k: number) => {
      const next = cur.slice();
      for (const g of groups) {
        const y = g.reduce((a, l) => a + laneY(l), 0) / g.length;
        const id = add(col, y, zi, g[0], { shared: g.length > 1, checkpoint: k === 0 });
        for (const l of g) for (const s of cur[l]) link(s, id);
        for (const l of g) next[l] = [id];
      }
      cur = next;
      col++;
    };

    /**
     * Single-lane boards (2 players) still need forks: the lane splits into an
     * upper and lower track, rejoining on shared tiles (`rejoin(k)`), optionally
     * with rungs between the tracks.
     */
    const twinTracks = (rejoin: (k: number) => boolean, rungs: boolean) => {
      let subs: [number[], number[]] | null = null;
      for (let k = 0; k < L; k++) {
        if (k === 0 || k === L - 1 || rejoin(k)) {
          if (subs) cur = [[...subs[0], ...subs[1]]];
          column([[0]], k);
          if (subs) rejoined.add(cur[0][0]);
          subs = null;
          continue;
        }
        const [up, down] = subs ?? [cur[0], cur[0]];
        const u = add(col, -BRANCH_OFFSET, zi, 0);
        const d = add(col, BRANCH_OFFSET, zi, 0);
        up.forEach((x) => link(x, u));
        down.forEach((x) => link(x, d));
        if (rungs && subs && k % 3 === 0) {
          up.forEach((x) => link(x, d));
          down.forEach((x) => link(x, u));
        }
        subs = [[u], [d]];
        col++;
      }
    };

    switch (z.type) {
      case 'lane':
        if (M === 1) {
          twinTracks(() => false, true);
          break;
        }
        for (let k = 0; k < L; k++) {
          const before = cur.map((c) => c.slice());
          column(singles(), k);
          // Ladder rungs let players hop lanes to hunt or flee.
          if (k % 3 === 1 && k < L - 1) {
            for (let i = 0; i < M - 1; i++) {
              for (const s of before[i]) link(s, cur[i + 1][0]);
              for (const s of before[i + 1]) link(s, cur[i][0]);
            }
          }
        }
        break;

      case 'crossing': {
        if (M === 1) {
          twinTracks((k) => k % 4 === 0, false);
          break;
        }
        const c1 = Math.floor(L / 3);
        const c2 = Math.floor((2 * L) / 3);
        for (let k = 0; k < L; k++) {
          let groups = singles();
          if (M === 2 && (k === c1 || k === c2)) groups = [[0, 1]];
          if (M === 3) {
            if (k === c1 || k === c2 + 1) groups = [[0, 1], [2]];
            if (k === c1 + 1 || k === c2) groups = [[0], [1, 2]];
          }
          column(groups, k);
        }
        break;
      }

      case 'merge': {
        const run = Math.min(5, L - 2);
        for (let k = 0; k < L; k++) {
          column(k >= 1 && k <= run ? [Array.from({ length: M }, (_, i) => i)] : singles(), k);
        }
        break;
      }

      case 'branch': {
        column(singles(), 0);
        // Every lane forks into an upper and lower route that rejoin at the end.
        let subs = cur.map((c) => [c, c]);
        for (let k = 1; k < L - 1; k++) {
          subs = subs.map(([up, down], i) => {
            const u = add(col, laneY(i) - BRANCH_OFFSET, zi, i);
            const d = add(col, laneY(i) + BRANCH_OFFSET, zi, i);
            for (const s of up) link(s, u);
            for (const s of down) link(s, d);
            return [[u], [d]];
          });
          col++;
        }
        cur = subs.map(([u, d]) => [...u, ...d]);
        column(singles(), L - 1);
        break;
      }

      case 'funnel':
        for (let k = 0; k < L; k++) column([Array.from({ length: M }, (_, i) => i)], k);
        break;
    }
    zoneCols.push({ zone: zi, from: first, to: col - 1 });
  });

  for (const id of rejoined) tiles[id].shared = true;
  const finish = tiles.length - 1;
  tiles[finish].finish = true;
  tiles[finish].checkpoint = false;

  // Path length to the finish (forward edges); equal from every start by construction.
  const distToFinish = new Array(tiles.length).fill(Infinity);
  distToFinish[finish] = 0;
  const q = [finish];
  while (q.length) {
    const t = q.shift()!;
    for (const p of tiles[t].prev) {
      if (distToFinish[p] === Infinity) {
        distToFinish[p] = distToFinish[t] + 1;
        q.push(p);
      }
    }
  }

  return { seed: opts.seed, players: P, lanes: M, cols: col, tiles, starts, finish, distToFinish, zoneCols };
}

// ─── Special tile placement ───────────────────────────────────────────────

function placeSpecials(board: Board, opts: BoardGenOptions, rng: { rng: number }) {
  const { tiles } = board;
  const zones = opts.zones;
  const defs = opts.tiles;
  const normal = defs.find((d) => d.base === 'normal')?.id ?? 'normal';
  const sanctuary = defs.find((d) => d.base === 'sanctuary');
  const portal = defs.find((d) => d.base === 'portal');
  const pool = {
    helpful: defs.filter((d) => d.category === 'helpful'),
    harmful: defs.filter((d) => d.category === 'harmful'),
    neutral: defs.filter((d) => d.category === 'neutral'),
  };

  for (const t of tiles) {
    t.type = normal;
    delete t.pair;
  }

  // Mirror groups: tiles at the same column and |y| always get the same type, so no lane is luckier.
  const groups = new Map<string, number[]>();
  for (const t of tiles) {
    if (t.zone < 0 || t.finish) continue;
    const key = `${t.col}:${Math.abs(t.y).toFixed(2)}`;
    groups.get(key)?.push(t.id) ?? groups.set(key, [t.id]);
  }
  const symmetric = [...groups.values()].filter((g) =>
    g.length === 2 ? Math.sign(tiles[g[0]].y) !== Math.sign(tiles[g[1]].y) : Math.abs(tiles[g[0]].y) < 1e-6,
  );
  const lastCol = tiles[board.finish].col;
  const special = new Set<number>();
  const setGroup = (g: number[], type: string) => g.forEach((id) => { tiles[id].type = type; special.add(id); });
  const nearSpecial = (g: number[]) =>
    g.some((id) => special.has(id) || [...tiles[id].next, ...tiles[id].prev].some((n) => special.has(n)));

  // Sanctuaries sit right before battle zones: the entrance column of merges, and before each crossing.
  if (sanctuary) {
    for (const zc of board.zoneCols) {
      const z = zones[zc.zone];
      if (!z) continue;
      const cols = z.type === 'merge' ? [zc.from] : z.type === 'crossing' ? [zc.from + Math.floor((zc.to - zc.from + 1) / 3) - 1] : [];
      for (const c of cols) {
        for (const g of symmetric) if (tiles[g[0]].col === c) setGroup(g, sanctuary.id);
      }
    }
  }

  const candidates = symmetric.filter((g) => {
    const t = tiles[g[0]];
    return !t.checkpoint && t.col < lastCol - 2;
  });

  // Portal pairs link distant groups of the same size, crossing lanes for drama.
  if (portal) {
    const pairs = board.players >= 3 ? 2 : 1;
    let made = 0;
    for (const a of shuffle(rng, candidates.slice())) {
      if (made >= pairs) break;
      if (nearSpecial(a)) continue;
      const b = candidates.find(
        (g) => g.length === a.length && !nearSpecial(g) &&
          tiles[g[0]].col - tiles[a[0]].col >= 8 && tiles[g[0]].zone !== tiles[a[0]].zone,
      );
      if (!b) continue;
      const sa = a.slice().sort((x, y) => tiles[x].y - tiles[y].y);
      const sb = b.slice().sort((x, y) => tiles[y].y - tiles[x].y);
      setGroup(a, portal.id);
      setGroup(b, portal.id);
      sa.forEach((id, i) => { tiles[id].pair = sb[i]; tiles[sb[i]].pair = id; });
      made++;
    }
  }

  const meshCount = tiles.filter((t) => t.zone >= 0).length;
  const target = Math.round(meshCount * SPECIAL_RATIO[board.players as PlayerCount]);
  for (const g of shuffle(rng, candidates.slice())) {
    if (special.size >= target) break;
    if (nearSpecial(g)) continue;
    const z = zones[tiles[g[0]].zone];
    const r = rand(rng);
    const harmful = HARMFUL_SHARE[z?.danger ?? 'medium'];
    const cat = r < harmful ? 'harmful' : r < harmful + NEUTRAL_SHARE ? 'neutral' : 'helpful';
    const list = pool[cat].length ? pool[cat] : pool.harmful;
    if (list.length) setGroup(g, weighted(rng, list).id);
  }
}

// ─── Fairness ─────────────────────────────────────────────────────────────

/**
 * Every start must have the same distance to the finish, and roughly the same
 * share of harmful tiles reachable before the lanes first fully merge.
 */
export function fairness(board: Board, defs: TileTypeDef[]) {
  const harmful = new Set(defs.filter((d) => d.category === 'harmful').map((d) => d.id));
  const distances = board.starts.map((s) => board.distToFinish[s]);
  const mergeCol =
    board.tiles.find((t) => t.zone >= 0 && t.shared && board.tiles.filter((u) => u.col === t.col).length === 1)?.col ??
    board.cols;

  const exposure = board.starts.map((s) => {
    const seen = new Set<number>([s]);
    const q = [s];
    let bad = 0;
    while (q.length) {
      const t = q.shift()!;
      if (harmful.has(board.tiles[t].type)) bad++;
      for (const n of board.tiles[t].next) {
        if (!seen.has(n) && board.tiles[n].col < mergeCol) {
          seen.add(n);
          q.push(n);
        }
      }
    }
    return bad / seen.size;
  });
  const sameDistance = distances.every((d) => d === distances[0]);
  const maxE = Math.max(...exposure);
  const minE = Math.min(...exposure);
  const ok = sameDistance && maxE - minE <= 0.1 * Math.max(maxE, 0.1) + 0.02;
  return { ok, distances, exposure };
}
