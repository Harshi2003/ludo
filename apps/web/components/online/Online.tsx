"use client";
import { applyTuning, loadTuning } from "@/lib/tuning";
import { useRoom } from "@/lib/net/useRoom";
import { getWorld, selectedWorldId, splitTitle } from "@/lib/worlds";
import { normalizeCode } from "@ludo/net";
import { validatePack } from "@ludo/themepack";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Emblem } from "../Emblem";
import Game, { type OnlineBinding } from "../game/Game";

const NAME_KEY = "ludo:name";

export default function Online() {
  const api = useRoom();
  const { room, you, pack, game, conn } = api;
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [intent, setIntent] = useState<"none" | "busy">("none");

  // Restore name, invite code from the link, and any seat we were in.
  useEffect(() => {
    let n = "";
    try { n = localStorage.getItem(NAME_KEY) ?? ""; } catch {}
    setName(n);
    const q = new URLSearchParams(location.search).get("room");
    if (q) setCode(normalizeCode(q));
    if (!q && api.hasSession()) api.resume(n || "Player");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (room) setIntent("none");
  }, [room]);
  useEffect(() => {
    if (api.error) setIntent("none");
  }, [api.error]);

  const rememberName = () => {
    const n = name.trim() || "Player";
    try { localStorage.setItem(NAME_KEY, n); } catch {}
    return n;
  };

  const createRoom = () => {
    const base = getWorld(selectedWorldId()).pack;
    const t = loadTuning(base);
    // Saved Lab tuning travels with the world when it still passes validation.
    const tuned = t ? applyTuning(base, t) : base;
    const p = validatePack(structuredClone(tuned)).ok ? tuned : base;
    setIntent("busy");
    api.create(rememberName(), p);
  };
  const joinRoom = () => {
    const c = normalizeCode(code);
    if (c.length !== 5) return;
    setIntent("busy");
    api.join(c, rememberName());
  };

  const binding = useMemo<OnlineBinding | null>(() => {
    if (!game || !room || !you) return null;
    return {
      initial: game.initial,
      feed: api.feed,
      mine: (seat) => room.seats?.[seat]?.owner === you.id,
      send: api.act,
      label: (seat) => {
        const s = room.seats?.[seat];
        const m = s?.owner ? room.members.find((x) => x.id === s.owner) : null;
        return { name: m?.name ?? null, covering: !!s?.covering };
      },
      onRematch: room.hostId === you.id ? api.rematch : undefined,
      error: api.error,
      clearError: api.clearError,
      conn,
    };
    // Rebuild only when the room roster/seat ownership or game epoch changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.epoch, room, you, api.error, conn]);

  if (pack && binding && game && room && room.status !== "lobby") {
    return <Game key={game.epoch} pack={pack} online={binding} onExit={() => { api.leave(); history.replaceState(null, "", "/online"); }} />;
  }

  const invite = room ? `${location.origin}/online?room=${room.code}` : "";
  const isHost = room && you && room.hostId === you.id;
  const me = room?.members.find((m) => m.id === you?.id);
  const taken = new Set(room?.members.filter((m) => m.id !== you?.id).map((m) => m.character));
  const [title, subtitle] = pack ? splitTitle(pack.world.name) : ["", undefined];

  return (
    <div className="min-h-full" style={{ background: "radial-gradient(ellipse at 30% -10%, #1e3a8a55, transparent 50%), radial-gradient(ellipse at 90% 10%, #3b1d7a, transparent 50%), #0b0820" }}>
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-[max(env(safe-area-inset-top),20px)] sm:px-8">
        <nav className="flex items-center justify-between py-2">
          <Link href="/" onClick={() => room && api.leave()} className="text-sm text-muted hover:text-ink">‹ Home</Link>
          <span className="flex items-center gap-2 text-xs text-muted">
            <span className={`h-2 w-2 rounded-full ${conn === "open" ? "bg-emerald-400" : conn === "offline" ? "bg-rose-400" : "animate-pulse bg-amber-300"}`} />
            {conn === "open" ? "Connected" : conn === "offline" ? "Server unreachable" : "Connecting…"}
          </span>
        </nav>

        <h1 className="font-display mt-4 text-4xl font-black sm:text-5xl"><span className="title-gradient">Play online</span></h1>
        <p className="mt-1 text-white/70">Invite friends with a link. Everyone plays on their own device, and bots fill the empty seats.</p>

        {api.error && (
          <div role="alert" className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            {api.error}
            <button onClick={api.clearError} aria-label="Dismiss" className="text-rose-200/70">✕</button>
          </div>
        )}
        {conn === "offline" && (
          <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            Can’t reach the game server. Start it with <code className="rounded bg-black/40 px-1">npm run dev -w @ludo/server</code>, or set NEXT_PUBLIC_WS_URL.
          </div>
        )}

        {!room ? (
          <section className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="glass rounded-3xl p-5 md:col-span-2">
              <label htmlFor="name" className="text-xs font-semibold uppercase tracking-[.25em] text-muted">Your name</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value.slice(0, 18))} placeholder="e.g. Sai"
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-lg outline-none focus:border-accent/60" />
            </div>
            <div className="glass rounded-3xl p-5">
              <h2 className="font-display text-xl font-bold">Host a room</h2>
              <p className="mt-1 text-sm text-muted">Plays your selected world: <b className="text-ink">{splitTitle(getWorld(selectedWorldId()).pack.world.name)[0]}</b></p>
              <button onClick={createRoom} disabled={conn !== "open" || intent === "busy"}
                className="font-display mt-4 w-full rounded-2xl py-3.5 text-lg font-black tracking-[.12em] text-[#1a0b2e] disabled:opacity-50"
                style={{ background: "linear-gradient(180deg,#fff1b8,#fcd34d 40%,#f59e0b)" }}>CREATE ROOM</button>
            </div>
            <div className="glass rounded-3xl p-5">
              <h2 className="font-display text-xl font-bold">Join a room</h2>
              <p className="mt-1 text-sm text-muted">Enter the 5-letter code from your friend.</p>
              <div className="mt-4 flex gap-2">
                <input value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} placeholder="ABCDE" aria-label="Room code"
                  onKeyDown={(e) => e.key === "Enter" && joinRoom()}
                  className="font-display w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-center text-2xl tracking-[.4em] uppercase outline-none focus:border-accent/60" />
                <button onClick={joinRoom} disabled={conn !== "open" || code.length !== 5 || intent === "busy"}
                  className="rounded-xl bg-primary px-5 font-bold text-white disabled:opacity-50">Join</button>
              </div>
            </div>
          </section>
        ) : (
          pack && (
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-4">
              <div className="glass flex flex-wrap items-center justify-between gap-4 rounded-3xl p-5">
                <div>
                  <div className="text-xs uppercase tracking-[.25em] text-muted">Room code</div>
                  <div className="font-display text-5xl font-black tracking-[.3em] text-gold">{room.code}</div>
                  <div className="mt-1 text-sm text-muted">{title}{subtitle ? ` · ${subtitle}` : ""}</div>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <button onClick={async () => {
                    try {
                      if (navigator.share) await navigator.share({ title: "Join my AI Ludo game", url: invite });
                      else { await navigator.clipboard.writeText(invite); setCopied(true); setTimeout(() => setCopied(false), 2000); }
                    } catch {}
                  }} className="rounded-xl bg-primary px-5 py-3 font-bold text-white">{copied ? "Link copied ✓" : "Share invite link"}</button>
                  <span className="max-w-[280px] truncate text-xs text-muted">{invite}</span>
                </div>
              </div>

              <div className="glass rounded-3xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-xl font-bold">Players</h2>
                  {isHost ? (
                    <div className="flex rounded-xl bg-black/30 p-1" role="radiogroup" aria-label="Seats">
                      {([2, 3, 4] as const).map((n) => (
                        <button key={n} role="radio" aria-checked={room.playerCount === n} onClick={() => api.players(n)}
                          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${room.playerCount === n ? "bg-primary text-white" : "text-muted"}`}>{n} seats</button>
                      ))}
                    </div>
                  ) : <span className="text-sm text-muted">{room.playerCount} seats</span>}
                </div>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  <AnimatePresence initial={false}>
                    {room.members.map((m) => {
                      const c = pack.characters.find((x) => x.id === m.character);
                      return (
                        <motion.li key={m.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                          className="flex items-center gap-3 rounded-2xl bg-black/25 p-3">
                          {c ? <Emblem c={c} size={42} portrait={pack.art.portraits?.[c.id]} /> : <div className="grid h-[42px] w-[42px] place-items-center rounded-full bg-white/5 text-muted">?</div>}
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold">{m.name}{m.id === you?.id ? " (you)" : ""}{m.id === room.hostId ? " · host" : ""}</div>
                            <div className="text-xs text-muted">{c ? c.name : "Watching"}{m.connected ? "" : " · away"}</div>
                          </div>
                          <span className={`h-2 w-2 rounded-full ${m.connected ? "bg-emerald-400" : "bg-white/20"}`} />
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                  {Array.from({ length: Math.max(0, room.playerCount - room.members.filter((m) => m.character).length) }, (_, i) => (
                    <li key={`bot${i}`} className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 p-3 text-sm text-muted">🤖 A bot will take this seat</li>
                  ))}
                </ul>
              </div>

              <div className="glass rounded-3xl p-5">
                <h2 className="font-display text-xl font-bold">Your champion</h2>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {pack.characters.map((c) => {
                    const mine = me?.character === c.id;
                    const blocked = taken.has(c.id);
                    return (
                      <button key={c.id} disabled={blocked} onClick={() => api.pick(mine ? null : c.id)} aria-pressed={mine}
                        className={`rounded-2xl border p-3 text-center transition disabled:opacity-35 ${mine ? "bg-white/10" : "border-white/10 hover:bg-white/5"}`}
                        style={mine ? { borderColor: c.color, boxShadow: `0 0 24px -6px ${c.color}` } : undefined}>
                        <div className="mx-auto w-fit"><Emblem c={c} size={58} glow={mine} portrait={pack.art.portraits?.[c.id]} /></div>
                        <div className="font-display mt-2 font-bold" style={{ color: c.color }}>{c.name}</div>
                        <div className="text-[11px] text-muted">{blocked ? "Taken" : mine ? "Tap to watch instead" : c.role}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {isHost ? (
                <button onClick={api.start} className="font-display w-full rounded-2xl py-4 text-lg font-black tracking-[.15em] text-[#1a0b2e]"
                  style={{ background: "linear-gradient(180deg,#fff1b8,#fcd34d 40%,#f59e0b)" }}>START THE BATTLE</button>
              ) : (
                <div className="rounded-2xl bg-white/5 py-4 text-center text-muted">Waiting for the host to start…</div>
              )}
              <button onClick={api.leave} className="w-full py-2 text-sm text-muted hover:text-ink">Leave room</button>
            </motion.section>
          )
        )}
      </main>
    </div>
  );
}
