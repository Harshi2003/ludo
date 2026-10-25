import { describe, expect, it } from 'vitest';
import { magicPack as pack } from '@ludo/themepack';
import {
  BOARD_TARGET, botAction, canUseAbility, createGame, enumeratePaths, fairness, generateBoard, legalMoves, progress,
  runEffects, simulate, step, type GameState, type PlayerCount,
} from '../src';

const board = (players: PlayerCount, seed = 1) => generateBoard({ players, seed, zones: pack.zones, tiles: pack.tiles });
const funnel = pack.zones.findIndex((z) => z.type === 'funnel');
/** A game whose single-file final zone is plain path, so test positions are exact. */
const game = (chars = ['inferno', 'terra', 'aqua', 'zephyr'], seed = 7) => {
  const s = createGame(pack, { seed, players: chars.map((character) => ({ character, bot: true })) });
  for (const t of s.board.tiles) if (t.zone === funnel && !t.finish) t.type = 'path';
  return s;
};
/** Puts one piece on a tile without side effects. */
const place = (s: GameState, seat: number, tile: number, piece = 0) => { s.players[seat].pieces[piece].tile = tile; };
const at = (s: GameState, seat: number, piece = 0) => s.players[seat].pieces[piece];
const meshTile = (s: GameState, pred: (t: GameState['board']['tiles'][number]) => boolean) =>
  s.board.tiles.find((t) => t.zone >= 0 && !t.finish && pred(t))!;
/** The `k`th tile of one chain through the final zone: each step follows the first `next` link. */
const along = (s: GameState, k: number) => {
  let t = s.board.tiles.filter((x) => x.zone === funnel).sort((a, b) => a.col - b.col || a.lane - b.lane)[0].id;
  for (let i = 0; i < k; i++) t = s.board.tiles[t].next[0];
  return t;
};
const run = (s: GameState, seat: number, effects: Parameters<typeof runEffects>[3], piece = 0) =>
  runEffects(pack, s, seat, effects, { source: 'test', fromAbility: true, piece });
const unshield = (s: GameState) => s.players.forEach((p) => p.pieces.forEach((q) => (q.shield = null)));

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

  it('has a changing graph frontier and shared collision tiles', () => {
    const b = board(4);
    expect(b.lanes).toBe(3);
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

describe('squads', () => {
  it('gives every house three pieces on its start tile', () => {
    const s = game();
    for (const p of s.players) {
      expect(p.pieces).toHaveLength(3);
      expect(p.pieces.every((q) => q.tile === s.board.starts[p.seat])).toBe(true);
    }
    expect(s.players[0].pieces.map((q) => q.member)).toEqual(['inferno', 'cinder', 'vex']);
  });

  it('offers moves for every piece, and one route per bond', () => {
    const s = game();
    const t = along(s, 1);
    place(s, 0, t, 0);
    const moves = legalMoves(pack, s, 0, 2);
    expect(new Set(moves.map((m) => m.piece))).toEqual(new Set([0, 1]));
    // Pieces 1 and 2 share the start tile, so their routes are offered once.
    expect(moves.some((m) => m.piece === 2)).toBe(false);
  });

  it('a bond cannot be landed on', () => {
    const s = game();
    const target = along(s, 2);
    place(s, 1, target, 0);
    place(s, 1, target, 1);
    place(s, 0, along(s, 0));
    expect(legalMoves(pack, s, 0, 2).some((m) => m.to === target)).toBe(false);
  });

  it('bonded pieces cast together', () => {
    const s = game();
    unshield(s);
    const t = along(s, 0);
    place(s, 0, t, 0);
    place(s, 0, t, 1);
    place(s, 1, along(s, 3));
    step(pack, s, { type: 'ability', which: 'active', piece: 0 });
    // Pyra's Dragonbreath took Grom out and Cinder's Ashwalk set the road behind on fire.
    expect(at(s, 1).tile).toBe(s.board.starts[1]);
    expect(s.traps.length).toBeGreaterThan(0);
    expect(s.events.some((e) => e.kind === 'ability' && e.msg.startsWith('Combo!'))).toBe(true);
    expect(at(s, 0, 1).cooldown).toBeGreaterThan(0);
  });

  it('a house wins once two of its pieces are home', () => {
    const s = game();
    const near = s.board.tiles[s.board.finish].prev[0];
    const home = (piece: number) => {
      place(s, 0, near, piece);
      s.turn = 0;
      s.phase = 'move';
      s.moves = legalMoves(pack, s, 0, 6).filter((m) => m.piece === piece);
      step(pack, s, { type: 'move', index: s.moves.findIndex((m) => m.to === s.board.finish) });
    };
    home(2);
    expect(s.winner).toBeNull();
    expect(s.events.some((e) => e.kind === 'home')).toBe(true);
    home(1);
    expect(s.winner).toBe(0);
  });

  it('a bond marches together', () => {
    const s = game(['zephyr', 'terra']);
    place(s, 0, along(s, 1), 0);
    place(s, 0, along(s, 1), 1);
    s.phase = 'move';
    s.moves = legalMoves(pack, s, 0, 2).filter((m) => m.piece === 0);
    step(pack, s, { type: 'move', index: s.moves.findIndex((m) => m.to === along(s, 3)) });
    expect(at(s, 0, 0).tile).toBe(along(s, 3));
    expect(at(s, 0, 1).tile).toBe(along(s, 3));
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

describe('takedowns', () => {
  const landOn = (s: GameState, victimSeat: number) => {
    unshield(s);
    const target = along(s, 2);
    place(s, 0, along(s, 1));
    place(s, victimSeat, target);
    at(s, victimSeat).checkpoint = along(s, 0);
    s.phase = 'move';
    s.rawRoll = 1;
    s.moves = legalMoves(pack, s, 0, 1);
    step(pack, s, { type: 'move', index: s.moves.findIndex((m) => m.piece === 0 && m.to === target) });
  };

  it('sends the victim all the way back to the start and charges both ultimates', () => {
    const s = game();
    landOn(s, 1);
    expect(at(s, 1).tile).toBe(s.board.starts[1]);
    expect(s.players[0].captures).toBe(1);
    expect(s.players[1].ult).toBeGreaterThanOrEqual(pack.rules.ultimateCharge.captured);
  });

  it('Healing Waters: a Tide washes up at its checkpoint the first time only', () => {
    const s = game();
    landOn(s, 2);
    expect(at(s, 2).tile).toBe(along(s, 0));
    expect(at(s, 2).saved).toBe(true);
  });

  it('Phoenix Blood burns the killer back to their checkpoint', () => {
    const s = game(['terra', 'inferno']);
    s.round = 7; // the air tide reigns, so Grom's roll of 1 moves exactly 1
    unshield(s);
    place(s, 0, along(s, 3));
    at(s, 0).checkpoint = along(s, 0);
    place(s, 1, along(s, 4));
    s.phase = 'move';
    s.moves = legalMoves(pack, s, 0, 1);
    step(pack, s, { type: 'move', index: s.moves.findIndex((m) => m.piece === 0 && m.to === along(s, 4)) });
    expect(at(s, 1).tile).toBe(s.board.starts[1]);
    expect(at(s, 0).tile).toBe(along(s, 0));
  });

  it('never captures on a sanctuary', () => {
    const s = game();
    const sanct = meshTile(s, (t) => t.type === 'sanctuary');
    place(s, 1, sanct.id);
    place(s, 0, s.board.tiles[sanct.prev[0]].id);
    const moves = legalMoves(pack, s, 0, 1).filter((m) => m.to === sanct.id);
    expect(moves.every((m) => m.captures.length === 0)).toBe(true);
  });
});

describe('effect primitives', () => {
  const s0 = () => {
    const s = game();
    place(s, 0, along(s, 0));
    place(s, 1, along(s, 2));
    unshield(s);
    return s;
  };

  it('move pushes back along the graph, but Bedrock stands firm', () => {
    const s = s0();
    place(s, 2, along(s, 3));
    const before = progress(s.board, at(s, 2).tile);
    run(s, 0, [{ op: 'move', target: { who: 'leader' }, n: -2 }]);
    expect(progress(s.board, at(s, 2).tile)).toBe(before - 2);
    const stone = at(s, 1).tile;
    run(s, 0, [{ op: 'move', target: { who: 'nearest' }, n: -2 }]);
    expect(at(s, 1).tile).toBe(stone);
  });

  it('shields absorb opponent powers; strip tears them off', () => {
    const s = s0();
    at(s, 1).shield = { charges: 1, turns: 3 };
    run(s, 0, [{ op: 'skip_turn', target: { who: 'nearest' }, n: 1 }]);
    expect(s.players[1].skip).toBe(0);
    expect(at(s, 1).shield).toBeNull();
    at(s, 1).shield = { charges: 1, turns: 3 };
    run(s, 0, [{ op: 'strip', target: { who: 'nearest' } }, { op: 'skip_turn', target: { who: 'nearest' }, n: 1 }]);
    expect(s.players[1].skip).toBe(1);
  });

  it('kill sends a rival home and counts as a capture', () => {
    const s = s0();
    run(s, 0, [{ op: 'kill', target: { who: 'nearest' } }]);
    expect(at(s, 1).tile).toBe(s.board.starts[1]);
    expect(s.players[0].captures).toBe(1);
  });

  it('pull drags the target onto the tile right in front of the caster', () => {
    const s = s0();
    run(s, 0, [{ op: 'pull', target: { who: 'nearest' } }]);
    // Grom is rooted; a Gale is not.
    expect(at(s, 1).tile).toBe(along(s, 2));
    place(s, 3, along(s, 4));
    run(s, 0, [{ op: 'pull', target: { who: 'leader' } }]);
    expect(at(s, 3).tile).toBe(along(s, 1));
  });

  it('petrify freezes a piece: no moves, no harm, nobody lands there', () => {
    const s = s0();
    run(s, 0, [{ op: 'petrify', target: { who: 'nearest' }, turns: 2 }]);
    expect(at(s, 1).stone).toBe(3);
    expect(legalMoves(pack, s, 1, 3).some((m) => m.piece === 0)).toBe(false);
    run(s, 0, [{ op: 'kill', target: { who: 'nearest' } }]);
    expect(at(s, 1).tile).toBe(along(s, 2));
    expect(legalMoves(pack, s, 0, 2).some((m) => m.to === along(s, 2))).toBe(false);
  });

  it('snare only lets a high roll break free', () => {
    const s = s0();
    run(s, 0, [{ op: 'snare', target: { who: 'nearest' }, need: 5, turns: 2 }]);
    expect(legalMoves(pack, s, 1, 4).some((m) => m.piece === 0)).toBe(false);
    expect(legalMoves(pack, s, 1, 5).some((m) => m.piece === 0)).toBe(true);
  });

  it('a reflecting shield sends the attacker home instead', () => {
    const s = s0();
    at(s, 1).shield = { charges: 1, turns: 3, reflect: true };
    // The bounced attacker is an Ember: Phoenix Blood burns Grom back to his checkpoint, which is here.
    at(s, 1).checkpoint = along(s, 2);
    place(s, 0, along(s, 1));
    s.phase = 'move';
    s.moves = legalMoves(pack, s, 0, 1);
    step(pack, s, { type: 'move', index: s.moves.findIndex((m) => m.piece === 0 && m.to === along(s, 2)) });
    expect(at(s, 0).tile).toBe(s.board.starts[0]);
    expect(at(s, 1).tile).toBe(along(s, 2));
  });

  it('revive raises fallen squadmates at their checkpoints', () => {
    const s = game(['aqua', 'terra']);
    at(s, 0, 1).checkpoint = along(s, 0);
    place(s, 0, along(s, 2), 2);
    run(s, 0, [{ op: 'revive' }], 2);
    expect(at(s, 0, 1).tile).toBe(along(s, 0));
  });

  it('recall forms a bond, and Eye of the Storm shields the arriving Gale', () => {
    const s = game(['zephyr', 'terra']);
    place(s, 0, along(s, 2));
    place(s, 0, along(s, 0), 1);
    run(s, 0, [{ op: 'recall', range: 4 }]);
    expect(s.players[0].pieces.filter((q) => q.tile === along(s, 2))).toHaveLength(2);
    expect(s.events.some((e) => e.kind === 'bond')).toBe(true);
    expect(at(s, 0, 1).shield).not.toBeNull();
  });

  it('recall behind drops the squadmate just behind the caster', () => {
    const s = game(['zephyr', 'terra']);
    place(s, 0, along(s, 3));
    place(s, 0, along(s, 0), 1);
    run(s, 0, [{ op: 'recall', range: 8, behind: true }]);
    expect(at(s, 0, 1).tile).toBe(along(s, 2));
  });

  it('join leaps onto the nearest squadmate ahead', () => {
    const s = game(['terra', 'zephyr']);
    place(s, 0, along(s, 4), 0);
    place(s, 0, along(s, 1), 2);
    run(s, 0, [{ op: 'join', range: 8 }], 2);
    expect(at(s, 0, 2).tile).toBe(along(s, 4));
  });

  it('scramble shuffles the caster and nearby rivals among their tiles', () => {
    const s = game(['zephyr', 'inferno', 'aqua']);
    place(s, 0, along(s, 2));
    place(s, 1, along(s, 1));
    place(s, 2, along(s, 3));
    const tiles = () => [at(s, 0).tile, at(s, 1).tile, at(s, 2).tile];
    const before = tiles();
    run(s, 0, [{ op: 'scramble', range: 3 }]);
    expect(tiles().sort()).toEqual([...before].sort());
    expect(tiles()).not.toEqual(before);
  });

  it('trample crushes everyone on the path', () => {
    const s = game(['terra', 'zephyr', 'aqua']);
    unshield(s);
    place(s, 0, along(s, 0));
    place(s, 1, along(s, 1));
    place(s, 2, along(s, 3), 1);
    at(s, 2, 1).saved = true;
    run(s, 0, [{ op: 'trample', n: 4 }]);
    expect(at(s, 1).tile).toBe(s.board.starts[1]);
    expect(at(s, 2, 1).tile).toBe(s.board.starts[2]);
    expect(at(s, 0).tile).toBe(along(s, 4));
  });

  it('blast takes out rivals around every squad piece', () => {
    const s = game(['inferno', 'zephyr']);
    place(s, 0, along(s, 0));
    place(s, 0, along(s, 4), 1);
    place(s, 1, along(s, 1));
    place(s, 1, along(s, 5), 1);
    place(s, 1, along(s, 3), 2);
    run(s, 0, [{ op: 'blast', radius: 1, from: 'squad' }]);
    expect(at(s, 1, 0).tile).toBe(s.board.starts[1]);
    expect(at(s, 1, 1).tile).toBe(s.board.starts[1]);
    expect(at(s, 1, 2).tile).toBe(s.board.starts[1]);
  });

  it('scorch leaves traps behind the caster', () => {
    const s = s0();
    place(s, 0, along(s, 3));
    run(s, 0, [{ op: 'scorch', n: 3, turns: 2, effects: [{ op: 'send_to_checkpoint', target: { who: 'self' } }] }]);
    expect(s.traps.map((t) => t.tile).sort()).toEqual([along(s, 0), along(s, 1), along(s, 2)].sort());
  });

  it('gather flies the nearby squad to one safe tile ahead', () => {
    const s = game(['zephyr', 'terra']);
    place(s, 0, along(s, 2));
    place(s, 0, along(s, 1), 1);
    place(s, 0, along(s, 0), 2);
    run(s, 0, [{ op: 'gather', range: 4 }]);
    const tiles = new Set(s.players[0].pieces.map((q) => q.tile));
    expect(tiles.size).toBe(1);
    expect(progress(s.board, [...tiles][0])).toBeGreaterThan(progress(s.board, along(s, 2)));
  });

  it('reverse dice only offer backward moves; six loads the next roll', () => {
    const s = game(['zephyr', 'terra']);
    place(s, 0, along(s, 2));
    run(s, 0, [{ op: 'modify_dice', target: { who: 'self' }, mode: 'reverse', turns: 1 }]);
    expect(legalMoves(pack, s, 0, 2).every((m) => m.dir === 'back')).toBe(true);
    s.players[0].dice = null;
    run(s, 0, [{ op: 'modify_dice', target: { who: 'self' }, mode: 'six', turns: 1 }]);
    step(pack, s, { type: 'roll' });
    expect(s.rawRoll).toBe(6);
  });

  it('swap, skip, dice, ultimate charge and extra roll', () => {
    const s = s0();
    place(s, 3, along(s, 3));
    const [a, b] = [at(s, 0).tile, at(s, 3).tile];
    run(s, 0, [{ op: 'swap', target: { who: 'leader' } }]);
    expect([at(s, 0).tile, at(s, 3).tile]).toEqual([b, a]);
    run(s, 0, [
      { op: 'skip_turn', target: { who: 'nearest' }, n: 2 },
      { op: 'modify_dice', target: { who: 'self' }, mode: 'halve', turns: 2 },
      { op: 'charge_ultimate', target: { who: 'self' }, n: 3 },
      { op: 'extra_roll' },
    ]);
    expect(s.players[0].dice?.mode).toBe('halve');
    expect(s.players[0].ult).toBe(3);
    expect(s.bonusRoll).toBe(true);
  });

  it('dash moves forward and takes out whoever it lands on', () => {
    const s = game(['zephyr', 'terra']);
    unshield(s);
    place(s, 0, along(s, 0));
    place(s, 1, along(s, 2));
    run(s, 0, [{ op: 'dash', n: 2 }]);
    expect(at(s, 0).tile).toBe(along(s, 2));
    expect(at(s, 1).tile).toBe(s.board.starts[1]);
  });

  it('Phoenix Blood: every Ember kill fuels another dash', () => {
    const s = game(['inferno', 'zephyr']);
    unshield(s);
    place(s, 0, along(s, 0));
    place(s, 1, along(s, 2));
    run(s, 0, [{ op: 'dash', n: 2 }]);
    expect(at(s, 1).tile).toBe(s.board.starts[1]);
    expect(progress(s.board, at(s, 0).tile)).toBeGreaterThan(progress(s.board, along(s, 2)));
  });

  it('portals teleport to their pair and go on cooldown', () => {
    const s = s0();
    const portal = s.board.tiles.find((t) => t.type === 'portal')!;
    place(s, 0, portal.id);
    runEffects(pack, s, 0, [{ op: 'teleport', to: 'portal_pair' }], { source: 'portal', tile: portal.id });
    expect(at(s, 0).tile).toBe(portal.pair);
    expect(s.portalCd[portal.id]).toBeGreaterThan(0);
  });

  it('block_tile seals the path ahead of the target', () => {
    const s = s0();
    place(s, 3, along(s, 3));
    run(s, 0, [{ op: 'block_tile', target: { who: 'leader' }, turns: 1 }]);
    expect(legalMoves(pack, s, 3, 1).filter((m) => m.piece === 0 && m.dir === 'fwd')).toHaveLength(0);
  });

  it('ward makes a tile safe for everyone', () => {
    const s = s0();
    place(s, 3, along(s, 1));
    run(s, 3, [{ op: 'ward', turns: 2 }]);
    expect(legalMoves(pack, s, 0, 1).filter((m) => m.to === along(s, 1)).every((m) => m.captures.length === 0)).toBe(true);
  });
});

describe('edge cases', () => {
  it('a leap over a checkpoint still records it', () => {
    const s = game(['terra', 'zephyr']);
    const before = s.board.tiles[along(s, 0)].prev[0];
    place(s, 0, along(s, 3), 0);
    place(s, 0, before, 2);
    run(s, 0, [{ op: 'join', range: 8 }], 2);
    expect(at(s, 0, 2).checkpoint).toBe(along(s, 0));
  });

  it('"back to the checkpoint" never carries a piece forward', () => {
    const s = game();
    unshield(s);
    place(s, 0, along(s, 0));
    place(s, 3, along(s, 2));
    at(s, 3).checkpoint = along(s, 4); // walked back past it
    run(s, 0, [{ op: 'send_to_checkpoint', target: { who: 'leader' } }]);
    expect(at(s, 3).tile).toBe(along(s, 0));
  });

  it('pushes never shove a piece into another house\'s start lane', () => {
    const s = game();
    unshield(s);
    const b = s.board;
    const entry = b.tiles.find((t) => t.zone >= 0 && t.prev.some((p) => b.tiles[p].start !== undefined))!;
    place(s, 0, along(s, 0));
    place(s, 3, entry.id);
    run(s, 0, [{ op: 'move', target: { who: 'all' }, n: -2 }]);
    const lane = b.tiles[at(s, 3).tile].start;
    expect(lane === undefined || lane === 3).toBe(true);
  });

  it('a forced move stops short of a rival bond', () => {
    const s = game();
    unshield(s);
    place(s, 0, along(s, 0));
    place(s, 3, along(s, 3));
    place(s, 1, along(s, 1), 1);
    place(s, 1, along(s, 1), 2);
    run(s, 0, [{ op: 'move', target: { who: 'leader' }, n: -2 }]);
    expect(at(s, 3).tile).toBe(along(s, 2));
  });

  it('Dragonbreath will not fire at a rival standing on holy ground', () => {
    const s = game(['inferno', 'zephyr']);
    unshield(s);
    s.turn = 0;
    place(s, 0, along(s, 0));
    place(s, 1, along(s, 2));
    expect(canUseAbility(pack, s, 'active', 0)).toBe(true);
    s.wards.push({ tile: along(s, 2), owner: 1, turns: 3 });
    expect(canUseAbility(pack, s, 'active', 0)).toBe(false);
  });

  it('stone pieces are never picked as targets', () => {
    const s = game(['terra', 'zephyr', 'aqua']);
    unshield(s);
    place(s, 0, along(s, 0));
    place(s, 1, along(s, 1));
    place(s, 2, along(s, 3));
    at(s, 1).stone = 3;
    run(s, 0, [{ op: 'petrify', target: { who: 'nearest' }, turns: 2 }]);
    expect(at(s, 2).stone).toBe(3);
  });

  it('a fire trap kill counts as the trap owner\'s capture', () => {
    const s = game(['inferno', 'zephyr']);
    unshield(s);
    place(s, 0, along(s, 3), 1);
    run(s, 0, [{ op: 'scorch', n: 2, turns: 3, effects: [{ op: 'kill', target: { who: 'self' } }] }], 1);
    const fire = s.traps[0].tile;
    place(s, 1, s.board.tiles[fire].prev[0]);
    s.turn = 1;
    s.phase = 'move';
    s.moves = legalMoves(pack, s, 1, 1).filter((m) => m.piece === 0 && m.to === fire);
    step(pack, s, { type: 'move', index: 0 });
    expect(s.players[0].captures).toBe(1);
    expect(at(s, 1).tile).toBe(s.board.starts[1]);
  });

  it('Healing Waters saves a Tide from a vent too', () => {
    const s = game(['aqua', 'terra']);
    unshield(s);
    place(s, 0, along(s, 2));
    at(s, 0).checkpoint = along(s, 0);
    run(s, 0, [{ op: 'kill', target: { who: 'self' } }]);
    expect(at(s, 0).tile).toBe(along(s, 0));
    expect(at(s, 0).saved).toBe(true);
  });

  it('a loaded six and a reversed roll each touch only one roll', () => {
    const s = game(['zephyr', 'terra']);
    place(s, 0, along(s, 2));
    run(s, 0, [{ op: 'modify_dice', target: { who: 'self' }, mode: 'reverse', turns: 1 }]);
    step(pack, s, { type: 'roll' });
    expect(s.players[0].dice?.spent).toBe(true);
    expect(legalMoves(pack, s, 0, 2).some((m) => m.dir === 'fwd')).toBe(true);
  });

  it('a piece already on the throne cannot cast', () => {
    const s = game(['zephyr', 'terra']);
    s.turn = 0;
    place(s, 0, s.board.finish, 2);
    expect(canUseAbility(pack, s, 'active', 2)).toBe(false);
    expect(canUseAbility(pack, s, 'active', 0)).toBe(true);
  });
});

describe('full games', () => {
  it('bots finish 4-player games deterministically', () => {
    const runGame = () => {
      const s = game(undefined, 99);
      for (let i = 0; i < 20000 && s.phase !== 'over'; i++) step(pack, s, botAction(pack, s));
      return s;
    };
    const a = runGame();
    expect(a.phase).toBe('over');
    expect(a.winner).not.toBeNull();
    expect(runGame().events.length).toBe(a.events.length);
  });

  it('simulates without crashing for every player count', () => {
    for (const players of [2, 3, 4] as PlayerCount[]) {
      const r = simulate(pack, { games: 40, players, seed: players });
      expect(r.winsBySeat.reduce((a, b) => a + b, 0)).toBe(40);
    }
  });
});
