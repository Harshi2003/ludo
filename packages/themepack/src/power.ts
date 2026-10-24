import type { CharacterDef, Effect } from '@ludo/engine';

/** Scales effect magnitudes (tiles moved, turns skipped, ranges) by pct; keeps sign, never below 1. */
export function scaleEffects(effects: Effect[], pct: number): Effect[] {
  const k = pct / 100;
  const s = (n: number) => Math.sign(n) * Math.max(1, Math.round(Math.abs(n) * k));
  return effects.map((e) => {
    const out = structuredClone(e) as Effect & { n?: number; target?: { range?: number } };
    if (typeof out.n === 'number') out.n = s(out.n);
    if (out.target?.range) out.target.range = s(out.target.range);
    if (out.op === 'teleport' && out.range) out.range = s(out.range);
    if (out.op === 'if_element') {
      out.then = scaleEffects(out.then, pct);
      out.else = scaleEffects(out.else, pct);
    }
    if (out.op === 'random') out.options = out.options.map((o) => scaleEffects(o, pct));
    if (out.op === 'place_trap') out.effects = scaleEffects(out.effects, pct);
    return out;
  });
}

/** Scales a character's active and ultimate (effects and "requires" range) in place. */
export function scaleCharacterPower(c: CharacterDef, pct: number) {
  if (pct === 100) return;
  for (const a of [c.active, c.ultimate]) {
    a.effects = scaleEffects(a.effects, pct);
    if (a.requires?.range) a.requires.range = Math.max(1, Math.round((a.requires.range * pct) / 100));
  }
}
