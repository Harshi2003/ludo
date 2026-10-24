import type { PlayerCount } from './boardgen';
import { botAction, type BotStyle } from './bot';
import { shuffle } from './rng';
import { createGame, step } from './rules';
import type { ThemePack } from './types';

export interface SimOptions {
  games: number;
  players: PlayerCount;
  seed?: number;
  style?: BotStyle;
  onProgress?: (done: number) => void;
}

export interface SimResult {
  games: number;
  players: number;
  winsBySeat: number[];
  winsByCharacter: Record<string, number>;
  gamesByCharacter: Record<string, number>;
  rounds: number[];
  captures: number[];
  roundCapHits: number;
  /** How often each tile type / ability / passive fired. */
  sources: Record<string, number>;
  boardTiles: number;
}

export function simulate(pack: ThemePack, o: SimOptions): SimResult {
  const r: SimResult = {
    games: o.games, players: o.players, winsBySeat: new Array(o.players).fill(0),
    winsByCharacter: {}, gamesByCharacter: {}, rounds: [], captures: [], roundCapHits: 0, sources: {}, boardTiles: 0,
  };
  const ids = pack.characters.map((c) => c.id);
  const rng = { rng: o.seed ?? 12345 };

  for (let g = 0; g < o.games; g++) {
    const chars = shuffle(rng, ids.slice()).slice(0, o.players);
    const state = createGame(pack, {
      seed: (o.seed ?? 12345) * 7919 + g * 104729,
      players: chars.map((character) => ({ character, bot: true })),
    });
    r.boardTiles += state.board.tiles.length / o.games;
    for (let i = 0; i < 20000 && state.phase !== 'over'; i++) step(pack, state, botAction(pack, state, o.style));

    for (const c of chars) r.gamesByCharacter[c] = (r.gamesByCharacter[c] ?? 0) + 1;
    if (state.winner !== null) {
      r.winsBySeat[state.winner]++;
      const c = state.players[state.winner].character;
      r.winsByCharacter[c] = (r.winsByCharacter[c] ?? 0) + 1;
    }
    let caps = 0;
    for (const e of state.events) {
      if (e.kind === 'capture') caps++;
      if (e.source && (e.kind === 'tile' || e.kind === 'ability' || e.kind === 'ultimate' || e.kind === 'passive' || e.kind === 'trap')) {
        r.sources[e.source] = (r.sources[e.source] ?? 0) + 1;
      }
      if (e.kind === 'win' && e.msg.includes('round limit')) r.roundCapHits++;
    }
    r.captures.push(caps);
    r.rounds.push(state.round);
    o.onProgress?.(g + 1);
  }
  return r;
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export interface BalanceWarning {
  level: 'warn' | 'bad';
  msg: string;
}

/** Targets from the design doc: fair seats, fair characters, enough kills, bounded length. */
export function balanceReport(r: SimResult): BalanceWarning[] {
  const out: BalanceWarning[] = [];
  const fair = 1 / r.players;
  const tol = r.players === 2 ? 0.08 : 0.06;
  r.winsBySeat.forEach((w, s) => {
    const rate = w / r.games;
    if (Math.abs(rate - fair) > tol) out.push({ level: Math.abs(rate - fair) > tol * 2 ? 'bad' : 'warn', msg: `Seat ${s + 1} wins ${(rate * 100).toFixed(0)}% (fair is ${(fair * 100).toFixed(0)}%)` });
  });
  for (const [c, games] of Object.entries(r.gamesByCharacter)) {
    const rate = (r.winsByCharacter[c] ?? 0) / games;
    if (games > 30 && Math.abs(rate - fair) > tol) out.push({ level: Math.abs(rate - fair) > tol * 2 ? 'bad' : 'warn', msg: `${c} wins ${(rate * 100).toFixed(0)}% of games played` });
  }
  const minCaps = { 2: 2, 3: 4, 4: 6 }[r.players] ?? 4;
  const caps = mean(r.captures);
  if (caps < minCaps) out.push({ level: 'warn', msg: `Only ${caps.toFixed(1)} captures per game (target ${minCaps}+)` });
  const rounds = mean(r.rounds);
  if (rounds > 40) out.push({ level: 'warn', msg: `Games average ${rounds.toFixed(0)} rounds (target under 40)` });
  if (r.roundCapHits) out.push({ level: 'bad', msg: `${r.roundCapHits} games hit the round cap` });
  return out;
}
