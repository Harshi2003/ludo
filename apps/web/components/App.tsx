"use client";
import { magicPack } from "@ludo/themepack";
import { useEffect, useMemo, useState } from "react";
import { applyTuning, loadTuning } from "@/lib/tuning";
import { getWorld, listWorlds, selectedWorldId, selectWorld, type WorldEntry } from "@/lib/worlds";
import Game, { type GameConfig } from "./game/Game";
import { Home } from "./Home";

export default function App() {
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [round, setRound] = useState(0);
  const [worlds, setWorlds] = useState<WorldEntry[]>(() => listWorlds());
  const [worldId, setWorldId] = useState(() => selectedWorldId());
  const base = worlds.find((w) => w.pack.id === worldId)?.pack ?? magicPack;

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    }
    // ?watch=N starts an all-bot game with N players (spectator demo).
    const q = new URLSearchParams(location.search);
    const n = Number(q.get("watch"));
    if (n >= 2 && n <= 4) {
      setConfig({
        seed: Number(q.get("seed")) || (Math.random() * 2 ** 31) | 0,
        players: getWorld(selectedWorldId()).pack.characters.slice(0, n).map((c) => ({ character: c.id, bot: q.get("human") !== c.id })),
      });
    }
  }, []);

  // Settings saved from the Balance Lab apply to every new game.
  const pack = useMemo(() => {
    const t = loadTuning(base);
    return t ? applyTuning(base, t) : base;
  }, [config, base]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!config) {
    return (
      <Home
        pack={base}
        worlds={worlds}
        onStart={setConfig}
        onSelectWorld={(id) => { selectWorld(id); setWorldId(id); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        onWorldsChanged={() => { setWorlds(listWorlds()); setWorldId(selectedWorldId()); }}
      />
    );
  }
  return (
    <Game
      key={round}
      pack={pack}
      config={config}
      onExit={() => setConfig(null)}
      onRematch={() => {
        setConfig({ ...config, seed: (Math.random() * 2 ** 31) | 0 });
        setRound((r) => r + 1);
      }}
    />
  );
}
