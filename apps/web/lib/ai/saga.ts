import { character, members, piecesHome, playerProgress, type GameState, type ThemePack } from "@ludo/engine";
import { squadName } from "@/lib/squad";

export interface Saga {
  title: string;
  story: string;
  mvp: string;
}

const BIG = new Set(["capture", "blocked_capture", "ultimate", "world_event", "storm", "home", "win"]);

/** What /api/saga needs to retell a finished match: standings and the big moments, in order. */
export function sagaRequest(pack: ThemePack, s: GameState) {
  const ranked = [...s.players].sort((a, b) => (a.seat === s.winner ? -1 : b.seat === s.winner ? 1
    : piecesHome(s, b.seat) - piecesHome(s, a.seat) || playerProgress(s, b.seat) - playerProgress(s, a.seat)));
  return {
    world: { name: pack.world.name, tagline: pack.world.tagline, finish: pack.world.finish },
    rounds: s.round,
    players: ranked.map((p, i) => {
      const c = character(pack, p.character);
      const crew = c.squad?.length ? ` (${members(c).map((m) => m.name).join(", ")})` : "";
      return `${i === 0 ? "WINNER " : ""}${squadName(c)}${crew}, ${c.title}${p.bot ? "" : " (human player)"}: ${p.captures} takedowns, taken out ${p.timesCaptured} times`;
    }),
    moments: s.events.filter((e) => BIG.has(e.kind)).map((e) => e.msg),
  };
}
