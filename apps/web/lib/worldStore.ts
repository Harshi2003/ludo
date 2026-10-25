import type { ThemePack } from "@ludo/engine";
import { validatePack } from "@ludo/themepack";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Every AI-made world is written here the moment it's forged, so it survives a
 * closed tab and shows up in the world library on every device that uses this server.
 */
const DIR = process.env.WORLDS_DIR ?? path.join(process.cwd(), "data", "worlds");

export interface StoredWorld {
  pack: ThemePack;
  prompt?: string;
  createdAt: number;
  provider?: string;
  model?: string;
}

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;
const file = (id: string) => {
  if (!SAFE_ID.test(id)) throw new Error("Bad world id");
  return path.join(DIR, `${id}.json`);
};

export async function storeWorld(w: StoredWorld) {
  await mkdir(DIR, { recursive: true });
  await writeFile(file(w.pack.id), JSON.stringify(w, null, 2));
}

export async function listStoredWorlds(): Promise<StoredWorld[]> {
  let names: string[];
  try {
    names = await readdir(DIR);
  } catch {
    return [];
  }
  const out: StoredWorld[] = [];
  for (const n of names.filter((n) => n.endsWith(".json"))) {
    try {
      const w = JSON.parse(await readFile(path.join(DIR, n), "utf8")) as StoredWorld;
      const v = validatePack(w.pack);
      if (v.ok) out.push({ ...w, pack: v.pack });
    } catch {
      // A damaged file shouldn't hide the rest of the library.
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function removeStoredWorld(id: string) {
  await rm(file(id), { force: true });
}
