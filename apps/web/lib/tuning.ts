import type { ThemePack } from "@ludo/engine";
import { scaleCharacterPower } from "@ludo/themepack";

export interface Tuning {
  chars: Record<string, { cooldown: number; cost: number; power: number }>;
  stormRound: { 2: number; 3: number; 4: number };
  extraRollOnSix: boolean;
  charge: { turn: number; capture: number; captured: number };
}

export function defaultTuning(pack: ThemePack): Tuning {
  return {
    chars: Object.fromEntries(
      pack.characters.map((c) => [c.id, { cooldown: c.active.cooldown ?? 3, cost: c.ultimate.cost ?? 8, power: 100 }]),
    ),
    stormRound: { ...pack.rules.stormRound },
    extraRollOnSix: pack.rules.extraRollOnSix,
    charge: { ...pack.rules.ultimateCharge },
  };
}

export function applyTuning(pack: ThemePack, t: Tuning): ThemePack {
  const p = structuredClone(pack);
  for (const c of p.characters) {
    const ct = t.chars[c.id];
    if (!ct) continue;
    c.active.cooldown = ct.cooldown;
    c.ultimate.cost = ct.cost;
    scaleCharacterPower(c, ct.power);
  }
  p.rules.stormRound = { ...t.stormRound };
  p.rules.extraRollOnSix = t.extraRollOnSix;
  p.rules.ultimateCharge = { ...t.charge };
  return p;
}

export function isDefault(pack: ThemePack, t: Tuning) {
  return JSON.stringify(t) === JSON.stringify(defaultTuning(pack));
}


export function loadTuning(pack: ThemePack): Tuning | null {
  try {
    const t = JSON.parse(localStorage.getItem(`ludo:tuning:${pack.id}`) ?? "null") as Tuning | null;
    return t && t.chars && Object.keys(t.chars).every((id) => pack.characters.some((c) => c.id === id)) ? t : null;
  } catch {
    return null;
  }
}

export function saveTuning(pack: ThemePack, t: Tuning | null) {
  const key = `ludo:tuning:${pack.id}`;
  try {
    if (t) localStorage.setItem(key, JSON.stringify(t));
    else localStorage.removeItem(key);
  } catch {}
}
