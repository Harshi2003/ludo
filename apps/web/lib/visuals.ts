import type { Glyph, ThemePack, TileTypeDef } from "@ludo/engine";

/** Players learn one rule: green helps, red hurts, gold is a gamble. */
export const CATEGORY_COLOR = {
  helpful: "#34d399",
  harmful: "#fb4f6d",
  neutral: "#fbbf24",
  structural: "#a49cc9",
} as const;

export const ELEMENT_COLOR: Record<string, string> = {
  fire: "#ff7a3d",
  water: "#38bdf8",
  earth: "#84cc16",
  air: "#d8b4fe",
};

const BASE_GLYPH: Record<TileTypeDef["base"], Glyph> = {
  normal: "none",
  sanctuary: "moon",
  portal: "portal",
  lightning: "bolt",
  shield: "shield",
  curse: "eye",
  trap: "skull",
  swap: "swap",
  mystery: "question",
  speed: "chevrons",
  frost: "snowflake",
  elemental: "gem",
};

export const ELEMENT_GLYPH: Record<string, Glyph> = { fire: "flame", water: "drop", earth: "leaf", air: "wind" };

export function tileGlyph(def: TileTypeDef): Glyph {
  return def.glyph ?? BASE_GLYPH[def.base] ?? "gem";
}

export function tileColor(def: TileTypeDef): string {
  if (def.base === "sanctuary") return "#fde68a";
  if (def.base === "portal") return "#b794ff";
  if (def.element) return ELEMENT_COLOR[def.element] ?? CATEGORY_COLOR.neutral;
  return CATEGORY_COLOR[def.category];
}

export function zoneColor(pack: ThemePack, zone: number): string {
  const z = pack.zones[zone];
  return (z && pack.art.zoneColors[z.id]) ?? pack.art.palette.primary;
}
