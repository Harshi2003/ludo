"use client";
import { useState } from "react";
import type { ThemePack } from "@ludo/engine";
import { isPartyWorld } from "@/lib/worlds";
import type { SpiceLevel } from "@/lib/party-ludo/prompts";
import type { GameConfig } from "../game/Game";
import { Emblem } from "../Emblem";
import { SpicePicker } from "./SpicePicker";
import { primaryButton } from "./Lobby";

export type LocalSession = { kind: "classic"; config: GameConfig } | { kind: "party"; config: { players: number; seed: number; maxSpiceLevel: SpiceLevel } };

export function LocalSetup({ pack, onStart }: { pack: ThemePack; onStart: (session: LocalSession) => void }) {
  const party = isPartyWorld(pack);
  const [count, setCount] = useState(2), [spice, setSpice] = useState<SpiceLevel>(1);
  const [seats, setSeats] = useState(() => pack.characters.map(c => ({ character: c.id, bot: false })));
  const pick = (index: number, character: string) => setSeats(previous => {
    const next = previous.map(s => ({ ...s }));
    const holder = next.findIndex(s => s.character === character);
    if (holder >= 0) next[holder].character = next[index].character;
    next[index].character = character;
    return next;
  });
  const start = () => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    onStart(party ? { kind: "party", config: { players: count, seed, maxSpiceLevel: spice } } : { kind: "classic", config: { seed, players: seats.slice(0, count) } });
  };
  return <div className="mt-5 space-y-4">
    <p className="text-sm text-muted">Pass one device between friends. Everyone plays as a human by default.</p>
    <div className="flex gap-2" role="group" aria-label="Number of players">{[2, 3, 4].map(n => <button key={n} aria-pressed={count === n} onClick={() => setCount(n)} className={`rounded-xl border px-4 py-2 text-sm ${count === n ? "border-accent bg-primary/20 text-accent" : "border-white/10 bg-white/5 text-muted"}`}>{n} players</button>)}</div>
    {party ? <SpicePicker value={spice} onChange={setSpice} /> : <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{seats.slice(0, count).map((seat, i) => {
      const c = pack.characters.find(c => c.id === seat.character)!;
      return <div key={i} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-center">
        <div className="mx-auto w-fit"><Emblem c={c} size={56} portrait={pack.art.portraits?.[c.id]} /></div>
        <label className="mt-3 block text-xs text-muted">Player {i + 1}<select aria-label={`Champion for player ${i + 1}`} value={seat.character} onChange={e => pick(i, e.target.value)} className="mt-2 block w-full rounded-lg bg-surface p-2 text-sm text-ink">{pack.characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button aria-pressed={seat.bot} onClick={() => setSeats(previous => previous.map((s, index) => index === i ? { ...s, bot: !s.bot } : s))} className="mt-3 text-xs text-muted">{seat.bot ? "🤖 Bot · switch to human" : "Human · switch to bot"}</button>
      </div>;
    })}</div>}
    <button onClick={start} className={`${primaryButton} w-full`}>Start local game</button>
  </div>;
}
