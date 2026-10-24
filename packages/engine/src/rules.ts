import { generateBoard, type PlayerCount } from './boardgen';
import { distance, enumeratePaths, forcedPath, progress } from './graph';
import { pick, randInt } from './rng';
import type {
  AbilityDef, Action, Board, CharacterDef, Effect, GameEvent, GameState, MoveOption,
  PlayerState, TargetSpec, ThemePack, TileTypeDef,
} from './types';

export const ROUND_CAP = 80;
const PORTAL_COOLDOWN = 2;
const MAX_EXTRA_ROLLS = 2;
const PERMANENT = 999;

export interface NewGameOptions {
  seed: number;
  players: { character: string; bot?: boolean }[];
  board?: Board;
}

export function createGame(pack: ThemePack, opts: NewGameOptions): GameState {
  const n = opts.players.length as PlayerCount;
  const board = opts.board ?? generateBoard({ players: n, seed: opts.seed, zones: pack.zones, tiles: pack.tiles });
  const state: GameState = {
    packId: pack.id,
    board,
    players: opts.players.map((p, seat) => {
      const c = character(pack, p.character);
      return {
        seat, character: c.id, bot: !!p.bot,
        tile: board.starts[seat], checkpoint: board.starts[seat],
        ult: 0, cooldown: 0,
        shield: c.passive.startShield ? { charges: c.passive.startShield, turns: PERMANENT } : null,
        skip: 0, dice: null, captures: 0, timesCaptured: 0,
      };
    }),
    turn: 0, round: 1, phase: 'roll', roll: null, rawRoll: null, moves: [],
    usedAbility: false, extraRolls: 0, traps: [], blocks: [], portalCd: {},
    rng: opts.seed >>> 0 || 1, events: [], winner: null, storm: false, bonusRoll: false,
  };
  startTurn(pack, state, true);
  return state;
}

// ─── Lookups ───────────────────────────────────────────────────────────────

export function character(pack: ThemePack, id: string): CharacterDef {
  const c = pack.characters.find((c) => c.id === id);
  if (!c) throw new Error(`Unknown character ${id}`);
  return c;
}

export function tileDef(pack: ThemePack, state: GameState, tile: number): TileTypeDef | undefined {
  return pack.tiles.find((d) => d.id === state.board.tiles[tile].type);
}

const nameOf = (pack: ThemePack, s: GameState, seat: number) => character(pack, s.players[seat].character).name;

function emit(state: GameState, e: GameEvent) {
  state.events.push(e);
}

export function blockedFor(state: GameState, seat: number): Set<number> {
  const out = new Set<number>();
  for (const b of state.blocks) if (b.owner !== seat) b.tiles.forEach((t) => out.add(t));
  return out;
}

function isSanctuary(pack: ThemePack, state: GameState, tile: number) {
  return tileDef(pack, state, tile)?.base === 'sanctuary';
}

// ─── Turn flow ─────────────────────────────────────────────────────────────

function startTurn(pack: ThemePack, state: GameState, first = false) {
  for (let guard = 0; guard < 64; guard++) {
    if (!first) advanceSeat(pack, state);
    first = false;
    if (state.phase === 'over') return;

    const p = state.players[state.turn];
    const c = character(pack, p.character);
    p.cooldown = Math.max(0, p.cooldown - 1);
    if (p.shield && --p.shield.turns <= 0) p.shield = null;
    if (p.dice && --p.dice.turns <= 0) p.dice = null;
    state.traps = state.traps.filter((t) => t.owner !== p.seat || --t.turns > 0);
    state.blocks = state.blocks.filter((b) => b.owner !== p.seat || --b.turns > 0);
    if (state.round > 1 || p.seat > 0) chargeUlt(pack, p, pack.rules.ultimateCharge.turn);
    runTriggers(pack, state, p.seat, 'turn_start', {});

    if (p.skip > 0) {
      p.skip--;
      emit(state, { kind: 'skip', seat: p.seat, msg: `${c.name} is stunned and loses a turn` });
      continue;
    }
    Object.assign(state, { phase: 'roll', roll: null, rawRoll: null, moves: [], usedAbility: false, extraRolls: 0, bonusRoll: false });
    emit(state, { kind: 'turn', seat: p.seat, msg: `${c.name}'s turn` });
    return;
  }
}

function advanceSeat(pack: ThemePack, state: GameState) {
  state.turn = (state.turn + 1) % state.players.length;
  if (state.turn !== 0) return;
  state.round++;
  for (const k of Object.keys(state.portalCd)) {
    if (--state.portalCd[+k] <= 0) delete state.portalCd[+k];
  }
  const stormAt = pack.rules.stormRound[state.players.length as PlayerCount];
  if (!state.storm && state.round >= stormAt) {
    state.storm = true;
    emit(state, { kind: 'storm', seat: -1, msg: `${pack.rules.stormName}! Backward moves are no longer possible.` });
  }
  if (state.round > ROUND_CAP) {
    const leader = [...state.players].sort((a, b) => progress(state.board, b.tile) - progress(state.board, a.tile))[0];
    win(pack, state, leader.seat, 'reached the round limit in the lead');
  }
}

function win(pack: ThemePack, state: GameState, seat: number, how = `reached the ${pack.world.finish}`) {
  state.winner = seat;
  state.phase = 'over';
  emit(state, { kind: 'win', seat, msg: `${nameOf(pack, state, seat)} ${how}!` });
}

function endMove(pack: ThemePack, state: GameState) {
  if (state.phase === 'over') return;
  const p = state.players[state.turn];
  const six = pack.rules.extraRollOnSix && state.rawRoll === 6 && state.extraRolls < MAX_EXTRA_ROLLS;
  if ((state.bonusRoll || six) && p.skip === 0) {
    state.extraRolls++;
    Object.assign(state, { phase: 'roll', roll: null, rawRoll: null, moves: [], bonusRoll: false });
    emit(state, { kind: 'roll', seat: p.seat, msg: `${nameOf(pack, state, p.seat)} rolls again!` });
    return;
  }
  startTurn(pack, state);
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Applies an action in place. Clone first if you need the previous state. */
export function step(pack: ThemePack, state: GameState, action: Action): GameState {
  if (state.phase === 'over') return state;
  const p = state.players[state.turn];

  if (action.type === 'roll') {
    if (state.phase !== 'roll') throw new Error('Not time to roll');
    const raw = 1 + randInt(state, 6);
    let n = raw;
    if (p.dice?.mode === 'halve') n = Math.ceil(n / 2);
    if (p.dice?.mode === 'max3') n = Math.min(n, 3);
    if (p.dice?.mode === 'plus1') n = n + 1;
    n = Math.max(n, character(pack, p.character).passive.diceFloor ?? 0);
    state.rawRoll = raw;
    state.roll = n;
    state.moves = legalMoves(pack, state, p.seat, n);
    emit(state, { kind: 'roll', seat: p.seat, value: n, msg: `${nameOf(pack, state, p.seat)} rolled ${raw}${n !== raw ? ` (counts as ${n})` : ''}` });
    if (!state.moves.length) {
      emit(state, { kind: 'no_moves', seat: p.seat, msg: 'No path is open' });
      endMove(pack, state);
    } else state.phase = 'move';
    return state;
  }

  if (action.type === 'move') {
    if (state.phase !== 'move') throw new Error('Not time to move');
    const opt = state.moves[action.index];
    if (!opt) throw new Error('Bad move index');
    travel(pack, state, p, opt.path, opt.dir);
    emit(state, { kind: 'move', seat: p.seat, path: opt.path, tile: opt.to, msg: `${nameOf(pack, state, p.seat)} moves ${opt.path.length} ${opt.dir === 'back' ? 'back' : ''}`.trim() });
    land(pack, state, p.seat, opt.to, { dir: opt.dir, capture: true, tileEffects: true });
    endMove(pack, state);
    return state;
  }

  if (action.type === 'ability') {
    if (!canUseAbility(pack, state, action.which)) throw new Error('Ability not ready');
    const c = character(pack, p.character);
    const def = action.which === 'active' ? c.active : c.ultimate;
    state.usedAbility = true;
    if (action.which === 'active') p.cooldown = (def.cooldown ?? 3) + 1;
    else p.ult = 0;
    emit(state, { kind: action.which === 'active' ? 'ability' : 'ultimate', seat: p.seat, source: def.id, msg: `${c.name} casts ${def.name}!` });
    runEffects(pack, state, p.seat, def.effects, { source: def.id, fromAbility: true });
    if ((state.phase as string) !== 'over' && p.skip > 0) startTurn(pack, state);
    return state;
  }
  return state;
}

export function legalMoves(pack: ThemePack, state: GameState, seat: number, n: number): MoveOption[] {
  const p = state.players[seat];
  const blocked = blockedFor(state, seat);
  const dirs: ('fwd' | 'back')[] = state.storm ? ['fwd'] : ['fwd', 'back'];
  return dirs.flatMap((dir) =>
    enumeratePaths(state.board, p.tile, n, dir, blocked).map((path) => {
      const to = path[path.length - 1];
      const captures = isSanctuary(pack, state, to) || state.board.tiles[to].finish
        ? []
        : state.players.filter((q) => q.seat !== seat && q.tile === to).map((q) => q.seat);
      return { dir, path, to, captures };
    }),
  );
}

export function abilityDef(pack: ThemePack, state: GameState, which: 'active' | 'ultimate', seat = state.turn): AbilityDef {
  const c = character(pack, state.players[seat].character);
  return which === 'active' ? c.active : c.ultimate;
}

export function canUseAbility(pack: ThemePack, state: GameState, which: 'active' | 'ultimate'): boolean {
  if (state.phase !== 'roll' || state.usedAbility) return false;
  const p = state.players[state.turn];
  const def = abilityDef(pack, state, which);
  if (which === 'active' && p.cooldown > 0) return false;
  if (which === 'ultimate' && p.ult < (def.cost ?? 8)) return false;
  return !def.requires || resolveTargets(state, p.seat, def.requires, {}).length > 0;
}

// ─── Movement & landing ──────────────────────────────────────────────────

function travel(pack: ThemePack, state: GameState, p: PlayerState, path: number[], dir: 'fwd' | 'back') {
  if (dir === 'fwd') {
    for (const t of path) {
      const tile = state.board.tiles[t];
      if (tile.checkpoint && progress(state.board, t) > progress(state.board, p.checkpoint)) {
        p.checkpoint = t;
        emit(state, { kind: 'checkpoint', seat: p.seat, tile: t, msg: `${nameOf(pack, state, p.seat)} reached a checkpoint` });
      }
    }
  }
  if (path.length) p.tile = path[path.length - 1];
}

interface LandOpts { dir: 'fwd' | 'back'; capture: boolean; tileEffects: boolean }

function land(pack: ThemePack, state: GameState, seat: number, tile: number, o: LandOpts) {
  const p = state.players[seat];
  p.tile = tile;
  if (state.board.tiles[tile].finish) return win(pack, state, seat);

  if (o.capture && !isSanctuary(pack, state, tile)) {
    for (const q of state.players) {
      if (q.seat === seat || q.tile !== tile) continue;
      if (q.shield) {
        if (--q.shield.charges <= 0) q.shield = null;
        emit(state, { kind: 'blocked_capture', seat, targets: [q.seat], tile, msg: `${nameOf(pack, state, q.seat)}'s shield absorbs the attack` });
        continue;
      }
      capture(pack, state, seat, q.seat, tile);
    }
  }

  const trapIdx = state.traps.findIndex((t) => t.tile === tile && t.owner !== seat);
  if (trapIdx >= 0) {
    const trap = state.traps.splice(trapIdx, 1)[0];
    emit(state, { kind: 'trap', seat: trap.owner, targets: [seat], tile, source: trap.source, msg: `${nameOf(pack, state, seat)} triggers ${nameOf(pack, state, trap.owner)}'s trap` });
    runEffects(pack, state, seat, trap.effects, { source: trap.source, tile });
  }

  if (o.tileEffects && state.phase !== 'over') {
    const def = tileDef(pack, state, tile);
    if (def && def.effects.length && !(def.category === 'helpful' && o.dir === 'back')) {
      emit(state, { kind: 'tile', seat, tile, source: def.id, msg: `${def.name}: ${def.description}` });
      runEffects(pack, state, seat, def.effects, { source: def.id, tile });
    }
  }
}

function capture(pack: ThemePack, state: GameState, by: number, victim: number, tile: number) {
  const a = state.players[by];
  const v = state.players[victim];
  v.tile = v.checkpoint;
  a.captures++;
  v.timesCaptured++;
  chargeUlt(pack, a, pack.rules.ultimateCharge.capture);
  chargeUlt(pack, v, pack.rules.ultimateCharge.captured);
  emit(state, { kind: 'capture', seat: by, targets: [victim], tile, to: v.tile, msg: `${nameOf(pack, state, by)} captures ${nameOf(pack, state, victim)}!` });
  runTriggers(pack, state, by, 'capture', { captured: victim });
  runTriggers(pack, state, victim, 'captured', {});
}

function chargeUlt(pack: ThemePack, p: PlayerState, n: number) {
  const cost = character(pack, p.character).ultimate.cost ?? 8;
  p.ult = Math.min(cost, p.ult + n);
}

function runTriggers(pack: ThemePack, state: GameState, seat: number, on: 'capture' | 'captured' | 'turn_start', ctx: Partial<Ctx>) {
  const passive = character(pack, state.players[seat].character).passive;
  for (const t of passive.triggers ?? []) {
    if (t.on !== on) continue;
    emit(state, { kind: 'passive', seat, source: passive.id, msg: `${passive.name} activates` });
    runEffects(pack, state, seat, t.effects, { ...ctx, source: passive.id });
  }
}

// ─── Effects ───────────────────────────────────────────────────────────────

interface Ctx {
  source: string;
  tile?: number;
  captured?: number;
  fromAbility?: boolean;
}

export function resolveTargets(state: GameState, seat: number, spec: TargetSpec, ctx: Partial<Ctx>): number[] {
  const me = state.players[seat];
  if (spec.who === 'self') return [seat];
  if (spec.who === 'captured') return ctx.captured !== undefined ? [ctx.captured] : [];
  const b = state.board;
  const range = spec.range ?? Infinity;
  const opps = state.players
    .filter((q) => q.seat !== seat)
    .map((q) => ({ seat: q.seat, d: distance(b, me.tile, q.tile, range), prog: progress(b, q.tile) }))
    .filter((o) => o.d <= range);
  const mine = progress(b, me.tile);
  if (spec.side) opps.splice(0, opps.length, ...opps.filter((o) => (spec.side === 'ahead' ? o.prog > mine : o.prog < mine)));
  switch (spec.who) {
    case 'nearest':
      return opps.sort((a, c) => a.d - c.d || c.prog - a.prog).slice(0, 1).map((o) => o.seat);
    case 'leader':
      return opps.sort((a, c) => c.prog - a.prog).slice(0, 1).map((o) => o.seat);
    case 'all':
      return opps.map((o) => o.seat);
    case 'ahead':
      return opps.filter((o) => o.prog > mine).map((o) => o.seat);
    case 'behind':
      return opps.filter((o) => o.prog < mine).map((o) => o.seat);
    case 'random':
      return opps.length ? [pick(state, opps).seat] : [];
  }
}

export function runEffects(pack: ThemePack, state: GameState, seat: number, effects: Effect[], ctx: Ctx) {
  for (const e of effects) {
    if (state.phase === 'over') return;
    runEffect(pack, state, seat, e, ctx);
  }
}

function runEffect(pack: ThemePack, state: GameState, seat: number, e: Effect, ctx: Ctx) {
  const b = state.board;
  const me = state.players[seat];
  const say = (msg: string, targets?: number[]) => emit(state, { kind: 'effect', seat, source: ctx.source, targets, msg });

  /** Opponent abilities are absorbed by shields; returns false if blocked. */
  const hits = (q: PlayerState) => {
    if (q.seat === seat || !ctx.fromAbility || !q.shield) return true;
    if (--q.shield.charges <= 0) q.shield = null;
    say(`${nameOf(pack, state, q.seat)}'s shield absorbs it`, [q.seat]);
    return false;
  };
  const targets = 'target' in e ? resolveTargets(state, seat, e.target, ctx).map((s) => state.players[s]) : [];

  switch (e.op) {
    case 'move':
      for (const q of targets) {
        if (!hits(q)) continue;
        if (q.seat !== seat && character(pack, q.character).passive.pushImmune) {
          say(`${nameOf(pack, state, q.seat)} stands firm`, [q.seat]);
          continue;
        }
        const path = forcedPath(b, q.tile, e.n, blockedFor(state, q.seat));
        if (!path.length) continue;
        travel(pack, state, q, path, e.n > 0 ? 'fwd' : 'back');
        emit(state, { kind: 'move', seat: q.seat, path, tile: q.tile, source: ctx.source, msg: `${nameOf(pack, state, q.seat)} ${e.n > 0 ? 'surges forward' : 'is pushed back'} ${path.length}` });
        if (b.tiles[q.tile].finish) return win(pack, state, q.seat);
      }
      break;

    case 'dash': {
      const paths = enumeratePaths(b, me.tile, e.n, 'fwd', new Set());
      if (!paths.length) break;
      const victimOn = (t: number) => state.players.some((q) => q.seat !== seat && q.tile === t) && !isSanctuary(pack, state, t);
      const path = paths.find((p) => victimOn(p[p.length - 1])) ??
        paths.sort((x, y) => progress(b, y[y.length - 1]) - progress(b, x[x.length - 1]))[0];
      travel(pack, state, me, path, 'fwd');
      emit(state, { kind: 'move', seat, path, tile: me.tile, source: ctx.source, msg: `${nameOf(pack, state, seat)} dashes ${path.length}` });
      land(pack, state, seat, me.tile, { dir: 'fwd', capture: true, tileEffects: false });
      break;
    }

    case 'send_to_checkpoint':
      for (const q of targets) {
        if (!hits(q)) continue;
        // Knocking out an opponent is a capture: it scores and charges ultimates.
        if (q.seat !== seat) capture(pack, state, seat, q.seat, q.tile);
        else {
          q.tile = q.checkpoint;
          say(`${nameOf(pack, state, q.seat)} is sent back to a checkpoint`, [q.seat]);
        }
      }
      break;

    case 'skip_turn':
      for (const q of targets) {
        if (!hits(q)) continue;
        q.skip += e.n;
        say(`${nameOf(pack, state, q.seat)} will lose ${e.n} turn${e.n > 1 ? 's' : ''}`, [q.seat]);
      }
      break;

    case 'extra_roll':
      state.bonusRoll = true;
      say(`${nameOf(pack, state, seat)} earns an extra roll`);
      break;

    case 'shield':
      for (const q of targets) {
        q.shield = { charges: e.charges, turns: e.turns + 1 };
        say(`${nameOf(pack, state, q.seat)} is shielded`, [q.seat]);
      }
      break;

    case 'swap': {
      const q = targets[0];
      if (!q || !hits(q)) break;
      [me.tile, q.tile] = [q.tile, me.tile];
      say(`${nameOf(pack, state, seat)} swaps places with ${nameOf(pack, state, q.seat)}`, [q.seat]);
      break;
    }

    case 'teleport': {
      if (e.to === 'portal_pair') {
        const t = ctx.tile ?? me.tile;
        const pair = b.tiles[t].pair;
        if (pair === undefined) break;
        if (state.portalCd[t]) {
          say('The portal is still recharging');
          break;
        }
        state.portalCd[t] = state.portalCd[pair] = PORTAL_COOLDOWN;
        emit(state, { kind: 'move', seat, path: [pair], tile: pair, source: ctx.source, msg: `${nameOf(pack, state, seat)} is whisked through the portal` });
        land(pack, state, seat, pair, { dir: 'fwd', capture: true, tileEffects: false });
      } else {
        const range = e.range ?? 10;
        const mine = progress(b, me.tile);
        const blocked = blockedFor(state, seat);
        const safe = b.tiles
          .filter((t) => !t.finish && t.start === undefined && !blocked.has(t.id))
          .filter((t) => progress(b, t.id) > mine && progress(b, t.id) <= mine + range)
          .filter((t) => isSanctuary(pack, state, t.id) ||
            state.players.every((q) => q.seat === seat || distance(b, t.id, q.tile, 3) > 3))
          .sort((x, y) => progress(b, y.id) - progress(b, x.id) || Math.abs(x.y - b.tiles[me.tile].y) - Math.abs(y.y - b.tiles[me.tile].y));
        const dest = safe[0];
        if (!dest) break;
        emit(state, { kind: 'move', seat, path: [dest.id], tile: dest.id, source: ctx.source, msg: `${nameOf(pack, state, seat)} vanishes and reappears ahead` });
        travel(pack, state, me, [dest.id], 'fwd');
      }
      break;
    }

    case 'place_trap':
      state.traps = state.traps.filter((t) => t.tile !== me.tile);
      state.traps.push({ tile: me.tile, owner: seat, turns: e.turns + 1, effects: e.effects, source: ctx.source });
      say(`${nameOf(pack, state, seat)} leaves a trap behind`);
      break;

    case 'block_tile':
      for (const q of targets) {
        const tiles = b.tiles[q.tile].next.filter((t) => !b.tiles[t].finish);
        if (!tiles.length) continue;
        state.blocks.push({ tiles, owner: seat, turns: e.turns + 1 });
        say(`The way ahead of ${nameOf(pack, state, q.seat)} is sealed`, [q.seat]);
      }
      break;

    case 'modify_dice':
      for (const q of targets) {
        if (!hits(q)) continue;
        q.dice = { mode: e.mode, turns: e.turns + (q.seat === seat ? 1 : 0) };
        say(`${nameOf(pack, state, q.seat)}'s dice are ${e.mode === 'plus1' ? 'blessed' : 'cursed'}`, [q.seat]);
      }
      break;

    case 'charge_ultimate':
      for (const q of targets) chargeUlt(pack, q, e.n);
      break;

    case 'if_element':
      runEffects(pack, state, seat, character(pack, me.character).element === e.element ? e.then : e.else, ctx);
      break;

    case 'random':
      runEffects(pack, state, seat, pick(state, e.options), ctx);
      break;
  }
}
