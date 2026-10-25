import type { ThemePack } from "@ludo/engine";
import { magicPack, sfPack, validatePack } from "@ludo/themepack";
import { partyPack } from "./party-ludo/data";

export interface WorldEntry {
  pack: ThemePack;
  createdAt: number;
  builtIn?: boolean;
  prompt?: string;
}

const KEY = "ludo:worlds";
const SELECTED = "ludo:world";
const BUILT_IN: WorldEntry[] = [sfPack, magicPack, partyPack].map((pack) => ({ pack, createdAt: 0, builtIn: true }));

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
  const entry = { pack, prompt, createdAt: Date.now() };
  list.push(entry);
  write(list);
  void fetch("/api/worlds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) }).catch(() => {});
}

export function deleteWorld(id: string) {
  write(read().filter((w) => w.pack.id !== id));
  if (selectedWorldId() === id) selectWorld(sfPack.id);
  void fetch(`/api/worlds?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
}

/**
 * Pulls in worlds the server saved (every AI world is stored there as soon as it's forged),
 * so they appear even if the tab was closed mid-forge or they were made on another device.
 * Returns true if the library changed.
 */
export async function syncWorlds(): Promise<boolean> {
  let remote: WorldEntry[];
  try {
    const res = await fetch("/api/worlds", { cache: "no-store" });
    if (!res.ok) return false;
    remote = ((await res.json()) as { worlds: WorldEntry[] }).worlds ?? [];
  } catch {
    return false;
  }
  const local = read();
  const byId = new Map(remote.filter((w) => w?.pack?.id && !BUILT_IN.some((b) => b.pack.id === w.pack.id)).map((w) => [w.pack.id, w]));
  // The server copy wins, so fixes made to a saved world reach browsers that already have it.
  let changed = false;
  const merged = local.map((w) => {
    const r = byId.get(w.pack.id);
    byId.delete(w.pack.id);
    if (!r || JSON.stringify(r.pack) === JSON.stringify(w.pack)) return w;
    changed = true;
    return { ...w, pack: r.pack };
  });
  const added = [...byId.values()].map(({ pack, prompt, createdAt }) => ({ pack, prompt, createdAt }));
  if (!changed && !added.length) return false;
  write([...merged, ...added]);
  return true;
}

export function selectedWorldId(): string {
  try {
    return localStorage.getItem(SELECTED) ?? sfPack.id;
  } catch {
    return sfPack.id;
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
