import { mean, simulate, type PlayerCount, type SimResult, type ThemePack } from '@ludo/engine';
import { scaleCharacterPower } from './power';

export interface BalanceSummary {
  games: number;
  rounds: number;
  captures: number;
  winRates: Record<string, number>;
  seatRates: number[];
  spread: number;
}

export interface AutoBalanceResult {
  pack: ThemePack;
  before: BalanceSummary;
  after: BalanceSummary;
  changes: string[];
}

function summarize(rs: SimResult[]): BalanceSummary {
  const wins: Record<string, number> = {};
  const played: Record<string, number> = {};
  for (const r of rs) {
    for (const [c, g] of Object.entries(r.gamesByCharacter)) {
      played[c] = (played[c] ?? 0) + g;
      wins[c] = (wins[c] ?? 0) + (r.winsByCharacter[c] ?? 0);
    }
  }
  const winRates = Object.fromEntries(Object.keys(played).map((c) => [c, wins[c] / played[c]]));
  const rates = Object.values(winRates);
  const games = rs.reduce((a, r) => a + r.games, 0);
  const seats = rs[0].winsBySeat.map((_, i) => rs.reduce((a, r) => a + r.winsBySeat[i], 0) / games);
  return {
    games,
    rounds: mean(rs.flatMap((r) => r.rounds)),
    captures: mean(rs.flatMap((r) => r.captures)),
    winRates,
    seatRates: seats,
    spread: Math.max(...rates) - Math.min(...rates),
  };
}

interface Knobs {
  cooldown: number;
  cost: number;
  power: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

function apply(input: ThemePack, knobs: Record<string, Knobs>): ThemePack {
  const p = structuredClone(input);
  for (const c of p.characters) {
    const k = knobs[c.id];
    c.active.cooldown = k.cooldown;
    c.ultimate.cost = k.cost;
    scaleCharacterPower(c, k.power);
  }
  return p;
}

/**
 * Plays bot games and tunes each guardian's three knobs (ability power,
 * cooldown, ultimate cost) toward a fair share. Rounds replay the same seeds so
 * differences come from tuning, not dice; the best set found is kept, and the
 * reported result is re-measured on fresh seeds.
 */
export function autoBalance(input: ThemePack, o: { players?: PlayerCount; games?: number; rounds?: number; seed?: number } = {}): AutoBalanceResult {
  const players = o.players ?? 4;
  const games = o.games ?? 300;
  const seed = o.seed ?? 1;
  const fair = 1 / players;
  const measure = (p: ThemePack, s: number) =>
    summarize([simulate(p, { games: Math.ceil(games / 2), players, seed: s }), simulate(p, { games: Math.ceil(games / 2), players, seed: s + 1 })]);

  const start: Record<string, Knobs> = Object.fromEntries(
    input.characters.map((c) => [c.id, { cooldown: c.active.cooldown ?? 3, cost: c.ultimate.cost ?? 8, power: 100 }]),
  );
  const before = measure(input, seed);
  let best = { knobs: structuredClone(start), sum: before };
  let knobs = structuredClone(start);
  let sum = before;

  for (let i = 0; i < (o.rounds ?? 6) && best.sum.spread > 0.08; i++) {
    for (const c of input.characters) {
      const gap = (sum.winRates[c.id] ?? fair) - fair;
      if (Math.abs(gap) < 0.03) continue;
      const k = knobs[c.id];
      const dir = Math.sign(gap); // + means too strong
      // Power moves most; cooldown and cost follow when far off.
      k.power = clamp(k.power - dir * Math.min(25, Math.round(Math.abs(gap) * 150)), 50, 150);
      if (Math.abs(gap) > 0.06) k.cost = clamp(k.cost + dir, 4, 14);
      if (Math.abs(gap) > 0.1) k.cooldown = clamp(k.cooldown + dir, 1, 8);
    }
    sum = measure(apply(input, knobs), seed);
    if (sum.spread < best.sum.spread) best = { knobs: structuredClone(knobs), sum };
  }

  const pack = apply(input, best.knobs);
  const changes = input.characters.flatMap((c) => {
    const a = start[c.id];
    const b = best.knobs[c.id];
    const parts: string[] = [];
    if (b.power !== 100) parts.push(`abilities ${b.power > 100 ? 'strengthened' : 'weakened'} to ${b.power}%`);
    if (b.cooldown !== a.cooldown) parts.push(`${c.active.name} cooldown ${a.cooldown} → ${b.cooldown}`);
    if (b.cost !== a.cost) parts.push(`${c.ultimate.name} charge ${a.cost} → ${b.cost}`);
    return parts.length ? [`${c.name}: ${parts.join(', ')}`] : [];
  });
  // Report on fresh seeds so the numbers aren't flattered by the tuning seeds.
  const after = changes.length ? measure(pack, seed + 1000) : before;
  return { pack, before, after, changes };
}
