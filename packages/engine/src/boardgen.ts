import { rand, randInt, shuffle, weighted } from './rng';
import type { Board, Tile, TileTypeDef, ZoneDef, ZoneType } from './types';

export type PlayerCount = 2 | 3 | 4;

export const BOARD_TARGET: Record<PlayerCount, number> = { 2: 100, 3: 135, 4: 145 };
/** A changing frontier, rather than fixed lanes, keeps the graph readable on phones. */
export const MAX_PATHS = 3;
export const SPECIAL_RATIO: Record<PlayerCount, number> = { 2: 0.15, 3: 0.18, 4: 0.2 };
const HARMFUL_SHARE = { low: 0.3, medium: 0.45, high: 0.6 };
const NEUTRAL_SHARE = 0.22;

const PATH_GAP = 0.84;
const PATH_LIMIT = 1.65;
const MIN_ZONE_TILES: Record<ZoneType, number> = { lane: 10, crossing: 14, merge: 10, branch: 14, funnel: 8 };

export interface BoardGenOptions {
  players: PlayerCount;
  seed: number;
  zones: ZoneDef[];
  tiles: TileTypeDef[];
  /** Overrides SPECIAL_RATIO. */
  specialRatio?: number;
}

export function generateBoard(opts: BoardGenOptions): Board {
  const board = buildGraph(opts);
  const rng = { rng: opts.seed ^ 0x9e3779b9 };
  placeSpecials(board, opts, rng);
  return board;
}

// ─── Graph construction ────────────────────────────────────────────────────

function buildGraph(opts: BoardGenOptions): Board {
  const P = opts.players;
  const layoutRng = { rng: opts.seed ^ 0x51ed270b };
  const startLen = 3 + randInt(layoutRng, 3);
  const tiles: Tile[] = [];
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

  // Everyone reaches the same entry node before choosing their own route.
  // This gives all seats equal access without requiring mirrored branches.
  const span = 2.4;
  const starts: number[] = [];
  const startEnds: number[] = [];
  for (let p = 0; p < P; p++) {
    const y = -span / 2 + (p * span) / (P - 1);
    let prev = -1;
    for (let k = 0; k < startLen; k++) {
      const id = add(k, y, -1, -1 - p, { start: p, checkpoint: k === 0 });
      if (prev >= 0) link(prev, id);
      else starts.push(id);
      prev = id;
    }
    startEnds.push(prev);
  }

  let frontier = startEnds;
  let widest = 1;
  let col = startLen;
  const zoneCols: Board['zoneCols'] = [];
  const zones = opts.zones.at(-1)?.type === 'funnel'
    ? opts.zones
    : [...opts.zones, { id: 'funnel', name: 'Finish', type: 'funnel' as const, length: 5, danger: 'high' as const, description: '' }];
  // Allocate actual nodes before growing the graph. Variable-width paths then
  // stay within the game's size target without repeatedly rerolling its shape.
  const minimums = zones.map((z, i) => i === 0 ? 18 : MIN_ZONE_TILES[z.type]);
  const weights = zones.map((z) => z.length * (0.65 + rand(layoutRng) * 0.7));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const extra = Math.max(0, BOARD_TARGET[P] - tiles.length - minimums.reduce((a, b) => a + b, 0));
  const budgets = minimums.map((n, i) => n + Math.floor(extra * weights[i] / totalWeight));
  const remainder = extra - budgets.reduce((sum, n, i) => sum + n - minimums[i], 0);
  for (const i of shuffle(layoutRng, zones.map((_, i) => i)).slice(0, remainder)) budgets[i]++;

  zones.forEach((z, zi) => {
    const rng = { rng: opts.seed ^ Math.imul(zi + 1, 0x85ebca6b) };
    const first = col;
    const firstFork = 1 + randInt(rng, 2);
    const threePaths = firstFork + 2 + randInt(rng, 2);
    const bridgeStart = 1 + randInt(rng, 2);
    const bridgeEnd = bridgeStart + 2 + randInt(rng, 3);
    let remaining = budgets[zi];
    let hold = 0;

    for (let k = 0; remaining > 0; k++) {
      let count = frontier.length;
      if (zi === 0 && k === 0) count = 1;
      else if (z.type === 'funnel' && remaining <= 4) count = 1;
      else if (zi === 0 && (k === firstFork || k === threePaths - 1)) count = 2;
      else if (zi === 0 && k === threePaths) count = 3;
      else if (z.type === 'merge' && k >= bridgeStart && k < bridgeEnd) count = 1;
      else if (hold-- <= 0) {
        const roll = rand(rng);
        if (count === 1) count = roll < 0.18 ? 3 : roll < 0.85 ? 2 : 1;
        else if (count === MAX_PATHS) count = roll < 0.65 ? 2 : 3;
        else count = roll < (z.type === 'branch' ? 0.6 : 0.42) ? 3 : roll < 0.85 ? 1 : 2;
        hold = randInt(rng, z.type === 'lane' ? 3 : 2);
      }
      count = Math.min(count, remaining);

      // Expand or contract just one part of the frontier. Other routes continue,
      // so a left-hand fork need not mirror what happens on the right.
      const parents = frontier.map((id) => [id]);
      while (parents.length < count) {
        const split = randInt(rng, parents.length);
        parents.splice(split, 1, parents[split], [...parents[split]]);
      }
      while (parents.length > count) {
        const merge = randInt(rng, parents.length - 1);
        parents.splice(merge, 2, [...parents[merge], ...parents[merge + 1]]);
      }

      const bend = (rand(rng) - 0.5) * 0.35;
      const next: number[] = [];
      let previousY = -Infinity;
      parents.forEach((sources, i) => {
        const siblings = parents.map((p, j) => p.length === 1 && p[0] === sources[0] ? j : -1).filter((j) => j >= 0);
        const offset = sources.length === 1 && siblings.length > 1
          ? (siblings.indexOf(i) - (siblings.length - 1) / 2) * (0.95 + rand(rng) * 0.3) : 0;
        const origin = sources.reduce((sum, id) => sum + tiles[id].y, 0) / sources.length;
        const low = Math.max(-PATH_LIMIT + i * PATH_GAP, previousY + PATH_GAP);
        const high = PATH_LIMIT - (count - 1 - i) * PATH_GAP;
        const y = Math.max(low, Math.min(high, origin + offset + bend + (rand(rng) - 0.5) * 0.38));
        const id = add(col, y, zi, i, { checkpoint: k === 0, shared: sources.length > 1 || count === 1 });
        tiles[id].x += (rand(rng) - 0.5) * 0.12;
        sources.forEach((source) => link(source, id));
        next.push(id);
        previousY = y;
      });

      // Occasional one-way side connections add choices without a lattice.
      if (frontier.length === count && count > 1 && rand(rng) < (z.type === 'crossing' ? 0.32 : 0.12)) {
        const i = randInt(rng, count - 1);
        const direction = randInt(rng, 2);
        link(frontier[i + direction], next[i + 1 - direction]);
        tiles[next[i + 1 - direction]].shared = true;
      }
      frontier = next;
      widest = Math.max(widest, count);
      remaining -= count;
      col++;
    }
    zoneCols.push({ zone: zi, from: first, to: col - 1 });
  });

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

  return { seed: opts.seed, players: P, lanes: widest, cols: col, tiles, starts, finish, distToFinish, zoneCols };
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

  const lastCol = tiles[board.finish].col;
  const special = new Set<number>();
  const setTile = (t: Tile, type: string) => { t.type = type; special.add(t.id); };
  const nearSpecial = (t: Tile) => special.has(t.id) || [...t.next, ...t.prev].some((n) => special.has(n));

  // A few safe landing spots precede real joins, rather than paired symbols.
  if (sanctuary) {
    for (const zc of board.zoneCols) {
      const z = zones[zc.zone];
      if (!z) continue;
      if (z.type !== 'merge' && z.type !== 'crossing') continue;
      const joins = shuffle(rng, tiles.filter((t) => t.zone === zc.zone && t.prev.length > 1 && t.col > zc.from));
      const before = joins[0]?.prev.map((id) => tiles[id]).filter((t) => t.zone >= 0 && !nearSpecial(t)) ?? [];
      if (before.length) setTile(before[randInt(rng, before.length)], sanctuary.id);
      else {
        const entry = tiles.find((t) => t.col === zc.from);
        if (entry) setTile(entry, sanctuary.id);
      }
    }
  }

  const candidates = tiles.filter((t) => t.zone >= 0 && !t.checkpoint && !t.finish && t.col < lastCol - 2);

  // Portals can connect any two distant branches, including offset side paths.
  if (portal) {
    const pairs = board.players >= 3 ? 2 : 1;
    let made = 0;
    for (const a of shuffle(rng, candidates.slice())) {
      if (made >= pairs) break;
      if (nearSpecial(a)) continue;
      const b = candidates.find(
        (t) => !nearSpecial(t) && t.col - a.col >= 8 && t.zone !== a.zone,
      );
      if (!b) continue;
      setTile(a, portal.id);
      setTile(b, portal.id);
      a.pair = b.id;
      b.pair = a.id;
      made++;
    }
  }

  const meshCount = tiles.filter((t) => t.zone >= 0).length;
  const target = Math.round(meshCount * (opts.specialRatio ?? SPECIAL_RATIO[board.players as PlayerCount]));
  for (const t of shuffle(rng, candidates.slice())) {
    if (special.size >= target) break;
    if (nearSpecial(t)) continue;
    const z = zones[t.zone];
    const r = rand(rng);
    const harmful = HARMFUL_SHARE[z?.danger ?? 'medium'];
    const cat = r < harmful ? 'harmful' : r < harmful + NEUTRAL_SHARE ? 'neutral' : 'helpful';
    const list = pool[cat].length ? pool[cat] : pool.harmful;
    if (list.length) setTile(t, weighted(rng, list).id);
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
