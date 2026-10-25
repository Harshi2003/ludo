import type { Category } from './prompts';
export type TileKind = Category | 'drink' | 'everyone' | 'lucky' | 'trap' | 'safe';
export type PenaltyKind = 'back' | 'sip' | 'skip-turn' | 'swap';
export interface PartyConfig {
  rounds: number;
  tileWeights: Record<TileKind, number>;
  penaltyWeights: Record<PenaltyKind, number>;
  backwardMin: number;
  backwardMax: number;
  trapBackwardSteps: number;
  trapSkipChance: number;
  luckyForwardSteps: number;
}
export const DEFAULT_PARTY_CONFIG: PartyConfig = {
  rounds: 6,
  tileWeights: { drink: 12, everyone: 8, truth: 10, dare: 10, likely: 10, never: 8, rather: 8, lucky: 12, trap: 12, safe: 10 },
  penaltyWeights: { back: 45, sip: 25, 'skip-turn': 20, swap: 10 },
  backwardMin: 1, backwardMax: 3, trapBackwardSteps: 2, trapSkipChance: 0.5, luckyForwardSteps: 2,
};
export function validateConfig(c: PartyConfig) {
  for (const key of ['tileWeights', 'penaltyWeights'] as const) {
    const actual = Object.keys(c[key]).sort().join(',');
    const expected = Object.keys(DEFAULT_PARTY_CONFIG[key]).sort().join(',');
    if (actual !== expected) throw new Error('Configuration must specify every known tile or penalty weight.');
  }
  for (const weights of [c.tileWeights, c.penaltyWeights]) {
    if (Object.values(weights).some(w => !Number.isFinite(w) || w < 0) || Object.values(weights).reduce((a, b) => a + b, 0) <= 0) throw new Error('Weights must be finite, non-negative, and have a positive total.');
  }
  for (const n of [c.rounds, c.backwardMin, c.backwardMax, c.trapBackwardSteps, c.luckyForwardSteps]) if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error('Round and movement values must be integers from 1 to 100.');
  if (c.backwardMin > c.backwardMax || !Number.isFinite(c.trapSkipChance) || c.trapSkipChance < 0 || c.trapSkipChance > 1) throw new Error('Invalid backward range or trap chance.');
}
