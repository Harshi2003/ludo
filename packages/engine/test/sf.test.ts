import { describe, expect, it } from 'vitest';
import { sfPack as pack } from '@ludo/themepack';
import { createGame, legalMoves, progress, runEffects, simulate, step, WORLD, type GameState } from '../src';

const game = (chars = ['byte', 'karl', 'muni', 'ada'], seed = 7) =>
  createGame(pack, { seed, players: chars.map((character) => ({ character, bot: true })) });
const place = (s: GameState, seat: number, tile: number) => { s.players[seat].pieces[0].tile = tile; };
/** A plain street tile in the given zone (by id), `k` columns in. */
const zoneTile = (s: GameState, zoneId: string, k = 1) => {
  const z = pack.zones.findIndex((z) => z.id === zoneId);
  const tiles = s.board.tiles.filter((t) => t.zone === z && t.type === 'street').sort((a, b) => a.col - b.col);
  return tiles[Math.min(k, tiles.length - 1)];
};
const run = (s: GameState, seat: number, effects: Parameters<typeof runEffects>[3]) =>
  runEffects(pack, s, seat, effects, { source: 'test', fromAbility: true });

describe('new effect ops', () => {
  it('steal_charge moves charge from the target to the caster, capped by what they have', () => {
    const s = game();
    s.players[0].ult = 1;
    s.players[1].ult = 3;
    place(s, 1, zoneTile(s, 'chinatown', 3).id);
    run(s, 0, [{ op: 'steal_charge', target: { who: 'leader' }, n: 5 }]);
    expect(s.players[1].ult).toBe(0);
    expect(s.players[0].ult).toBe(4);
  });

  it('rewind sends the target back to where their turn started, never forward', () => {
    const s = game();
    const start = zoneTile(s, 'chinatown', 1).id;
    const later = zoneTile(s, 'chinatown', 5).id;
    s.players[1].pieces[0].turnStart = start;
    place(s, 1, later);
    run(s, 0, [{ op: 'rewind', target: { who: 'leader' } }]);
    expect(s.players[1].pieces[0].tile).toBe(start);
    // Already at (or behind) their turn start: nothing to undo.
    run(s, 0, [{ op: 'rewind', target: { who: 'leader' } }]);
    expect(s.players[1].pieces[0].tile).toBe(start);
  });

  it('hitch lands right behind the target without capturing anyone', () => {
    const s = game();
    const target = zoneTile(s, 'embarcadero', 3);
    place(s, 1, target.id);
    run(s, 2, [{ op: 'hitch', target: { who: 'leader' } }]);
    expect(target.prev).toContain(s.players[2].pieces[0].tile);
    expect(s.players[1].pieces[0].tile).toBe(target.id);
    expect(progress(s.board, s.players[2].pieces[0].tile)).toBeLessThan(progress(s.board, target.id));
  });

  it("mimic runs the target's ability as the caster, and copies can't copy", () => {
    const s = game();
    place(s, 1, zoneTile(s, 'chinatown', 4).id);
    s.players[1].pieces[0].turnStart = zoneTile(s, 'chinatown', 1).id;
    s.players[0].ult = 0;
    // Ada (3) forks the leader's ultimate. Karl (1) leads, so Ada vanishes into his Whiteout, not Karl.
    const before = progress(s.board, s.players[3].pieces[0].tile);
    const karlBefore = s.players[1].pieces[0].tile;
    run(s, 3, [{ op: 'mimic', target: { who: 'leader' }, slot: 'ultimate' }]);
    expect(s.players[1].pieces[0].tile).toBe(karlBefore);
    expect(progress(s.board, s.players[3].pieces[0].tile)).toBeGreaterThan(before);
    // A forked Fork fizzles instead of recursing.
    const n = s.events.length;
    runEffects(pack, s, 3, [{ op: 'mimic', target: { who: 'nearest' }, slot: 'active' }], { source: 'x', mimic: true } as never);
    expect(s.events.slice(n).some((e) => e.msg.includes('fizzles'))).toBe(true);
  });
});

describe('slopes', () => {
  it('shortens forward moves uphill, lengthens them downhill, and Grip ignores hills', () => {
    const s = game();
    const up = zoneTile(s, 'nobhill', 1).id;
    const down = zoneTile(s, 'lombard', 1).id;
    const len = (seat: number) => legalMoves(pack, s, seat, 3).filter((m) => m.dir === 'fwd')[0].path.length;
    place(s, 0, up);
    expect(len(0)).toBe(2);
    place(s, 0, down);
    expect(len(0)).toBe(4);
    place(s, 2, up); // Muni
    expect(len(2)).toBe(3);
    // Backward moves are unaffected.
    place(s, 0, up);
    expect(legalMoves(pack, s, 0, 3).filter((m) => m.dir === 'back').every((m) => m.path.length === 3)).toBe(true);
  });
});

describe('world events', () => {
  it('warns a round early, fires on schedule, and reschedules', () => {
    const s = game();
    const every = pack.rules.eventEvery!;
    expect(s.nextEvent?.round).toBe(every);
    while (s.round <= every && s.phase !== 'over') {
      const p = s.players[s.turn];
      p.skip = 0;
      step(pack, s, { type: 'roll' });
      if (s.phase === 'move') step(pack, s, { type: 'move', index: 0 });
    }
    const warn = s.events.findIndex((e) => e.kind === 'event_warning');
    const fire = s.events.findIndex((e) => e.kind === 'world_event');
    expect(warn).toBeGreaterThanOrEqual(0);
    expect(fire).toBeGreaterThan(warn);
    expect(s.nextEvent?.round).toBe(every * 2);
  });

  it('world targets ignore distance and have no caster', () => {
    const s = game();
    s.players.forEach((p, i) => place(s, i, zoneTile(s, 'chinatown', i * 2 + 1).id));
    runEffects(pack, s, WORLD, [{ op: 'shield', target: { who: 'everyone' }, charges: 1, turns: 2 }], { source: 'giveaway' });
    expect(s.players.every((p) => p.pieces[0].shield)).toBe(true);
    runEffects(pack, s, WORLD, [{ op: 'skip_turn', target: { who: 'leader' }, n: 1 }], { source: 'meltdown' });
    expect(s.players[3].skip).toBe(1);
    // Self-only ops are ignored rather than crashing.
    runEffects(pack, s, WORLD, [{ op: 'dash', n: 3 }], { source: 'x' });
  });

  it('a full game plays to the end at every player count', () => {
    for (const players of [2, 3, 4] as const) {
      const r = simulate(pack, { games: 20, players, seed: 3 });
      expect(r.rounds.every((n) => n < 80)).toBe(true);
    }
  });
});
