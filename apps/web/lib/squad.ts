import { character, members, type CharacterDef, type GameState, type ThemePack } from "@ludo/engine";

/** One squad member dressed as a full character (house colour, element and powers), for emblems and portraits. */
export function memberAsCharacter(c: CharacterDef, piece: number): CharacterDef {
  const m = members(c)[piece] ?? c;
  return m === c ? c : { ...c, id: m.id, name: m.name, title: m.title, bio: m.bio, glyph: m.glyph ?? c.glyph, active: m.active };
}

export function pieceCharacter(pack: ThemePack, state: GameState, seat: number, piece = 0): CharacterDef {
  return memberAsCharacter(character(pack, state.players[seat].character), piece);
}

/** The house name for squads, the character's own name for a lone champion. */
export const squadName = (c: CharacterDef) => (c.squad?.length && c.house) || c.name;

export const portraitOf = (pack: ThemePack, c: CharacterDef) => pack.art.portraits?.[c.id];
