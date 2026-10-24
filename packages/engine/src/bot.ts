import { distance, progress } from './graph';
import { rand } from './rng';
import { canUseAbility, tileDef } from './rules';
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
    if (canUseAbility(pack, state, 'active') && (style !== 'easy' || rand(state) < 0.5)) {
      return { type: 'ability', which: 'active' };
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
  if (b.tiles[m.to].finish) return 1e6;

  let s = (progress(b, m.to) - progress(b, me.tile)) * 4;
  for (const v of m.captures) s += w.capture + progress(b, state.players[v].tile) * 0.5;

  const def = tileDef(pack, state, m.to);
  if (def?.base === 'sanctuary') s += 8;
  else if (def?.base === 'portal' && b.tiles[m.to].pair !== undefined && !state.portalCd[m.to]) {
    s += (progress(b, b.tiles[m.to].pair!) - progress(b, m.to)) * 3;
  } else if (def?.category === 'helpful' && m.dir === 'fwd') s += 12;
  else if (def?.category === 'harmful') s -= 15;

  if (state.traps.some((t) => t.tile === m.to && t.owner !== me.seat)) s -= 14;

  if (def?.base !== 'sanctuary') {
    for (const q of state.players) {
      if (q.seat === me.seat || m.captures.includes(q.seat)) continue;
      if (distance(b, q.tile, m.to, 6) <= 6) s -= w.danger;
    }
  }
  return s + rand(state) * w.noise;
}
