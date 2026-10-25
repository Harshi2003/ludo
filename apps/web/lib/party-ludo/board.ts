import { randInt, type Board, type PlayerCount, type Tile } from '@ludo/engine';
import { partyPack } from './data';
import type { PartyConfig, TileKind } from './config';

function shuffle<T>(items: T[], s: { rng: number }) {
  for (let i = items.length - 1; i > 0; i--) { const j = randInt(s, i + 1); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
}
/** Party-only graph plans and organic geometry; shared engine rules are unchanged. */
export function createPartyBoard(players: PlayerCount, seed: number, config: PartyConfig): Board {
  const s = { rng: seed ^ 0x74ba31 };
  const board = buildPartyRoutes(players, seed, s);
  const columns = [...new Set(board.tiles.map(t => t.col))].sort((a, b) => a - b);
  const x = new Map<number, number>();
  let cursor = 0;
  for (const col of columns) { x.set(col, cursor); cursor += 1.02 + randInt(s, 400) / 1000; }
  const phase = randInt(s, 6283) / 1000;
  for (const col of columns) {
    const group = board.tiles.filter(t => t.col === col).sort((a, b) => a.y - b.y);
    const center = Math.sin(col * 0.23 + phase) * 1.1 + Math.sin(col * 0.08 + phase) * 0.5;
    let previous = -Infinity;
    for (const tile of group) {
      tile.x = x.get(col)! + (randInt(s, 241) - 120) / 1000;
      tile.y = Math.max(tile.y + center + (randInt(s, 501) - 250) / 1000, previous + 0.95);
      previous = tile.y;
    }
  }
  board.cols = Math.ceil(Math.max(...board.tiles.map(t => t.x))) + 1;
  board.zoneCols = board.zoneCols.map(z => ({ ...z, from: x.get(z.from)!, to: x.get(z.to)! }));
  decoratePartyBoard(board, { rng: seed ^ 0x2d4a81 }, config);
  return board;
}
/** Layered routes keep forward/backward movement compatible with existing helpers. */
function buildPartyRoutes(players: PlayerCount, seed: number, s: { rng: number }): Board {
  const tiles: Tile[] = [], starts: number[] = [], zoneCols: Board['zoneCols'] = [];
  let col = 0;
  const add = (y: number, zone: number, lane: number, start?: number) => {
    const id = tiles.length;
    tiles.push({ id, col, x: col, y, zone, lane, next: [], prev: [], type: 'safe', checkpoint: false,
      shared: start === undefined, ...(start === undefined ? {} : { start }) });
    return id;
  };
  const link = (a: number, b: number) => {
    if (!tiles[a].next.includes(b)) { tiles[a].next.push(b); tiles[b].prev.push(a); }
  };
  let previous: number[] = [];
  for (let k = 0; k < 4; k++, col++) {
    const current = Array.from({ length: players }, (_, p) => add((p - (players - 1) / 2) * 1.5, -1, p, p));
    current.forEach((id, p) => k === 0 ? starts.push(id) : link(previous[p], id));
    previous = current;
  }
  // Every game has two-way and three-way forks; their order, runs and cross-links vary.
  const patterns = shuffle([[1, 3, 1, 2, 1], [1, 2, 3, 1], [1, 3, 2, 3, 1], [1, 2, 1, 3, 1]], s);
  for (let zone = 0; zone < partyPack.zones.length; zone++) {
    const first = col;
    const pattern = zone === partyPack.zones.length - 1 ? [1, 2, 1] : patterns[zone];
    for (const width of pattern) {
      const run = width === 1 ? 1 + randInt(s, 2) : 2 + randInt(s, 3);
      for (let k = 0; k < run; k++, col++) {
        const current = Array.from({ length: width }, (_, lane) => add((lane - (width - 1) / 2) * 1.5, zone, lane));
        // Cover every incoming and outgoing lane without multiplying every path at every step.
        previous.forEach((id, i) => link(id, current[Math.min(width - 1, Math.floor(i * width / previous.length))]));
        current.forEach((id, i) => link(previous[Math.min(previous.length - 1, Math.floor(i * previous.length / width))], id));
        if (width > 1 && previous.length === width && randInt(s, 4) === 0) {
          const lane = randInt(s, width - 1);
          link(previous[lane], current[lane + 1]);
          link(previous[lane + 1], current[lane]);
        }
        previous = current;
      }
    }
    zoneCols.push({ zone, from: first, to: col - 1 });
  }
  const finish = previous[0]; tiles[finish].finish = true;
  const distToFinish = tiles.map(t => tiles[finish].col - t.col);
  return { seed, players, lanes: 3, cols: col, tiles, starts, finish, distToFinish, zoneCols };
}
/** Allocate weighted counts over eligible individual tiles, then shuffle independently of lanes. */
export function decoratePartyBoard(board: Board, s: { rng: number }, config: PartyConfig) {
  const eligible = board.tiles.filter(t => t.start === undefined && !t.finish);
  const entries = Object.entries(config.tileWeights) as [TileKind, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  const allocation = entries.map(([kind, w]) => ({ kind, count: Math.floor(w / total * eligible.length), remainder: w / total * eligible.length % 1 }));
  let remaining = eligible.length - allocation.reduce((sum, a) => sum + a.count, 0);
  const ranked = allocation.slice().sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; remaining > 0; i++, remaining--) ranked[i % ranked.length].count++;
  const bag = shuffle(allocation.flatMap(a => Array<TileKind>(a.count).fill(a.kind)), s);
  let index = 0;
  for (const tile of board.tiles) {
    tile.type = tile.start !== undefined || tile.finish ? 'safe' : bag[index++];
    tile.checkpoint = false; delete tile.pair;
  }
}
