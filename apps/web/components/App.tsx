"use client";
import { magicPack } from "@ludo/themepack";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { applyTuning, loadTuning } from "@/lib/tuning";
import { getWorld, isPartyWorld, listWorlds, selectedWorldId, selectWorld, syncWorlds, type WorldEntry } from "@/lib/worlds";
import Game from "./game/Game";
import { Home } from "./Home";
import type { LocalSession } from "./lobby/LocalSetup";

const PartyMatch = dynamic(() => import("./party-ludo/PartyLudo").then(module => module.Match));

export default function App({ initialWorldId }: { initialWorldId?: string } = {}) {
  const [session, setSession] = useState<LocalSession | null>(null);
  const config = session?.kind === "classic" ? session.config : null;
  const [round, setRound] = useState(0);
  const [worlds, setWorlds] = useState<WorldEntry[]>(() => listWorlds());
  const [worldId, setWorldId] = useState(() => initialWorldId ?? selectedWorldId());
  const base = worlds.find((w) => w.pack.id === worldId)?.pack ?? magicPack;

  useEffect(() => {
    void syncWorlds().then((changed) => changed && setWorlds(listWorlds()));
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    }
    // ?watch=N starts an all-bot game with N players (spectator demo).
    const q = new URLSearchParams(location.search);
    const requested = initialWorldId ?? q.get("world");
    if (requested) { const world = getWorld(requested); selectWorld(world.pack.id); setWorldId(world.pack.id); }
    const n = Number(q.get("watch"));
    if (n >= 2 && n <= 4) {
      const selected = getWorld(selectedWorldId()).pack;
      const demoPack = isPartyWorld(selected) ? magicPack : selected;
      setWorldId(demoPack.id);
      setSession({ kind: "classic", config: {
        seed: Number(q.get("seed")) || (Math.random() * 2 ** 31) | 0,
        players: demoPack.characters.slice(0, n).map((c) => ({ character: c.id, bot: q.get("human") !== c.id })),
      } });
    }
  }, [initialWorldId]);

  // Settings saved from the Balance Lab apply to every new game.
  const pack = useMemo(() => {
    if (isPartyWorld(base)) return base;
    const t = loadTuning(base);
    return t ? applyTuning(base, t) : base;
  }, [config, base]); // eslint-disable-line react-hooks/exhaustive-deps

  if (session?.kind === "party") return <PartyMatch key={`${session.config.seed}-${session.config.players}`} initial={session.config} onExit={() => setSession(null)} onRematch={() => setSession({ ...session, config: { ...session.config, seed: Math.floor(Math.random() * 2 ** 31) } })} />;
  if (!config) {
    return (
      <Home
        pack={base}
        worlds={worlds}
        onStart={setSession}
        onSelectWorld={(id) => { selectWorld(id); setWorldId(id); history.replaceState(null, "", `/?world=${encodeURIComponent(id)}`); }}
        onWorldsChanged={() => { setWorlds(listWorlds()); setWorldId(selectedWorldId()); }}
      />
    );
  }
  return (
    <Game
      key={round}
      pack={pack}
      config={config}
      onExit={() => setSession(null)}
      onRematch={() => {
        setSession({ kind: "classic", config: { ...config, seed: (Math.random() * 2 ** 31) | 0 } });
        setRound((r) => r + 1);
      }}
    />
  );
}
