import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { magicPack, sfPack } from "@ludo/themepack";
import { getWorld, isPartyWorld, listWorlds, saveWorld, selectedWorldId, selectWorld } from "./worlds";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());
describe("unified world library", () => {
  it("includes Magic, Fog City and Party in the same shelf and remembers either selection", () => {
    expect(listWorlds().map(world => world.pack.id)).toEqual([sfPack.id, magicPack.id, "party-ludo"]);
    selectWorld("party-ludo");
    expect(isPartyWorld(getWorld(selectedWorldId()).pack)).toBe(true);
    expect(isPartyWorld(magicPack)).toBe(false);
    expect(getWorld("missing").pack.id).toBe(sfPack.id);
  });
  it("keeps saved and imported themes alongside built-ins without replacing or duplicating them", () => {
    saveWorld({ ...magicPack, id: "my-world" }, "A custom theme");
    saveWorld({ ...magicPack, world: { ...magicPack.world, name: "Duplicate" } });
    const worlds = listWorlds();
    expect(worlds.map(world => world.pack.id)).toEqual([sfPack.id, magicPack.id, "party-ludo", "my-world"]);
    expect(getWorld(magicPack.id).pack.world.name).toBe(magicPack.world.name);
    expect(getWorld("my-world").prompt).toBe("A custom theme");
  });
});
