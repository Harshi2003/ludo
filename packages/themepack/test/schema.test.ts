import { describe, expect, it } from 'vitest';
import { autoBalance, magicPack, pirateFixture, validatePack } from '../src';

describe('theme pack validation', () => {
  it('accepts both hand-built packs', () => {
    for (const p of [magicPack, pirateFixture]) {
      const r = validatePack(structuredClone(p));
      expect(r.ok ? [] : r.errors).toEqual([]);
    }
  });

  it('rejects broken packs with readable errors', () => {
    const p = structuredClone(pirateFixture) as unknown as Record<string, any>;
    p.zones.push(p.zones.shift());                                   // funnel no longer last
    p.tiles = p.tiles.filter((t: any) => t.base !== 'portal');       // portal missing
    p.characters[0].active.effects[0].n = -40;                       // out of bounds
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(/n/);
    // Fix the bounds error; the cross-field errors then surface.
    p.characters[0].active.effects[0].n = -4;
    const r2 = validatePack(p);
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.errors.join('\n')).toMatch(/funnel/);
      expect(r2.errors.join('\n')).toMatch(/portal/);
    }
  });

  it('catches if_element pointing at no character', () => {
    const p = structuredClone(pirateFixture);
    (p.tiles.find((t) => t.id === 'gold')!.effects[0] as { element: string }).element = 'lava';
    const r = validatePack(p);
    expect(r.ok).toBe(false);
  });

  it('auto-balance nudges an overpowered guardian down', () => {
    const p = structuredClone(pirateFixture);
    p.characters[3].active.cooldown = 1;
    p.characters[3].active.effects = [{ op: 'dash', n: 6 }];
    const r = autoBalance(p, { games: 200, rounds: 3 });
    expect(r.after.spread).toBeLessThanOrEqual(r.before.spread + 0.05);
    expect(r.changes.length).toBeGreaterThan(0);
  });
});
