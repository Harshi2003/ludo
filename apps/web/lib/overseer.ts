import {
  abilityDef, canUseAbility, distance, isBond, piecesAt, progress, scoreMove, tileDef,
  type GameState, type MoveOption, type ThemePack,
} from "@ludo/engine";
import { pieceCharacter } from "./squad";

/** One legal move in plain words. */
export interface MovePlan {
  index: number;
  icon: string;
  title: string;
  detail: string;
  tone: "good" | "bad" | "neutral";
  /** Rivals who could reach this tile next turn. */
  threats: string[];
  score: number;
}

const names = (pack: ThemePack, s: GameState, tile: number, seat: number) =>
  piecesAt(s, tile).filter((r) => r.seat !== seat).map((r) => pieceCharacter(pack, s, r.seat, r.piece).name);

function whereCaptured(pack: ThemePack) {
  const mode = pack.rules.capture?.mode ?? "checkpoint";
  return mode === "start" ? `all the way back to ${pack.world.startName}` : mode === "tow" ? `back ${pack.rules.capture?.back ?? 4} tiles` : mode === "stun" ? "out of their next turn" : "back to their last checkpoint";
}

export function describeMove(pack: ThemePack, s: GameState, m: MoveOption, index: number): MovePlan {
  const b = s.board;
  const me = s.players[s.turn];
  const from = me.pieces[m.piece].tile;
  const gain = progress(b, m.to) - progress(b, from);
  // scoreMove rolls a little noise from the game's dice stream, so it gets a copy.
  const score = scoreMove(pack, { ...s }, m, "normal");
  const def = tileDef(pack, s, m.to);
  const safe = def?.base === "sanctuary";
  const oneWay = pack.rules.movement === "forward" || s.storm;
  const threats = safe || b.tiles[m.to].finish ? [] : s.players
    .filter((p) => p.seat !== me.seat && !m.captures.includes(p.seat))
    .flatMap((p) => p.pieces.map((q, i) => ({ q, name: pieceCharacter(pack, s, p.seat, i).name })))
    // On one-way streets only rivals behind can come for you.
    .filter(({ q }) => (!oneWay || progress(b, q.tile) < progress(b, m.to)) && distance(b, q.tile, m.to, 6) <= 6)
    .map(({ name }) => name);
  const steps = `${m.dir === "fwd" ? "Forward" : "Back"} ${m.path.length}`;
  const who = me.pieces.length > 1 ? `${pieceCharacter(pack, s, me.seat, m.piece).name}: ` : "";
  const base = { index, threats, score };

  if (b.tiles[m.to].finish) {
    const need = pack.rules.winAt ?? 1;
    return { ...base, icon: "🏁", title: `${who}Reach ${pack.world.finish}`, detail: need > 1 ? "One more piece home." : "You win the game!", tone: "good" };
  }
  if (m.captures.length) {
    return { ...base, icon: "⚔", title: `${who}Take out ${names(pack, s, m.to, me.seat).join(" & ")}`, detail: `Sends them ${whereCaptured(pack)}.`, tone: "good" };
  }
  if (me.pieces.some((q, i) => i !== m.piece && q.tile === m.to) && !isBond(s, me.seat, from)) {
    return { ...base, icon: "⛓", title: `${who}Form a bond`, detail: "Two of yours on one tile: nobody can land there.", tone: "good" };
  }
  if (def && def.base !== "normal") {
    const tone = def.category === "helpful" || safe ? "good" : def.category === "harmful" ? "bad" : "neutral";
    return { ...base, icon: tone === "good" ? "✦" : tone === "bad" ? "⚠" : "?", title: `${who}${def.name}`, detail: def.description, tone };
  }
  return { ...base, icon: m.dir === "fwd" ? "→" : "←", title: `${who}${steps}`, detail: gain > 0 ? `A plain tile, ${b.distToFinish[m.to]} from the finish.` : "A plain tile.", tone: "neutral" };
}

/** Every move, best first, with a short reason for the top pick. */
export function planMoves(pack: ThemePack, s: GameState): { plans: MovePlan[]; why: string } {
  const plans = s.moves.map((m, i) => describeMove(pack, s, m, i)).sort((a, b) => b.score - a.score);
  const best = plans[0];
  if (!best) return { plans, why: "" };
  const m = s.moves[best.index];
  const why = s.board.tiles[m.to].finish ? "Go home. Nothing beats that."
    : m.captures.length ? `${best.title.replace(/^.*?Take out /, "")} goes ${whereCaptured(pack)}. Strike!`
    : best.tone === "good" ? `${best.title.replace(/^.*?: /, "")} is on your side here.`
    : best.threats.length === 0 && plans.some((p) => p.threats.length) ? "It keeps you out of every rival's reach."
    : plans.length > 1 && plans.every((p) => p === best || p.score < best.score - 10) ? "It gets you furthest with the least risk."
    : "Steady progress toward the finish.";
  return { plans, why };
}

/** What to do before rolling, in one line. */
export function rollAdvice(pack: ThemePack, s: GameState): { title: string; detail: string; cast?: { which: "active" | "ultimate"; piece: number } } {
  const p = s.players[s.turn];
  if (canUseAbility(pack, s, "ultimate")) {
    const u = abilityDef(pack, s, "ultimate");
    return { title: `${u.name} is charged`, detail: `${u.description} Unleash it before you roll.`, cast: { which: "ultimate", piece: 0 } };
  }
  const ready = p.pieces.map((_, i) => i).filter((i) => canUseAbility(pack, s, "active", i));
  // A revive with nobody fallen is wasted: hold it.
  const fallen = p.pieces.some((q) => q.tile === s.board.starts[p.seat]);
  const useful = ready.find((i) => fallen || !abilityDef(pack, s, "active", p.seat, i).effects.every((e) => e.op === "revive"));
  if (useful !== undefined) {
    const a = abilityDef(pack, s, "active", p.seat, useful);
    return { title: `${a.name} is ready`, detail: `${a.description} Cast it, then roll.`, cast: { which: "active", piece: useful } };
  }
  if (ready.length) {
    const a = abilityDef(pack, s, "active", p.seat, ready[0]);
    return { title: "Roll the dice", detail: `Save ${a.name} until one of yours falls: ${a.description}` };
  }
  const a = abilityDef(pack, s, "active", p.seat, 0);
  const cd = p.pieces[0].cooldown;
  return { title: "Roll the dice", detail: cd > 0 ? `${a.name} is ready in ${cd} turn${cd > 1 ? "s" : ""}: ${a.description}` : `${a.name} needs a target in range: ${a.description}` };
}
