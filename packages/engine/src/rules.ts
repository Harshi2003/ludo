import { generateBoard, type PlayerCount } from './boardgen';
import { distance, enumeratePaths, forcedPath, progress } from './graph';
import { pick, randInt, shuffle } from './rng';
import type {
  AbilityDef, Action, Board, CharacterDef, Effect, GameEvent, GameState, MoveOption, PieceRef, PieceState,
  PlayerState, SquadMemberDef, TargetSpec, ThemePack, TileTypeDef,
} from './types';

export const ROUND_CAP = 80;
/** Pseudo-seat for world events: targets resolve against the whole table. */
export const WORLD = -1;
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
        pieces: members(c).map((m) => newPiece(c, m.id, board.starts[seat])),
        ult: 0, skip: 0, dice: null, captures: 0, timesCaptured: 0,
      };
    }),
    turn: 0, round: 1, phase: 'roll', roll: null, rawRoll: null, moves: [],
    usedAbility: false, extraRolls: 0, traps: [], blocks: [], wards: [], portalCd: {},
    rng: opts.seed >>> 0 || 1, events: [], winner: null, storm: false, bonusRoll: false, nextEvent: null,
  };
  scheduleEvent(pack, state, 0);
  announceTide(pack, state);
  startTurn(pack, state, true);
  return state;
}

function newPiece(c: CharacterDef, member: string, start: number): PieceState {
  return {
    member, tile: start, checkpoint: start, cooldown: 0, turnStart: start, stone: 0, snare: null, saved: false,
    shield: c.passive.startShield ? { charges: c.passive.startShield, turns: PERMANENT } : null,
  };
}

// ─── Lookups ───────────────────────────────────────────────────────────────

export function character(pack: ThemePack, id: string): CharacterDef {
  const c = pack.characters.find((c) => c.id === id);
  if (!c) throw new Error(`Unknown character ${id}`);
  return c;
}

/** Leader first, then the rest of the squad. */
export function members(c: CharacterDef): (CharacterDef | SquadMemberDef)[] {
  return [c, ...(c.squad ?? [])];
}

/** The character behind one piece. */
export function memberDef(pack: ThemePack, state: GameState, seat: number, piece = 0): CharacterDef | SquadMemberDef {
  const c = character(pack, state.players[seat].character);
  return members(c)[piece] ?? c;
}

export function tileDef(pack: ThemePack, state: GameState, tile: number): TileTypeDef | undefined {
  return pack.tiles.find((d) => d.id === state.board.tiles[tile].type);
}

const nameOf = (pack: ThemePack, s: GameState, seat: number, piece = 0) =>
  seat === WORLD ? pack.world.name.split(':')[0] : memberDef(pack, s, seat, piece).name;

const pc = (s: GameState, r: PieceRef) => s.players[r.seat].pieces[r.piece];

/** Waiting on its own start tile: out of reach of rival powers. */
const atHome = (s: GameState, r: PieceRef) => pc(s, r).tile === s.board.starts[r.seat];

export function piecesAt(state: GameState, tile: number): PieceRef[] {
  return state.players.flatMap((p) => p.pieces.flatMap((q, piece) => (q.tile === tile ? [{ seat: p.seat, piece }] : [])));
}

/** The piece of `seat` closest to the finish that is still on the board. */
export function leadPiece(state: GameState, seat: number): number {
  const ps = state.players[seat].pieces;
  const score = (i: number) => (state.board.tiles[ps[i].tile].finish ? -Infinity : progress(state.board, ps[i].tile));
  let best = 0;
  ps.forEach((_, i) => {
    if (score(i) > score(best)) best = i;
  });
  return best;
}

/** Pieces of `seat` already at the finish. */
export function piecesHome(state: GameState, seat: number): number {
  return state.players[seat].pieces.filter((q) => state.board.tiles[q.tile].finish).length;
}

const isFinished = (s: GameState, r: PieceRef) => s.board.tiles[pc(s, r).tile].finish === true;

/** Best progress among a player's pieces. */
export function playerProgress(state: GameState, seat: number): number {
  return progress(state.board, state.players[seat].pieces[leadPiece(state, seat)].tile);
}

/** Two or more of one squad on a tile outside its start: a bond nobody can land on. */
export function isBond(state: GameState, seat: number, tile: number): boolean {
  if (tile === state.board.starts[seat]) return false;
  return state.players[seat].pieces.filter((q) => q.tile === tile).length >= 2;
}

function emit(state: GameState, e: GameEvent) {
  state.events.push(e);
}

export function blockedFor(state: GameState, seat: number): Set<number> {
  const out = new Set<number>();
  for (const b of state.blocks) if (b.owner !== seat) b.tiles.forEach((t) => out.add(t));
  return out;
}

export function isSanctuary(pack: ThemePack, state: GameState, tile: number) {
  return tileDef(pack, state, tile)?.base === 'sanctuary' || state.wards.some((w) => w.tile === tile);
}

/** Rival bonds and rival stone block a tile. */
function landable(state: GameState, seat: number, tile: number) {
  if (state.board.tiles[tile].finish) return true;
  return !state.players.some((p) => p.seat !== seat && (isBond(state, p.seat, tile) || p.pieces.some((q) => q.tile === tile && q.stone > 0)));
}

// ─── Turn flow ─────────────────────────────────────────────────────────────

function startTurn(pack: ThemePack, state: GameState, first = false) {
  for (let guard = 0; guard < 64; guard++) {
    if (!first) advanceSeat(pack, state);
    first = false;
    if (state.phase === 'over') return;

    const p = state.players[state.turn];
    for (const q of p.pieces) {
      q.cooldown = Math.max(0, q.cooldown - 1);
      if (q.shield && --q.shield.turns <= 0) q.shield = null;
      if (q.stone > 0) q.stone--;
      if (q.snare && --q.snare.turns <= 0) q.snare = null;
    }
    if (p.dice && --p.dice.turns <= 0) p.dice = null;
    state.traps = state.traps.filter((t) => t.owner !== p.seat || --t.turns > 0);
    state.blocks = state.blocks.filter((b) => b.owner !== p.seat || --b.turns > 0);
    state.wards = state.wards.filter((w) => w.owner !== p.seat || --w.turns > 0);
    if (p.seat === 0) worldEvents(pack, state);
    if ((state.phase as string) === 'over') return;
    if (state.round > 1 || p.seat > 0) chargeUlt(pack, p, pack.rules.ultimateCharge.turn);
    runTriggers(pack, state, p.seat, 'turn_start', { piece: leadPiece(state, p.seat) });
    for (const q of p.pieces) q.turnStart = q.tile;

    if (p.skip > 0) {
      p.skip--;
      emit(state, { kind: 'skip', seat: p.seat, msg: `${houseName(pack, p)} is stunned and loses a turn` });
      continue;
    }
    Object.assign(state, { phase: 'roll', roll: null, rawRoll: null, dice: null, rawDice: null, moves: [], usedAbility: false, extraRolls: 0, bonusRoll: false });
    emit(state, { kind: 'turn', seat: p.seat, msg: `${houseName(pack, p)}'s turn` });
    return;
  }
}

/** The squad's name for turn-level messages; the leader's name when it fights alone. */
export function houseName(pack: ThemePack, p: PlayerState): string {
  const c = character(pack, p.character);
  return c.squad?.length && c.house ? c.house : c.name;
}

function advanceSeat(pack: ThemePack, state: GameState) {
  state.turn = (state.turn + 1) % state.players.length;
  if (state.turn !== 0) return;
  state.round++;
  for (const k of Object.keys(state.portalCd)) {
    if (--state.portalCd[+k] <= 0) delete state.portalCd[+k];
  }
  const stormAt = pack.rules.stormRound[state.players.length as PlayerCount];
  announceTide(pack, state);
  if (!state.storm && state.round >= stormAt && pack.rules.movement !== 'forward') {
    state.storm = true;
    emit(state, { kind: 'storm', seat: -1, msg: `${pack.rules.stormName}! Backward moves are no longer possible.` });
  }
  if (state.round > ROUND_CAP) {
    const leader = [...state.players].sort((a, b) =>
      piecesHome(state, b.seat) - piecesHome(state, a.seat) || playerProgress(state, b.seat) - playerProgress(state, a.seat))[0];
    win(pack, state, { seat: leader.seat, piece: leadPiece(state, leader.seat) }, 'reached the round limit in the lead');
  }
}

// ─── Tides ───────────────────────────────────────────────────────────────

/** The element that currently reigns, if the world has tides. */
export function reigning(pack: ThemePack, state: GameState): string | null {
  const t = pack.rules.tides;
  if (!t?.elements.length) return null;
  return t.elements[Math.floor((state.round - 1) / t.every) % t.elements.length];
}

/** Rounds left in the current reign (1 = last round). */
export function tideLeft(pack: ThemePack, state: GameState): number {
  const t = pack.rules.tides;
  return t ? t.every - ((state.round - 1) % t.every) : 0;
}

function announceTide(pack: ThemePack, state: GameState) {
  const t = pack.rules.tides;
  if (!t || (state.round - 1) % t.every !== 0) return;
  const el = reigning(pack, state)!;
  const who = pack.characters.filter((c) => c.element === el).map((c) => (c.squad?.length && c.house) || c.name).join(' & ');
  emit(state, { kind: 'tide', seat: WORLD, source: el, msg: `${t.name}: the ${el} tide rises${who ? `. ${who} moves +${t.bonus}` : ''}` });
}

// ─── World events ───────────────────────────────────────────────────────

function scheduleEvent(pack: ThemePack, state: GameState, from: number) {
  const every = pack.rules.eventEvery;
  state.nextEvent = pack.events?.length && every ? { round: from + every, index: randInt(state, pack.events.length) } : null;
}

/** Runs at the top of each round: warns a round ahead, then fires and schedules the next. */
function worldEvents(pack: ThemePack, state: GameState) {
  const next = state.nextEvent;
  const def = next && pack.events?.[next.index];
  if (!next || !def) return;
  if (state.round === next.round - 1) {
    emit(state, { kind: 'event_warning', seat: WORLD, source: def.id, msg: `Next round: ${def.name}` });
  } else if (state.round === next.round) {
    emit(state, { kind: 'world_event', seat: WORLD, source: def.id, msg: `${def.name}! ${def.description}` });
    runEffects(pack, state, WORLD, def.effects, { source: def.id });
    scheduleEvent(pack, state, state.round);
  }
}

function win(pack: ThemePack, state: GameState, r: PieceRef, how = `reached the ${pack.world.finish}`) {
  state.winner = r.seat;
  state.phase = 'over';
  const p = state.players[r.seat];
  const who = (pack.rules.winAt ?? 1) > 1 ? houseName(pack, p) : nameOf(pack, state, r.seat, r.piece);
  emit(state, { kind: 'win', seat: r.seat, piece: r.piece, msg: `${who} ${how}!` });
}

/** A piece reached the finish: the squad wins once enough of it is home. */
function arrive(pack: ThemePack, state: GameState, r: PieceRef) {
  const need = pack.rules.winAt ?? 1;
  const home = piecesHome(state, r.seat);
  if (home >= Math.min(need, state.players[r.seat].pieces.length)) return win(pack, state, r);
  emit(state, { kind: 'home', seat: r.seat, piece: r.piece, tile: state.board.finish, msg: `${nameOf(pack, state, r.seat, r.piece)} reaches the ${pack.world.finish}! ${home} of ${need} home` });
}

function endMove(pack: ThemePack, state: GameState) {
  if (state.phase === 'over') return;
  const p = state.players[state.turn];
  // A loaded six was bought with a power, so it doesn't earn the lucky throw on top.
  const lucky = pack.rules.dice === 'pick2'
    ? !!state.rawDice && state.rawDice[0] === state.rawDice[1]
    : pack.rules.extraRollOnSix && state.rawRoll === 6 && p.dice?.mode !== 'six';
  if ((state.bonusRoll || lucky) && state.extraRolls < MAX_EXTRA_ROLLS && p.skip === 0) {
    state.extraRolls++;
    Object.assign(state, { phase: 'roll', roll: null, rawRoll: null, dice: null, rawDice: null, moves: [], bonusRoll: false });
    emit(state, { kind: 'roll', seat: p.seat, msg: `${houseName(pack, p)} rolls again!` });
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
    const floor = character(pack, p.character).passive.diceFloor ?? 0;
    const modify = (raw: number) => {
      let n = raw;
      if (p.dice?.mode === 'halve') n = Math.ceil(n / 2);
      if (p.dice?.mode === 'max3') n = Math.min(n, 3);
      if (p.dice?.mode === 'plus1') n = n + 1;
      if (p.dice?.mode === 'double') n = n * 2;
      return Math.max(n, floor);
    };
    const throwDie = (i: number) => (i === 0 && p.dice?.mode === 'six' ? 6 : 1 + randInt(state, 6));
    const raws = pack.rules.dice === 'pick2' ? [throwDie(0), throwDie(1)] : [throwDie(0)];
    const ns = raws.map(modify);
    state.rawRoll = Math.max(...raws);
    state.roll = Math.max(...ns);
    if (raws.length > 1) {
      state.rawDice = raws;
      state.dice = ns;
      const seen = new Set<string>();
      state.moves = [...new Set(ns)].flatMap((n) => legalMoves(pack, state, p.seat, n).map((m) => ({ ...m, die: n }))).filter((m) => {
        const key = `${m.piece}:${m.dir}:${m.path.join(',')}`;
        return !seen.has(key) && !!seen.add(key);
      });
    } else state.moves = legalMoves(pack, state, p.seat, ns[0]);
    const bonus = forwardBonus(pack, state, p.seat, leadPiece(state, p.seat));
    const extra = bonus ? ` · ${bonus > 0 ? '+' : ''}${bonus} going forward` : '';
    const said = raws.map((r, i) => `${r}${ns[i] !== r ? ` (counts as ${ns[i]})` : ''}`).join(' and ');
    const doubles = raws.length > 1 && raws[0] === raws[1] ? '. Doubles!' : '';
    const flip = p.dice?.mode === 'reverse' ? ' · backward only' : '';
    emit(state, { kind: 'roll', seat: p.seat, value: state.roll, dice: raws, msg: `${houseName(pack, p)} rolled ${said}${doubles}${extra}${flip}` });
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
    const r = { seat: p.seat, piece: opt.piece };
    const from = pc(state, r).tile;
    // A marching bond moves as one: the squadmates follow the same path.
    // Stone stays put, and a snared squadmate only comes along if this roll breaks the snare.
    const escort = pack.rules.bondMarch && isBond(state, p.seat, from)
      ? p.pieces.flatMap((q, i) => (i !== opt.piece && q.tile === from && !q.stone && (!q.snare || (opt.die ?? state.roll ?? 0) >= q.snare.need) ? [i] : []))
      : [];
    pc(state, r).snare = null;
    travel(pack, state, r, opt.path, opt.dir);
    const names = [opt.piece, ...escort].map((i) => nameOf(pack, state, p.seat, i)).join(' & ');
    // Escorts ride in the same event (targets/hits) so they are animated as one marching bond.
    emit(state, {
      kind: 'move', seat: p.seat, piece: opt.piece, path: opt.path, tile: opt.to,
      ...(escort.length ? { targets: escort.map(() => p.seat), hits: escort } : {}),
      msg: `${names} ${escort.length ? 'march' : 'moves'} ${opt.path.length} ${opt.dir === 'back' ? 'back' : ''}`.trim(),
    });
    for (const i of escort) {
      const m = { seat: p.seat, piece: i };
      pc(state, m).snare = null;
      travel(pack, state, m, opt.path, opt.dir);
      if (state.board.tiles[opt.to].finish) arrive(pack, state, m);
      if ((state.phase as string) === 'over') return state;
    }
    land(pack, state, r, opt.to, { dir: opt.dir, capture: true, tileEffects: true });
    endMove(pack, state);
    return state;
  }

  if (action.type === 'ability') {
    const piece = action.which === 'ultimate' ? leadPiece(state, p.seat) : action.piece ?? 0;
    if (!canUseAbility(pack, state, action.which, piece)) throw new Error('Ability not ready');
    state.usedAbility = true;
    if (action.which === 'ultimate') {
      const def = character(pack, p.character).ultimate;
      p.ult = 0;
      emit(state, { kind: 'ultimate', seat: p.seat, piece, source: def.id, msg: `${nameOf(pack, state, p.seat, piece)} unleashes ${def.name}!` });
      runEffects(pack, state, p.seat, def.effects, { source: def.id, fromAbility: true, piece });
    } else {
      // A bond casts together: every ready member on the tile adds its own power.
      for (const j of [piece, ...bondmates(state, p.seat, piece)]) {
        if ((state.phase as string) === 'over') break;
        const def = memberDef(pack, state, p.seat, j).active;
        if (j !== piece && def.requires && !resolveTargets(state, p.seat, def.requires, { piece: j }).length) continue;
        p.pieces[j].cooldown = (def.cooldown ?? 3) + 1;
        const who = nameOf(pack, state, p.seat, j);
        emit(state, { kind: 'ability', seat: p.seat, piece: j, source: def.id, msg: j === piece ? `${who} casts ${def.name}!` : `Combo! ${who} adds ${def.name}` });
        runEffects(pack, state, p.seat, def.effects, { source: def.id, fromAbility: true, piece: j });
      }
    }
    if ((state.phase as string) !== 'over' && p.skip > 0) startTurn(pack, state);
    return state;
  }
  return state;
}

/** Other ready members sharing this piece's tile. */
export function bondmates(state: GameState, seat: number, piece: number): number[] {
  const ps = state.players[seat].pieces;
  const me = ps[piece];
  if (!isBond(state, seat, me.tile)) return [];
  return ps.flatMap((q, i) => (i !== piece && q.tile === me.tile && q.cooldown === 0 && q.stone === 0 ? [i] : []));
}

/** -1 uphill, +1 downhill, for forward moves starting on this piece's tile. */
export function slopeBonus(pack: ThemePack, state: GameState, seat: number, piece = 0): number {
  const p = state.players[seat];
  const slope = pack.zones[state.board.tiles[p.pieces[piece].tile].zone]?.slope;
  if (slope === 'down') return 1;
  if (slope === 'up' && !character(pack, p.character).passive.slopeImmune) return -1;
  return 0;
}

/** Slope plus tide: what this piece adds to forward moves right now. */
export function forwardBonus(pack: ThemePack, state: GameState, seat: number, piece = 0): number {
  const t = pack.rules.tides;
  const el = character(pack, state.players[seat].character).element;
  return slopeBonus(pack, state, seat, piece) + (t && reigning(pack, state) === el ? t.bonus : 0);
}

export function legalMoves(pack: ThemePack, state: GameState, seat: number, n: number): MoveOption[] {
  const p = state.players[seat];
  const blocked = blockedFor(state, seat);
  const dirs: ('fwd' | 'back')[] = p.dice?.mode === 'reverse' ? ['back']
    : state.storm || pack.rules.movement === 'forward' ? ['fwd'] : ['fwd', 'back'];
  // Bonded pieces share a tile, so their routes are the same: offer each route once.
  const seen = new Set<string>();
  return p.pieces.flatMap((q, piece) => {
    if (q.stone > 0 || (q.snare && n < q.snare.need) || state.board.tiles[q.tile].finish) return [];
    const slope = forwardBonus(pack, state, seat, piece);
    return dirs.flatMap((dir) =>
      enumeratePaths(state.board, q.tile, dir === 'fwd' ? Math.max(1, n + slope) : n, dir, blocked).flatMap((path) => {
        const to = path[path.length - 1];
        const key = `${dir}:${q.tile}:${path.join(',')}`;
        if (!landable(state, seat, to) || seen.has(key)) return [];
        seen.add(key);
        const captures = isSanctuary(pack, state, to) || state.board.tiles[to].finish
          ? []
          : [...new Set(piecesAt(state, to).filter((r) => r.seat !== seat).map((r) => r.seat))];
        return [{ piece, dir, path, to, captures }];
      }),
    );
  });
}

export function abilityDef(pack: ThemePack, state: GameState, which: 'active' | 'ultimate', seat = state.turn, piece = 0): AbilityDef {
  return which === 'active' ? memberDef(pack, state, seat, piece).active : character(pack, state.players[seat].character).ultimate;
}

export function canUseAbility(pack: ThemePack, state: GameState, which: 'active' | 'ultimate', piece = 0): boolean {
  if (state.phase !== 'roll' || state.usedAbility) return false;
  const p = state.players[state.turn];
  const i = which === 'ultimate' ? leadPiece(state, p.seat) : piece;
  const q = p.pieces[i];
  if (!q) return false;
  const def = abilityDef(pack, state, which, p.seat, i);
  if (which === 'active' && (q.cooldown > 0 || q.stone > 0)) return false;
  if (which === 'ultimate' && p.ult < (def.cost ?? 8)) return false;
  return !def.requires || resolveTargets(state, p.seat, def.requires, { piece: i }).length > 0;
}

// ─── Movement & landing ──────────────────────────────────────────────────

function travel(pack: ThemePack, state: GameState, r: PieceRef, path: number[], dir: 'fwd' | 'back') {
  const q = pc(state, r);
  if (dir === 'fwd') {
    for (const t of path) {
      const tile = state.board.tiles[t];
      if (tile.checkpoint && progress(state.board, t) > progress(state.board, q.checkpoint)) {
        q.checkpoint = t;
        emit(state, { kind: 'checkpoint', seat: r.seat, piece: r.piece, tile: t, msg: `${nameOf(pack, state, r.seat, r.piece)} reached a checkpoint` });
      }
    }
  }
  if (path.length) q.tile = path[path.length - 1];
}

interface LandOpts { dir: 'fwd' | 'back'; capture: boolean; tileEffects: boolean }

function land(pack: ThemePack, state: GameState, r: PieceRef, tile: number, o: LandOpts) {
  const q = pc(state, r);
  q.tile = tile;
  if (state.board.tiles[tile].finish) return arrive(pack, state, r);

  if (o.capture && !isSanctuary(pack, state, tile)) {
    for (const v of piecesAt(state, tile)) {
      if (v.seat === r.seat) continue;
      const vp = pc(state, v);
      if (vp.tile !== tile || vp.stone > 0) continue;
      if (isBond(state, v.seat, tile)) {
        emit(state, { kind: 'blocked_capture', seat: r.seat, piece: r.piece, targets: [v.seat], hits: [v.piece], tile, msg: `The bond holds: ${nameOf(pack, state, v.seat, v.piece)} can't be taken` });
        continue;
      }
      if (vp.shield) {
        const reflect = vp.shield.reflect;
        if (--vp.shield.charges <= 0) vp.shield = null;
        emit(state, { kind: 'blocked_capture', seat: r.seat, piece: r.piece, targets: [v.seat], hits: [v.piece], tile, msg: `${nameOf(pack, state, v.seat, v.piece)}'s shield ${reflect ? 'bounces the attack straight back' : 'absorbs the attack'}` });
        if (reflect) {
          takeDown(pack, state, v, r, tile);
          return;
        }
        continue;
      }
      takeDown(pack, state, r, v, tile);
    }
  }
  if (q.tile !== tile || state.phase === 'over') return;
  checkBond(pack, state, r);

  const trapIdx = state.traps.findIndex((t) => t.tile === tile && t.owner !== r.seat);
  if (trapIdx >= 0) {
    const trap = state.traps.splice(trapIdx, 1)[0];
    emit(state, { kind: 'trap', seat: trap.owner, targets: [r.seat], hits: [r.piece], tile, source: trap.source, msg: `${nameOf(pack, state, r.seat, r.piece)} triggers ${nameOf(pack, state, trap.owner)}'s trap` });
    runEffects(pack, state, r.seat, trap.effects, { source: trap.source, tile, piece: r.piece });
  }

  if (o.tileEffects && (state.phase as string) !== 'over' && q.tile === tile) {
    const def = tileDef(pack, state, tile);
    if (def && def.effects.length && !(def.category === 'helpful' && o.dir === 'back')) {
      emit(state, { kind: 'tile', seat: r.seat, piece: r.piece, tile, source: def.id, msg: `${def.name}: ${def.description}` });
      runEffects(pack, state, r.seat, def.effects, { source: def.id, tile, piece: r.piece });
    }
  }
}

/** Fires when a piece arrives on a tile its squadmates already hold. */
function checkBond(pack: ThemePack, state: GameState, r: PieceRef) {
  const q = pc(state, r);
  if (!isBond(state, r.seat, q.tile)) return;
  const names = state.players[r.seat].pieces.flatMap((x, i) => (x.tile === q.tile ? [nameOf(pack, state, r.seat, i)] : []));
  emit(state, { kind: 'bond', seat: r.seat, piece: r.piece, tile: q.tile, msg: `${names.join(' & ')} form a bond` });
  runTriggers(pack, state, r.seat, 'bond', { piece: r.piece });
}

/** A piece is taken out: the world's rule decides where it goes. */
function takeDown(pack: ThemePack, state: GameState, by: PieceRef, victim: PieceRef, tile: number) {
  const a = state.players[by.seat];
  const v = state.players[victim.seat];
  const vp = pc(state, victim);
  const rule = pack.rules.capture ?? { mode: 'checkpoint' };
  let how = 'captures';
  let tail = '';
  if (character(pack, v.character).passive.secondLife && !vp.saved) {
    vp.saved = true;
    vp.tile = vp.checkpoint;
    how = 'drowns';
    tail = ', who rises again at the last checkpoint';
  } else if (rule.mode === 'tow') {
    const path = forcedPath(state.board, vp.tile, -(rule.back ?? 6), new Set());
    if (path.length) vp.tile = path[path.length - 1];
    how = 'tows';
    tail = ` back ${rule.back ?? 6}`;
  } else if (rule.mode === 'stun') {
    v.skip++;
    how = 'traps';
    tail = ' in place: they lose their next turn';
  } else if (rule.mode === 'start') {
    vp.tile = state.board.starts[victim.seat];
    how = 'takes out';
    tail = ', back to the start';
  } else vp.tile = vp.checkpoint;
  vp.stone = 0;
  vp.snare = null;
  a.captures++;
  v.timesCaptured++;
  const stolen = Math.min(v.ult, rule.steal ?? 0);
  v.ult -= stolen;
  chargeUlt(pack, a, pack.rules.ultimateCharge.capture + stolen);
  chargeUlt(pack, v, pack.rules.ultimateCharge.captured);
  emit(state, {
    kind: 'capture', seat: by.seat, piece: by.piece, targets: [victim.seat], hits: [victim.piece], tile, to: vp.tile,
    msg: `${nameOf(pack, state, by.seat, by.piece)} ${how} ${nameOf(pack, state, victim.seat, victim.piece)}${tail}!${stolen ? ` (+${stolen} charge stolen)` : ''}`,
  });
  runTriggers(pack, state, by.seat, 'capture', { captured: victim, piece: by.piece });
  runTriggers(pack, state, victim.seat, 'captured', { captor: by, piece: victim.piece });
}

function chargeUlt(pack: ThemePack, p: PlayerState, n: number) {
  const cost = character(pack, p.character).ultimate.cost ?? 8;
  p.ult = Math.min(cost, p.ult + n);
}

function runTriggers(pack: ThemePack, state: GameState, seat: number, on: 'capture' | 'captured' | 'turn_start' | 'bond', ctx: Partial<Ctx>) {
  if (state.phase === 'over') return;
  const passive = character(pack, state.players[seat].character).passive;
  for (const t of passive.triggers ?? []) {
    if (t.on !== on) continue;
    // A turn-start aura with nobody in range stays silent instead of spamming the log.
    if (on === 'turn_start' && t.effects.every((e) => 'target' in e && !resolveTargets(state, seat, e.target, ctx).length)) continue;
    emit(state, { kind: 'passive', seat, piece: ctx.piece, source: passive.id, msg: `${passive.name} activates` });
    runEffects(pack, state, seat, t.effects, { ...ctx, source: passive.id });
  }
}

// ─── Effects ───────────────────────────────────────────────────────────────

interface Ctx {
  source: string;
  tile?: number;
  captured?: PieceRef;
  captor?: PieceRef;
  fromAbility?: boolean;
  /** Set while running a copied ability, so copies can't copy. */
  mimic?: boolean;
  /** The acting piece of the casting seat. */
  piece?: number;
}

/** Ops that act from the caster's own piece; world events can't use them. */
export const SELF_OPS = new Set<Effect['op']>([
  'dash', 'extra_roll', 'swap', 'teleport', 'place_trap', 'if_element', 'steal_charge', 'hitch', 'mimic',
  'kill', 'pull', 'magnet', 'scramble', 'leapfrog', 'trample', 'blast', 'scorch', 'ward', 'revive', 'recall', 'swap_ally', 'gather', 'join',
]);

export function resolveTargets(state: GameState, seat: number, spec: TargetSpec, ctx: Partial<Ctx>): PieceRef[] {
  if (seat === WORLD) return worldTargets(state, spec);
  const origin = ctx.piece ?? 0;
  const me = state.players[seat].pieces[origin];
  if (spec.who === 'self') return [{ seat, piece: origin }];
  if (spec.who === 'squad') return state.players[seat].pieces.map((_, piece) => ({ seat, piece }));
  if (spec.who === 'captured') return ctx.captured ? [ctx.captured] : [];
  if (spec.who === 'captor') return ctx.captor ? [ctx.captor] : [];
  const b = state.board;
  const range = spec.range ?? Infinity;
  const opps = state.players
    .filter((q) => q.seat !== seat)
    .flatMap((q) => q.pieces.map((x, piece) => ({ seat: q.seat, piece, tile: x.tile })))
    .filter((o) => !atHome(state, o) && !b.tiles[o.tile].finish)
    .map((o) => ({ seat: o.seat, piece: o.piece, d: distance(b, me.tile, o.tile, range), prog: progress(b, o.tile) }))
    .filter((o) => o.d <= range);
  const ref = (o: { seat: number; piece: number }) => ({ seat: o.seat, piece: o.piece });
  if (spec.who === 'everyone') return [{ seat, piece: origin }, ...opps.map(ref)];
  const mine = progress(b, me.tile);
  if (spec.side) opps.splice(0, opps.length, ...opps.filter((o) => (spec.side === 'ahead' ? o.prog > mine : o.prog < mine)));
  switch (spec.who) {
    case 'nearest':
      return opps.sort((a, c) => a.d - c.d || c.prog - a.prog).slice(0, 1).map(ref);
    case 'leader':
      return opps.sort((a, c) => c.prog - a.prog).slice(0, 1).map(ref);
    case 'all':
      return opps.map(ref);
    case 'ahead':
      return opps.filter((o) => o.prog > mine).map(ref);
    case 'behind':
      return opps.filter((o) => o.prog < mine).map(ref);
    case 'random':
      return opps.length ? [ref(pick(state, opps))] : [];
  }
}

/** The world sees each squad by its lead piece, except table-wide effects that reach every piece. */
function worldTargets(state: GameState, spec: TargetSpec): PieceRef[] {
  if (spec.who === 'all' || spec.who === 'everyone') {
    return state.players.flatMap((q) => q.pieces.map((_, piece) => ({ seat: q.seat, piece })));
  }
  const all = state.players
    .map((q) => ({ seat: q.seat, piece: leadPiece(state, q.seat), prog: playerProgress(state, q.seat) }))
    .sort((a, c) => c.prog - a.prog);
  const median = all[Math.floor(all.length / 2)].prog;
  const ref = (o: { seat: number; piece: number }) => ({ seat: o.seat, piece: o.piece });
  switch (spec.who) {
    case 'leader':
      return [ref(all[0])];
    case 'ahead':
      return all.filter((o) => o.prog > median).map(ref);
    case 'behind':
      return all.filter((o) => o.prog < median).map(ref);
    case 'random':
      return [ref(pick(state, all))];
    default:
      return [];
  }
}

export function runEffects(pack: ThemePack, state: GameState, seat: number, effects: Effect[], ctx: Ctx) {
  for (const e of effects) {
    if (state.phase === 'over') return;
    runEffect(pack, state, seat, e, ctx);
  }
}

/** Farthest tile ahead within range with no rival close by (or a sanctuary). */
function safeTile(pack: ThemePack, state: GameState, r: PieceRef, range: number): number | undefined {
  const b = state.board;
  const from = pc(state, r).tile;
  const mine = progress(b, from);
  const blocked = blockedFor(state, r.seat);
  const rivals = state.players.filter((q) => q.seat !== r.seat).flatMap((q) => q.pieces.map((x) => x.tile));
  return b.tiles
    .filter((t) => !t.finish && t.start === undefined && !blocked.has(t.id) && landable(state, r.seat, t.id))
    .filter((t) => progress(b, t.id) > mine && progress(b, t.id) <= mine + range)
    .filter((t) => isSanctuary(pack, state, t.id) || rivals.every((x) => distance(b, t.id, x, 3) > 3))
    .sort((x, y) => progress(b, y.id) - progress(b, x.id) || Math.abs(x.y - b.tiles[from].y) - Math.abs(y.y - b.tiles[from].y))[0]?.id;
}

function runEffect(pack: ThemePack, state: GameState, seat: number, e: Effect, ctx: Ctx) {
  const b = state.board;
  const origin = ctx.piece ?? 0;
  const self: PieceRef = { seat, piece: origin };
  const me = seat === WORLD ? undefined : pc(state, self);
  const say = (msg: string, targets?: PieceRef[]) =>
    emit(state, { kind: 'effect', seat, piece: origin, source: ctx.source, targets: targets?.map((t) => t.seat), hits: targets?.map((t) => t.piece), msg });
  const name = (r: PieceRef) => nameOf(pack, state, r.seat, r.piece);
  const mover = (r: PieceRef, path: number[], msg: string) =>
    emit(state, { kind: 'move', seat: r.seat, piece: r.piece, path, tile: pc(state, r).tile, source: ctx.source, msg });

  /** Opponent powers are absorbed by shields, and stone shrugs everything off; false if blocked. */
  const hits = (r: PieceRef) => {
    if (r.seat === seat) return true;
    const q = pc(state, r);
    if (q.stone > 0) {
      say(`${name(r)} is stone and feels nothing`, [r]);
      return false;
    }
    if (!ctx.fromAbility || !q.shield) return true;
    if (--q.shield.charges <= 0) q.shield = null;
    say(`${name(r)}'s shield absorbs it`, [r]);
    return false;
  };
  /** Rooted pieces can't be shoved around by rivals. */
  const firm = (r: PieceRef) => {
    if (r.seat === seat || !character(pack, state.players[r.seat].character).passive.pushImmune) return false;
    say(`${name(r)} stands firm`, [r]);
    return true;
  };
  const seatsOf = (rs: PieceRef[]) => rs.filter((r, i) => rs.findIndex((x) => x.seat === r.seat) === i);

  if (seat === WORLD && SELF_OPS.has(e.op)) return;
  const targets = 'target' in e ? resolveTargets(state, seat, e.target, ctx) : [];

  switch (e.op) {
    case 'move':
      for (const r of targets) {
        if (!hits(r) || firm(r)) continue;
        const q = pc(state, r);
        const path = forcedPath(b, q.tile, e.n, blockedFor(state, r.seat));
        if (!path.length) continue;
        travel(pack, state, r, path, e.n > 0 ? 'fwd' : 'back');
        mover(r, path, `${name(r)} ${e.n > 0 ? 'surges forward' : 'is pushed back'} ${path.length}`);
        if (b.tiles[q.tile].finish) arrive(pack, state, r);
        if (state.phase === 'over') return;
      }
      break;

    case 'dash': {
      const movers = e.squad
        ? state.players[seat].pieces.flatMap((q, i) => (q.stone || b.tiles[q.tile].finish ? [] : [i]))
        : [origin];
      for (const i of movers) {
        if (state.phase === 'over') return;
        const r = { seat, piece: i };
        const paths = enumeratePaths(b, pc(state, r).tile, e.n, 'fwd', new Set()).filter((p) => landable(state, seat, p[p.length - 1]));
        if (!paths.length) continue;
        const victimOn = (t: number) => piecesAt(state, t).some((v) => v.seat !== seat) && !isSanctuary(pack, state, t);
        const path = paths.find((p) => victimOn(p[p.length - 1])) ??
          paths.sort((x, y) => progress(b, y[y.length - 1]) - progress(b, x[x.length - 1]))[0];
        travel(pack, state, r, path, 'fwd');
        mover(r, path, `${name(r)} dashes ${path.length}`);
        land(pack, state, r, pc(state, r).tile, { dir: 'fwd', capture: true, tileEffects: false });
      }
      break;
    }

    case 'send_to_checkpoint':
      for (const r of targets) {
        if (!hits(r)) continue;
        const q = pc(state, r);
        if (q.tile === q.checkpoint) continue;
        q.tile = q.checkpoint;
        mover(r, [q.tile], `${name(r)} is washed back to a checkpoint`);
      }
      break;

    case 'kill':
      for (const r of targets) {
        const q = pc(state, r);
        if (r.seat === seat) {
          // A hazard turned on yourself: only a shield saves you.
          if (q.shield) {
            if (--q.shield.charges <= 0) q.shield = null;
            say(`${name(r)}'s shield saves them`, [r]);
            continue;
          }
          q.tile = b.starts[seat];
          q.stone = 0;
          q.snare = null;
          state.players[seat].timesCaptured++;
          emit(state, { kind: 'capture', seat, piece: r.piece, targets: [seat], hits: [r.piece], tile: ctx.tile, to: q.tile, source: ctx.source, msg: `${name(r)} falls and returns to the start` });
          continue;
        }
        if (!hits(r) || isSanctuary(pack, state, q.tile)) continue;
        takeDown(pack, state, self, r, q.tile);
      }
      break;

    case 'skip_turn':
      for (const r of seatsOf(targets)) {
        if (!hits(r)) continue;
        state.players[r.seat].skip += e.n;
        say(`${houseName(pack, state.players[r.seat])} will lose ${e.n} turn${e.n > 1 ? 's' : ''}`, [r]);
      }
      break;

    case 'extra_roll':
      state.bonusRoll = true;
      say(`${houseName(pack, state.players[seat])} earns an extra roll`);
      break;

    case 'shield':
      for (const r of targets) {
        pc(state, r).shield = { charges: e.charges, turns: e.turns + 1, ...(e.reflect ? { reflect: true } : {}) };
        say(`${name(r)} is shielded`, [r]);
      }
      break;

    case 'strip':
      for (const r of targets) {
        const q = pc(state, r);
        if (!q.shield || q.stone) continue;
        q.shield = null;
        say(`${name(r)}'s shield is torn away`, [r]);
      }
      break;

    case 'swap': {
      const r = targets[0];
      if (!r || !me || !hits(r) || firm(r)) break;
      const q = pc(state, r);
      [me.tile, q.tile] = [q.tile, me.tile];
      mover(self, [me.tile], `${name(self)} swaps places with ${name(r)}`);
      mover(r, [q.tile], `${name(r)} is swapped away`);
      break;
    }

    case 'teleport': {
      if (!me) break;
      if (e.to === 'portal_pair') {
        const t = ctx.tile ?? me.tile;
        const pair = b.tiles[t].pair;
        if (pair === undefined) break;
        if (state.portalCd[t]) {
          say('The portal is still recharging');
          break;
        }
        state.portalCd[t] = state.portalCd[pair] = PORTAL_COOLDOWN;
        if (!landable(state, seat, pair)) {
          say('The far side of the portal is blocked');
          break;
        }
        mover(self, [pair], `${name(self)} is whisked through the portal`);
        land(pack, state, self, pair, { dir: 'fwd', capture: true, tileEffects: false });
      } else {
        const dest = safeTile(pack, state, self, e.range ?? 10);
        if (dest === undefined) break;
        travel(pack, state, self, [dest], 'fwd');
        mover(self, [dest], `${name(self)} vanishes and reappears ahead`);
      }
      break;
    }

    case 'place_trap':
      if (!me) break;
      state.traps = state.traps.filter((t) => t.tile !== me.tile);
      state.traps.push({ tile: me.tile, owner: seat, turns: e.turns + 1, effects: e.effects, source: ctx.source });
      say(`${name(self)} leaves a trap behind`);
      break;

    case 'scorch': {
      if (!me) break;
      const tiles = forcedPath(b, me.tile, -e.n, new Set()).filter((t) => b.tiles[t].start === undefined);
      if (!tiles.length) break;
      state.traps = state.traps.filter((t) => !tiles.includes(t.tile));
      for (const t of tiles) state.traps.push({ tile: t, owner: seat, turns: e.turns + 1, effects: e.effects, source: ctx.source });
      say(`${name(self)} leaves ${tiles.length} tiles burning behind`);
      break;
    }

    case 'block_tile':
      for (const r of targets) {
        const tiles = b.tiles[pc(state, r).tile].next.filter((t) => !b.tiles[t].finish);
        if (!tiles.length) continue;
        state.blocks.push({ tiles, owner: seat, turns: e.turns + 1 });
        say(r.seat === seat ? `${name(r)} walls off the way ahead` : `The way ahead of ${name(r)} is sealed`, [r]);
      }
      break;

    case 'modify_dice': {
      const buff = e.mode === 'plus1' || e.mode === 'six' || e.mode === 'double';
      for (const r of seatsOf(targets)) {
        const p = state.players[r.seat];
        if (r.seat !== seat && !buff && character(pack, p.character).passive.diceImmune) {
          say(`${houseName(pack, p)} keeps a cool head`, [r]);
          continue;
        }
        if (!hits(r)) continue;
        // +1 because the counter ticks at the start of the target's turn. A world event at the
        // top of the round runs after the first seat has already ticked, and a power cast on
        // yourself before rolling already counts for this roll.
        const now = r.seat === state.turn && (seat === WORLD || (r.seat === seat && state.phase === 'roll'));
        p.dice = { mode: e.mode, turns: e.turns + (now ? 0 : 1) };
        const what = { halve: 'are halved', max3: 'are frozen at 3', plus1: 'are blessed', six: 'are loaded with a six', double: 'will count double', reverse: 'are flipped backward' }[e.mode];
        say(`${houseName(pack, p)}'s dice ${what}`, [r]);
      }
      break;
    }

    case 'charge_ultimate':
      for (const r of seatsOf(targets)) chargeUlt(pack, state.players[r.seat], e.n);
      break;

    case 'steal_charge':
      for (const r of seatsOf(targets)) {
        const q = state.players[r.seat];
        if (r.seat === seat || !hits(r)) continue;
        const take = Math.min(q.ult, e.n);
        if (!take) continue;
        q.ult -= take;
        chargeUlt(pack, state.players[seat], take);
        say(`${name(self)} drains ${take} charge from ${houseName(pack, q)}`, [r]);
      }
      break;

    case 'rewind':
      for (const r of targets) {
        const q = pc(state, r);
        const back = q.turnStart ?? q.tile;
        if (progress(b, back) >= progress(b, q.tile) || !hits(r)) continue;
        q.tile = back;
        mover(r, [back], `${name(r)} is rewound to where their turn began`);
      }
      break;

    case 'hitch': {
      const r = targets[0];
      if (!r || !me) break;
      const dest = b.tiles[pc(state, r).tile].prev
        .filter((t) => (b.tiles[t].start === undefined || b.tiles[t].start === seat) && landable(state, seat, t))
        .sort((x, y) => progress(b, y) - progress(b, x))[0];
      if (dest === undefined || progress(b, dest) <= progress(b, me.tile)) break;
      mover(self, [dest], `${name(self)} hitches a ride behind ${name(r)}`);
      travel(pack, state, self, [dest], 'fwd');
      land(pack, state, self, dest, { dir: 'fwd', capture: false, tileEffects: false });
      break;
    }

    case 'mimic': {
      const r = targets[0];
      if (!r) break;
      if (ctx.mimic) {
        say('A copy of a copy fizzles');
        break;
      }
      const def = e.slot === 'active' ? memberDef(pack, state, r.seat, r.piece).active : character(pack, state.players[r.seat].character).ultimate;
      say(`${name(self)} copies ${name(r)}'s ${def.name}`, [r]);
      runEffects(pack, state, seat, def.effects, { ...ctx, mimic: true });
      break;
    }

    case 'pull': {
      if (!me) break;
      const dest = forcedPath(b, me.tile, 1, new Set())[0];
      const r = targets[0];
      if (!r || dest === undefined || b.tiles[dest].finish || !hits(r) || firm(r)) break;
      pc(state, r).tile = dest;
      mover(r, [dest], `${name(r)} is dragged right in front of ${name(self)}`);
      break;
    }

    case 'magnet': {
      if (!me) break;
      for (const r of resolveTargets(state, seat, { who: 'all', range: e.range }, ctx)) {
        const q = pc(state, r);
        const steps = Math.min(e.n, distance(b, me.tile, q.tile, e.range) - 1);
        if (steps <= 0 || !hits(r) || firm(r)) continue;
        const ahead = progress(b, q.tile) > progress(b, me.tile);
        const path = forcedPath(b, q.tile, ahead ? -steps : steps, blockedFor(state, r.seat));
        if (!path.length) continue;
        travel(pack, state, r, path, ahead ? 'back' : 'fwd');
        mover(r, path, `${name(r)} is sucked toward ${name(self)}`);
      }
      break;
    }

    case 'scramble': {
      if (!me) break;
      const refs = [self, ...resolveTargets(state, seat, { who: 'all', range: e.range }, ctx).filter((r) => hits(r) && !firm(r))];
      if (refs.length < 2) {
        say('The wind finds nobody to scatter');
        break;
      }
      const tiles = refs.map((r) => pc(state, r).tile);
      let order = shuffle(state, tiles.slice());
      if (order.every((t, i) => t === tiles[i])) order = [...tiles.slice(1), tiles[0]];
      refs.forEach((r, i) => {
        if (pc(state, r).tile === order[i]) return;
        pc(state, r).tile = order[i];
        mover(r, [order[i]], `${name(r)} is flung across the board`);
      });
      break;
    }

    case 'leapfrog': {
      const r = targets[0];
      if (!r || !me) break;
      const dest = forcedPath(b, pc(state, r).tile, 1, new Set())[0];
      if (dest === undefined || !landable(state, seat, dest)) break;
      if (hits(r) && !firm(r)) {
        const path = forcedPath(b, pc(state, r).tile, -e.n, blockedFor(state, r.seat));
        if (path.length) {
          travel(pack, state, r, path, 'back');
          mover(r, path, `${name(r)} is knocked back ${path.length}`);
        }
      }
      travel(pack, state, self, [dest], 'fwd');
      mover(self, [dest], `${name(self)} bounces right over ${name(r)}`);
      land(pack, state, self, dest, { dir: 'fwd', capture: true, tileEffects: false });
      break;
    }

    case 'trample': {
      if (!me) break;
      const victims = (p: number[]) => p.reduce((n, t) => n + (isSanctuary(pack, state, t) ? 0 : piecesAt(state, t).filter((v) => v.seat !== seat).length), 0);
      const paths = enumeratePaths(b, me.tile, e.n, 'fwd', new Set());
      if (!paths.length) break;
      const path = paths.sort((x, y) => victims(y) - victims(x) || progress(b, y[y.length - 1]) - progress(b, x[x.length - 1]))[0];
      travel(pack, state, self, path, 'fwd');
      mover(self, path, `${name(self)} thunders ${path.length} tiles forward`);
      for (const t of path) {
        if (isSanctuary(pack, state, t) || b.tiles[t].finish) continue;
        for (const v of piecesAt(state, t)) if (v.seat !== seat && hits(v)) takeDown(pack, state, self, v, t);
      }
      if (state.phase !== 'over') land(pack, state, self, me.tile, { dir: 'fwd', capture: false, tileEffects: false });
      break;
    }

    case 'blast': {
      if (!me) break;
      const centers = (e.from === 'squad' ? state.players[seat].pieces.map((_, piece) => ({ seat, piece })) : [self])
        .filter((r) => !atHome(state, r) && !isFinished(state, r)).map((r) => pc(state, r).tile);
      const victims = resolveTargets(state, seat, { who: 'all' }, ctx)
        .filter((v) => centers.some((c) => distance(b, c, pc(state, v).tile, e.radius) <= e.radius) && !isSanctuary(pack, state, pc(state, v).tile));
      if (!victims.length) say('The blast hits only empty ground');
      for (const v of victims) if (hits(v)) takeDown(pack, state, self, v, pc(state, v).tile);
      break;
    }

    case 'petrify':
      for (const r of targets) {
        if (!hits(r)) continue;
        const q = pc(state, r);
        q.stone = e.turns + 1;
        q.snare = null;
        say(`${name(r)} turns to stone`, [r]);
      }
      break;

    case 'snare':
      for (const r of targets) {
        if (!hits(r)) continue;
        pc(state, r).snare = { need: e.need, turns: e.turns + 1 };
        say(`${name(r)} is tangled: only a ${e.need} or higher breaks free`, [r]);
      }
      break;

    case 'ward':
      if (!me) break;
      state.wards = state.wards.filter((w) => w.tile !== me.tile);
      state.wards.push({ tile: me.tile, owner: seat, turns: e.turns + 1 });
      say(`${name(self)} makes this ground holy: nobody can be taken here`);
      break;

    case 'revive': {
      const fallen = state.players[seat].pieces.flatMap((q, piece) =>
        piece !== origin && q.tile === b.starts[seat] && q.checkpoint !== b.starts[seat] ? [{ seat, piece }] : []);
      if (!fallen.length) say('Nobody waits to be raised');
      for (const r of fallen) {
        const q = pc(state, r);
        q.tile = q.checkpoint;
        mover(r, [q.tile], `${name(r)} rises again at the last checkpoint`);
      }
      break;
    }

    case 'recall': {
      if (!me) break;
      const reach = e.range ?? Infinity;
      const others = state.players[seat].pieces.flatMap((q, piece) =>
        piece !== origin && q.tile !== me.tile && !q.stone && !b.tiles[q.tile].finish && distance(b, me.tile, q.tile, reach) <= reach ? [{ seat, piece }] : []);
      // Behind: drop it on the tile just behind the caster, close but not yet bonded.
      const dest = e.behind
        ? b.tiles[me.tile].prev
          .filter((t) => (b.tiles[t].start === undefined || b.tiles[t].start === seat) && landable(state, seat, t))
          .sort((x, y) => progress(b, y) - progress(b, x))[0]
        : me.tile;
      const r = others
        .filter((x) => dest !== undefined && progress(b, pc(state, x).tile) < progress(b, dest))
        .sort((x, y) => progress(b, pc(state, x).tile) - progress(b, pc(state, y).tile))[0];
      if (!r || dest === undefined || !landable(state, seat, dest)) {
        say('No squadmate is close enough to reach');
        break;
      }
      pc(state, r).tile = dest;
      mover(r, [dest], e.behind ? `${name(r)} is carried right behind ${name(self)}` : `${name(r)} is lifted to ${name(self)}'s side`);
      checkBond(pack, state, r);
      break;
    }

    case 'join': {
      if (!me) break;
      const mine = progress(b, me.tile);
      const r = state.players[seat].pieces
        .flatMap((q, piece) => (piece !== origin && !b.tiles[q.tile].finish && progress(b, q.tile) > mine && distance(b, me.tile, q.tile, e.range) <= e.range ? [{ seat, piece }] : []))
        .sort((x, y) => progress(b, pc(state, x).tile) - progress(b, pc(state, y).tile))[0];
      if (!r) {
        say('No squadmate ahead is close enough');
        break;
      }
      const dest = pc(state, r).tile;
      travel(pack, state, self, [dest], 'fwd');
      mover(self, [dest], `${name(self)} leaps to ${name(r)}'s side`);
      checkBond(pack, state, self);
      break;
    }

    case 'swap_ally': {
      if (!me) break;
      const others = state.players[seat].pieces.flatMap((q, piece) =>
        piece !== origin && q.tile !== me.tile && !q.stone && !b.tiles[q.tile].finish ? [{ seat, piece }] : []);
      const r = others.sort((x, y) => progress(b, pc(state, y).tile) - progress(b, pc(state, x).tile))[0];
      if (!r) break;
      const q = pc(state, r);
      [me.tile, q.tile] = [q.tile, me.tile];
      mover(self, [me.tile], `${name(self)} swirls into ${name(r)}'s place`);
      mover(r, [q.tile], `${name(r)} swirls back`);
      break;
    }

    case 'gather': {
      const lead = { seat, piece: leadPiece(state, seat) };
      const from = pc(state, lead).tile;
      const dest = safeTile(pack, state, lead, e.range) ?? from;
      let last: PieceRef | null = null;
      state.players[seat].pieces.forEach((q, piece) => {
        if (q.stone || q.tile === dest || b.tiles[q.tile].finish || distance(b, from, q.tile, e.range) > e.range) return;
        const r = { seat, piece };
        travel(pack, state, r, [dest], 'fwd');
        mover(r, [dest], `${name(r)} rides the storm forward`);
        last = r;
      });
      if (last) checkBond(pack, state, last);
      break;
    }

    case 'if_element':
      if (seat === WORLD) break;
      runEffects(pack, state, seat, character(pack, state.players[seat].character).element === e.element ? e.then : e.else, ctx);
      break;

    case 'random':
      runEffects(pack, state, seat, pick(state, e.options), ctx);
      break;
  }
}
