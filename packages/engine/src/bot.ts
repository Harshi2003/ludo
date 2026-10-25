import { distance, progress } from './graph';
import { rand } from './rng';
import { bondmates, canUseAbility, isBond, piecesAt, tileDef } from './rules';
import type { Action, GameState, MoveOption, ThemePack } from './types';

export type BotStyle = 'easy' | 'normal' | 'aggressive';

const WEIGHTS: Record<BotStyle, { capture: number; danger: number; noise: number }> = {
  easy: { capture: 30, danger: 2, noise: 14 },
  normal: { capture: 60, danger: 6, noise: 2 },
  aggressive: { capture: 110, danger: 3, noise: 2 },
};

export function botAction(pack: ThemePack, state: GameState, style: BotStyle = 'normal'): Action {
  if (state.phase === 'roll') {
    if (canUseAbility(pack, state, 'ultimate')) return { type: 'ability', which: 'ultimate' };
    const p = state.players[state.turn];
    // Prefer casting from a bond: the whole bond fires together.
    const ready = p.pieces.map((_, i) => i).filter((i) => canUseAbility(pack, state, 'active', i))
      .sort((a, b) => bondmates(state, p.seat, b).length - bondmates(state, p.seat, a).length);
    if (ready.length && (style !== 'easy' || rand(state) < 0.5)) {
      return { type: 'ability', which: 'active', piece: ready[0] };
    }
    return { type: 'roll' };
  }
  const scored = state.moves.map((m, index) => ({ index, s: scoreMove(pack, state, m, style) }));
  scored.sort((a, b) => b.s - a.s);
  return { type: 'move', index: scored[0].index };
}

export function scoreMove(pack: ThemePack, state: GameState, m: MoveOption, style: BotStyle): number {
  const w = WEIGHTS[style];
  const b = state.board;
  const me = state.players[state.turn];
  const from = me.pieces[m.piece].tile;
  if (b.tiles[m.to].finish) return 1e6;

  const marching = pack.rules.bondMarch && isBond(state, me.seat, from) ? me.pieces.filter((q) => q.tile === from).length : 1;
  let s = (progress(b, m.to) - progress(b, from)) * 4 * marching;
  for (const v of piecesAt(state, m.to)) if (m.captures.includes(v.seat)) s += w.capture + progress(b, m.to) * 0.5;

  const def = tileDef(pack, state, m.to);
  if (def?.base === 'sanctuary') s += 8;
  else if (def?.base === 'portal' && b.tiles[m.to].pair !== undefined && !state.portalCd[m.to]) {
    s += (progress(b, b.tiles[m.to].pair!) - progress(b, m.to)) * 3;
  } else if (def?.category === 'helpful' && m.dir === 'fwd') s += 12;
  else if (def?.category === 'harmful') s -= 15;

  if (state.traps.some((t) => t.tile === m.to && t.owner !== me.seat)) s -= 14;

  // Squads: joining a squadmate makes a bond nobody can land on; breaking one gives that up.
  const mates = me.pieces.filter((q, i) => i !== m.piece && q.tile === m.to).length;
  if (mates && m.to !== b.starts[me.seat]) s += 10;
  if (isBond(state, me.seat, from) && marching === 1) s -= 4;

  if (def?.base !== 'sanctuary' && !mates) {
    // Dying sends a piece home, so the further it has come the more a nearby rival matters.
    const stake = 1 + progress(b, m.to) / 40;
    for (const q of state.players) {
      if (q.seat === me.seat || m.captures.includes(q.seat)) continue;
      for (const x of q.pieces) if (distance(b, x.tile, m.to, 6) <= 6) s -= w.danger * stake;
    }
  }
  return s + rand(state) * w.noise;
}
