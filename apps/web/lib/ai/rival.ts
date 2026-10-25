"use client";
import { character, distance, members, piecesHome, progress, tileDef, type GameState, type ThemePack } from "@ludo/engine";
import { squadName } from "@/lib/squad";
import { callStudio } from "./studio";

/** Plain-language briefing of the current turn, so a language model can weigh the legal moves. */
export function briefing(pack: ThemePack, s: GameState) {
  const b = s.board;
  const me = s.players[s.turn];
  const name = (seat: number) => squadName(character(pack, s.players[seat].character));
  const pieceName = (seat: number, piece: number) => (members(character(pack, s.players[seat].character))[piece] ?? { name: name(seat) }).name;
  const need = pack.rules.winAt ?? 1;

  const situation = s.players.map((p) => {
    const c = character(pack, p.character);
    const where = p.pieces.map((q, i) => `${p.pieces.length > 1 ? `${pieceName(p.seat, i)} ` : ""}${b.tiles[q.tile].finish ? "home" : `${b.distToFinish[q.tile]} from the finish`}`);
    const bits = [
      `${squadName(c)}${p.seat === me.seat ? " (you)" : ""}: ${where.join(", ")}`,
      need > 1 ? `${piecesHome(s, p.seat)} of ${need} home` : "",
      `ultimate ${p.ult}/${c.ultimate.cost ?? "?"}`,
      p.pieces.some((q) => q.shield) ? "shielded" : "",
      p.captures ? `${p.captures} takedowns` : "",
    ];
    return bits.filter(Boolean).join(", ");
  });

  const options = s.moves.map((m) => {
    const from = me.pieces[m.piece].tile;
    const who = me.pieces.length > 1 ? `${pieceName(me.seat, m.piece)}: ` : "";
    if (b.tiles[m.to].finish) return `${who}Reach the finish${need > 1 ? " and bring one more home" : " and WIN the game"}.`;
    const gain = progress(b, m.to) - progress(b, from);
    const parts = [`${who}${m.dir === "fwd" ? "Forward" : "Backward"} ${m.path.length}`, `${gain >= 0 ? "+" : ""}${gain} progress`, `${b.distToFinish[m.to]} left`];
    if (m.captures.length) parts.push(`TAKES OUT ${m.captures.map(name).join(" & ")} (sends them back to the start)`);
    if (me.pieces.some((q, i) => i !== m.piece && q.tile === m.to)) parts.push("joins a squadmate: forms a bond nobody can land on");
    const def = tileDef(pack, s, m.to);
    if (def && def.base !== "normal") parts.push(`lands on ${def.name} (${def.category}): ${def.description.slice(0, 90)}`);
    if (b.tiles[m.to].checkpoint) parts.push("checkpoint");
    if (s.traps.some((t) => t.tile === m.to && t.owner !== me.seat)) parts.push("a rival's TRAP is here");
    if (def?.base !== "sanctuary") {
      const threats = s.players.filter((q) => q.seat !== me.seat && !m.captures.includes(q.seat) && q.pieces.some((x) => distance(b, x.tile, m.to, 6) <= 6));
      if (threats.length) parts.push(`in reach of ${threats.map((q) => name(q.seat)).join(" & ")}`);
    }
    return parts.join("; ");
  });

  return { situation, options };
}

/**
 * Asks Bitdeer which move to make: "pick" for a bot's own turn, "advise" for the Oracle.
 * Resolves null if the AI is slow or answers with anything but a legal move.
 */
export async function askRival(pack: ThemePack, s: GameState, mode: "pick" | "advise", timeoutMs: number) {
  if (s.phase !== "move" || s.moves.length < 2) return null;
  const c = character(pack, s.players[s.turn].character);
  const { situation, options } = briefing(pack, s);
  const j = await callStudio<{ pick: number; say: string }>(mode === "pick" ? "rival" : "oracle", "/api/rival", {
    mode,
    world: { name: pack.world.name, tagline: pack.world.tagline },
    me: { name: c.name, title: c.title, bio: c.bio },
    situation,
    options,
  }, timeoutMs);
  if (!j || !Number.isInteger(j.pick) || j.pick < 0 || j.pick >= s.moves.length) return null;
  return { pick: j.pick, say: j.say };
}
