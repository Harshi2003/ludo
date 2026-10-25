import { isBond, isSanctuary, legalMoves, piecesAt, progress, tileDef, type GameState, type ThemePack } from "@ludo/engine";
import { pieceCharacter } from "./squad";

/** Why a tapped tile isn't one of this turn's moves, in one short line (null: nothing worth saying). */
export function missHint(pack: ThemePack, state: GameState, tile: number): string | null {
  const me = state.turn;
  const roll = state.roll ?? 0;
  const rival = piecesAt(state, tile).find((r) => r.seat !== me);
  if (!rival) return `Only glowing tiles are moves. You rolled ${roll}.`;
  const name = pieceCharacter(pack, state, rival.seat, rival.piece).name;
  if (isSanctuary(pack, state, tile)) return `${name} is on ${tileDef(pack, state, tile)?.name ?? "safe ground"}. Nobody gets taken out there.`;
  if (isBond(state, rival.seat, tile)) return `${name} is in a bond. Nobody can land there.`;
  if (state.players[rival.seat].pieces[rival.piece].stone > 0) return `${name} is stone. Nobody can land there.`;
  for (let k = 1; k <= 6; k++) {
    if (k !== roll && legalMoves(pack, state, me, k).some((m) => m.to === tile)) return `You need a ${k} to reach ${name}. You rolled ${roll}.`;
  }
  const mine = state.players[me].pieces.map((q) => progress(state.board, q.tile));
  const oneWay = pack.rules.movement === "forward" || state.storm;
  if (oneWay && progress(state.board, tile) <= Math.min(...mine)) return `${name} is behind you, and every move goes forward.`;
  return `${name} is out of reach this turn.`;
}
