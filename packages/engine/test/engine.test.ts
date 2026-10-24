import { describe, expect, it } from 'vitest';
import { magicPack as pack } from '@ludo/themepack';
import {
  BOARD_TARGET, botAction, createGame, enumeratePaths, fairness, generateBoard, legalMoves, progress,
  runEffects, simulate, step, type GameState, type PlayerCount,
} from '../src';

const board = (players: PlayerCount, seed = 1) => generateBoard({ players, seed, zones: pack.zones, tiles: pack.tiles });
const game = (chars = ['inferno', 'aqua', 'terra', 'zephyr'], seed = 7) =>
  createGame(pack, { seed, players: chars.map((character) => ({ character, bot: true })) });
/** Puts a seat on a tile without side effects. */
const place = (s: GameState, seat: number, tile: number) => { s.players[seat].tile = tile; };
const meshTile = (s: GameState, pred: (t: GameState['board']['tiles'][number]) => boolean) =>
  s.board.tiles.find((t) => t.zone >= 0 && !t.finish && pred(t))!;

describe('board generator', () => {
  for (const p of [2, 3, 4] as PlayerCount[]) {
    it(`builds a fair ${p}-player board near its tile target across 100 seeds`, () => {
      for (let seed = 1; seed <= 100; seed++) {
        const b = board(p, seed);
        expect(Math.abs(b.tiles.length - BOARD_TARGET[p]) / BOARD_TARGET[p]).toBeLessThan(0.12);
        expect(b.starts).toHaveLength(p);
        const f = fairness(b, pack.tiles);
        expect(f.distances.every((d) => d === f.distances[0])).toBe(true);
        expect(f.ok).toBe(true);
      }
    });
  }

  it('connects every tile and only moves left to right', () => {
    const b = board(4);
    for (const t of b.tiles) {
      expect(b.distToFinish[t.id]).toBeLessThan(Infinity);
      for (const n of t.next) expect(b.tiles[n].col).toBe(t.col + 1);
    }
  });

  it('has fewer mesh lanes than players and shared collision tiles', () => {
    const b = board(4);
    expect(b.lanes).toBeLessThan(4);
    expect(b.tiles.filter((t) => t.shared).length).toBeGreaterThan(8);
  });

  it('pairs portals both ways and places sanctuaries', () => {
    const b = board(4);
    const portals = b.tiles.filter((t) => t.type === 'portal');
    expect(portals.length).toBeGreaterThanOrEqual(2);
    for (const t of portals) expect(b.tiles[t.pair!].pair).toBe(t.id);
    expect(b.tiles.some((t) => t.type === 'sanctuary')).toBe(true);
  });
});

describe('movement', () => {
  it('cannot move backward into a start lane', () => {
    const s = game();
    const b = s.board;
    const entry = b.tiles.find((t) => t.zone >= 0 && t.prev.some((p) => b.tiles[p].start !== undefined))!;
    expect(enumeratePaths(b, entry.id, 1, 'back', new Set())).toHaveLength(0);
  });

  it('allows overshooting the finish', () => {
    const s = game();
    const near = s.board.tiles[s.board.tiles[s.board.finish].prev[0]];
    const paths = enumeratePaths(s.board, near.id, 6, 'fwd', new Set());
    expect(paths.map((p) => p[p.length - 1])).toContain(s.board.finish);
  });

  it('disables backward moves after the storm', () => {
    const s = game();
    place(s, 0, meshTile(s, (t) => t.col === 15).id);
    expect(legalMoves(pack, s, 0, 3).some((m) => m.dir === 'back')).toBe(true);
    s.storm = true;
    expect(legalMoves(pack, s, 0, 3).every((m) => m.dir === 'fwd')).toBe(true);
  });
});

describe('captures', () => {
  it('sends the victim to their last checkpoint and charges both ultimates', () => {
    const s = game();
    const target = meshTile(s, (t) => t.type === 'path' && t.col > 8);
    const from = s.board.tiles[target.prev[0]];
    place(s, 0, from.id);
    place(s, 1, target.id);
    s.players[1].checkpoint = s.board.starts[1];
    s.phase = 'move';
    s.rawRoll = 1;
    s.moves = legalMoves(pack, s, 0, 1);
    const idx = s.moves.findIndex((m) => m.to === target.id);
    s.players[1].shield = null;
    step(pack, s, { type: 'move', index: idx });
    expect(s.players[1].tile).toBe(s.board.starts[1]);
    expect(s.players[0].captures).toBe(1);
    expect(s.players[1].ult).toBeGreaterThanOrEqual(pack.rules.ultimateCharge.captured);
  });

  it('never captures on a sanctuary', () => {
    const s = game();
    const sanct = meshTile(s, (t) => t.type === 'sanctuary');
    place(s, 1, sanct.id);
    place(s, 0, s.board.tiles[sanct.prev[0]].id);
    const moves = legalMoves(pack, s, 0, 1).filter((m) => m.to === sanct.id);
    expect(moves.every((m) => m.captures.length === 0)).toBe(true);
  });

  it("Aqua's starting bubble blocks the first capture", () => {
    const s = game(['inferno', 'aqua']);
    expect(s.players[1].shield?.charges).toBe(1);
  });
});

describe('effect primitives', () => {
  const s0 = () => {
    const s = game();
    place(s, 0, meshTile(s, (t) => t.col === 20 && t.lane === 0).id);
    place(s, 1, meshTile(s, (t) => t.col === 22).id);
    s.players.forEach((p) => (p.shield = null));
    return s;
  };

  it('move pushes back along the graph', () => {
    const s = s0();
    const before = progress(s.board, s.players[1].tile);
    runEffects(pack, s, 0, [{ op: 'move', target: { who: 'nearest' }, n: -3 }], { source: 't' });
    expect(progress(s.board, s.players[1].tile)).toBe(before - 3);
  });

  it('Terra is immune to pushes', () => {
    const s = s0();
    s.players[1].character = 'terra';
    const before = s.players[1].tile;
    runEffects(pack, s, 0, [{ op: 'move', target: { who: 'nearest' }, n: -3 }], { source: 't' });
    expect(s.players[1].tile).toBe(before);
  });

  it('shields absorb opponent abilities', () => {
    const s = s0();
    s.players[1].shield = { charges: 1, turns: 3 };
    runEffects(pack, s, 0, [{ op: 'skip_turn', target: { who: 'nearest' }, n: 1 }], { source: 't', fromAbility: true });
    expect(s.players[1].skip).toBe(0);
    expect(s.players[1].shield).toBeNull();
  });

  it('swap, skip, dice, ultimate charge and extra roll', () => {
    const s = s0();
    const [a, b] = [s.players[0].tile, s.players[1].tile];
    runEffects(pack, s, 0, [{ op: 'swap', target: { who: 'nearest' } }], { source: 't' });
    expect([s.players[0].tile, s.players[1].tile]).toEqual([b, a]);
    runEffects(pack, s, 0, [
      { op: 'skip_turn', target: { who: 'nearest' }, n: 2 },
      { op: 'modify_dice', target: { who: 'self' }, mode: 'halve', turns: 2 },
      { op: 'charge_ultimate', target: { who: 'self' }, n: 3 },
      { op: 'extra_roll' },
    ], { source: 't' });
    expect(s.players[1].skip).toBe(2);
    expect(s.players[0].dice?.mode).toBe('halve');
    expect(s.players[0].ult).toBe(3);
    expect(s.bonusRoll).toBe(true);
  });

  it('dash moves forward and captures', () => {
    const s = s0();
    const path = enumeratePaths(s.board, s.players[0].tile, 2, 'fwd', new Set())[0];
    place(s, 1, path[1]);
    runEffects(pack, s, 0, [{ op: 'dash', n: 2 }], { source: 't' });
    expect(s.players[0].tile).toBe(path[1]);
    expect(s.players[1].tile).toBe(s.players[1].checkpoint);
  });

  it('portals teleport to their pair and go on cooldown', () => {
    const s = s0();
    const portal = s.board.tiles.find((t) => t.type === 'portal')!;
    place(s, 0, portal.id);
    runEffects(pack, s, 0, [{ op: 'teleport', to: 'portal_pair' }], { source: 'portal', tile: portal.id });
    expect(s.players[0].tile).toBe(portal.pair);
    expect(s.portalCd[portal.id]).toBeGreaterThan(0);
  });

  it('block_tile seals the path ahead of the target', () => {
    const s = s0();
    runEffects(pack, s, 0, [{ op: 'block_tile', target: { who: 'nearest' }, turns: 1 }], { source: 't' });
    const moves = legalMoves(pack, s, 1, 1).filter((m) => m.dir === 'fwd');
    expect(moves).toHaveLength(0);
  });

  it('traps fire on the next opponent to land', () => {
    const s = s0();
    runEffects(pack, s, 0, [{ op: 'place_trap', turns: 3, effects: [{ op: 'skip_turn', target: { who: 'self' }, n: 1 }] }], { source: 'trap' });
    expect(s.traps).toHaveLength(1);
  });

  it('safe teleport moves the player ahead', () => {
    const s = s0();
    const before = progress(s.board, s.players[0].tile);
    runEffects(pack, s, 0, [{ op: 'teleport', to: 'safe_ahead', range: 10 }], { source: 't' });
    expect(progress(s.board, s.players[0].tile)).toBeGreaterThan(before);
  });
});

describe('full games', () => {
  it('bots finish 4-player games deterministically', () => {
    const run = () => {
      const s = game(undefined, 99);
      for (let i = 0; i < 20000 && s.phase !== 'over'; i++) step(pack, s, botAction(pack, s));
      return s;
    };
    const a = run();
    expect(a.phase).toBe('over');
    expect(a.winner).not.toBeNull();
    expect(run().events.length).toBe(a.events.length);
  });

  it('simulates without crashing for every player count', () => {
    for (const players of [2, 3, 4] as PlayerCount[]) {
      const r = simulate(pack, { games: 40, players, seed: players });
      expect(r.winsBySeat.reduce((a, b) => a + b, 0)).toBe(40);
    }
  });
});
