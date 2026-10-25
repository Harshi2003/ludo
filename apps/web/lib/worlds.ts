import type { ThemePack } from "@ludo/engine";
import { magicPack, validatePack } from "@ludo/themepack";
import { partyPack } from "./party-ludo/data";

export interface WorldEntry {
  pack: ThemePack;
  createdAt: number;
  builtIn?: boolean;
  prompt?: string;
}

const KEY = "ludo:worlds";
const SELECTED = "ludo:world";
const BUILT_IN: WorldEntry[] = [magicPack, partyPack].map(pack => ({ pack, createdAt: 0, builtIn: true }));

export const isPartyWorld = (pack: ThemePack) => pack.id === partyPack.id;

function read(): WorldEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as WorldEntry[];
    return Array.isArray(list) ? list.filter((w) => w?.pack?.id) : [];
  } catch {
    return [];
  }
}

function write(list: WorldEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    throw new Error("Browser storage is full. Delete a world and try again.");
  }
}

export function listWorlds(): WorldEntry[] {
  return [...BUILT_IN, ...read().filter(w => !BUILT_IN.some(b => b.pack.id === w.pack.id)).sort((a, b) => b.createdAt - a.createdAt)];
}

export function getWorld(id: string | null | undefined): WorldEntry {
  return listWorlds().find((w) => w.pack.id === id) ?? BUILT_IN[0];
}

export function saveWorld(pack: ThemePack, prompt?: string) {
  const list = read().filter((w) => w.pack.id !== pack.id);
  list.push({ pack, prompt, createdAt: Date.now() });
  write(list);
}

export function deleteWorld(id: string) {
  write(read().filter((w) => w.pack.id !== id));
  if (selectedWorldId() === id) selectWorld(magicPack.id);
}

export function selectedWorldId(): string {
  try {
    return localStorage.getItem(SELECTED) ?? magicPack.id;
  } catch {
    return magicPack.id;
  }
}

export function selectWorld(id: string) {
  try {
    localStorage.setItem(SELECTED, id);
  } catch {}
}

export function exportWorld(pack: ThemePack) {
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${pack.id}.ludo.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Imports a shared world file; it must pass the same validation as AI output. */
export async function importWorld(file: File): Promise<ThemePack> {
  const json = JSON.parse(await file.text());
  const v = validatePack(json);
  if (!v.ok) throw new Error(`Not a valid world: ${v.errors.slice(0, 3).join("; ")}`);
  if (listWorlds().some((w) => w.builtIn && w.pack.id === v.pack.id)) v.pack.id = `${v.pack.id}-copy`;
  saveWorld(v.pack);
  return v.pack;
}

/** "Magic Ludo: The Battle…" → ["Magic Ludo", "The Battle…"] */
export function splitTitle(name: string): [string, string | undefined] {
  const i = name.indexOf(":");
  return i < 0 ? [name, undefined] : [name.slice(0, i).trim(), name.slice(i + 1).trim()];
}
