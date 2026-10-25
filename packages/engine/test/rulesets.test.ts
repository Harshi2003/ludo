import { describe, expect, it } from 'vitest';
import { magicPack } from '@ludo/themepack';
import { createGame, forwardBonus, legalMoves, progress, reigning, step, type GameState, type ThemePack } from '../src';

const withRules = (rules: Partial<ThemePack['rules']>): ThemePack => ({ ...magicPack, rules: { ...magicPack.rules, ...rules } });
const game = (pack: ThemePack, seed = 3) =>
  createGame(pack, { seed, players: ['inferno', 'terra', 'aqua', 'zephyr'].map((character) => ({ character, bot: true })) });
/** The `k`th plain tile of the single-file final zone, where every path is unambiguous. */
const along = (s: GameState, k: number) => {
  const funnel = magicPack.zones.findIndex((z) => z.type === 'funnel');
  return s.board.tiles.filter((t) => t.zone === funnel && t.type === 'path').sort((a, b) => a.col - b.col)[k].id;
};

describe('rule variants', () => {
  it('forward movement never offers backward moves and skips the storm', () => {
    const pack = withRules({ movement: 'forward' });
    const s = game(pack);
    s.players[0].pieces[0].tile = along(s, 1);
    expect(legalMoves(pack, s, 0, 3).every((m) => m.dir === 'fwd')).toBe(true);
    for (let i = 0; i < 4000 && s.phase !== 'over'; i++) step(pack, s, s.phase === 'roll' ? { type: 'roll' } : { type: 'move', index: 0 });
    expect(s.events.some((e) => e.kind === 'storm')).toBe(false);
  });

  it('tow knocks the victim back and steals charge; stun leaves them in place but costs a turn', () => {
    for (const mode of ['tow', 'stun'] as const) {
      const pack = withRules({ capture: { mode, back: 4, steal: 2 } });
      const s = game(pack);
      s.players[0].pieces[0].tile = along(s, 0);
      const at = legalMoves(pack, s, 0, 3).find((m) => m.piece === 0 && m.dir === 'fwd' && !s.board.tiles[m.to].finish)!.to;
      s.players[1].pieces[0].tile = at;
      s.players[1].ult = 3;
      s.players[1].pieces[0].shield = null;
      s.phase = 'move';
      s.moves = legalMoves(pack, s, 0, 3).filter((m) => m.piece === 0 && m.to === at);
      expect(s.moves.length).toBeGreaterThan(0);
      step(pack, s, { type: 'move', index: 0 });
      const v = s.players[1];
      // 3 - 2 stolen, + charge for being captured, + their own turn-start charge (it is their turn next).
      expect(v.ult).toBe(1 + pack.rules.ultimateCharge.captured + pack.rules.ultimateCharge.turn);
      if (mode === 'tow') expect(progress(s.board, v.pieces[0].tile)).toBeLessThan(progress(s.board, at));
      else {
        expect(v.pieces[0].tile).toBe(at);
        expect(s.events.some((e) => e.kind === 'skip' && e.seat === 1) || v.skip === 1).toBe(true);
      }
    }
  });

  it('pick2 offers moves for both dice and tags each with its die', () => {
    const pack = withRules({ dice: 'pick2' });
    const s = game(pack, 11);
    step(pack, s, { type: 'roll' });
    expect(s.dice).toHaveLength(2);
    expect(s.events.at(-1)!.msg).toMatch(/rolled \d.* and \d/);
    if (s.phase === 'move') {
      const dice = new Set(s.moves.map((m) => m.die));
      expect([...dice].every((d) => s.dice!.includes(d!))).toBe(true);
    }
  });

  it('tides rotate on schedule and boost only the reigning element', () => {
    const pack = withRules({ tides: { every: 2, elements: ['fire', 'water'], bonus: 1, name: 'Tide' } });
    const s = game(pack);
    expect(reigning(pack, s)).toBe('fire');
    expect(forwardBonus(pack, s, 0)).toBe(1);
    expect(forwardBonus(pack, s, 1)).toBe(0);
    s.round = 3;
    expect(reigning(pack, s)).toBe('water');
    expect(s.events.some((e) => e.kind === 'tide')).toBe(true);
  });
});
