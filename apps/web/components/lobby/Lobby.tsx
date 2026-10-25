"use client";
import type { ThemePack } from "@ludo/engine";
import { DEFAULT_PROFILE, validateProfile, validatePlayerName, type PlayerProfile } from "@ludo/net";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { readRoomInvite, roomInviteUrl, type RoomInvite } from "@/lib/lobby/invites";
import { splitTitle } from "@/lib/worlds";
import { ProfileAvatar, ProfilePicker } from "./Profile";

export type RoomEntryDetails = { name: string; profile: PlayerProfile };
export type LobbyMember = { id: string; name: string; profile: PlayerProfile; connected: boolean; ready: boolean; host: boolean; playing: boolean; detail?: string };
export const lobbyButton = "rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-semibold transition hover:border-accent/50 hover:bg-primary/20 disabled:cursor-default disabled:opacity-40";
export const primaryButton = "font-display rounded-2xl bg-gradient-to-b from-[#fff1b8] via-[#fcd34d] to-[#f59e0b] px-6 py-4 font-black tracking-[.1em] text-[#1a0b2e] transition hover:brightness-110 disabled:cursor-default disabled:opacity-40";

export function OnlineShell({ connected, error, onLeave, children }: { connected: boolean; error?: string | null; onLeave?: () => void; children: ReactNode }) {
  return <div className="min-h-screen" style={{ background: "radial-gradient(ellipse at 90% 0%, #3b1d7a, transparent 50%), #0b0820" }}>
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-[max(env(safe-area-inset-top),20px)] sm:px-8">
      <nav className="mb-6 flex items-center justify-between gap-3">
        <Link href="/" onClick={onLeave} className="text-sm text-muted hover:text-ink">‹ Worlds</Link>
        <span role="status" className="flex items-center gap-2 text-xs text-muted"><span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "animate-pulse bg-amber-300"}`} />{connected ? "Connected" : "Connecting…"}</span>
      </nav>
      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</p>}
      {children}
    </main>
  </div>;
}

export function RoomEntry({ world, connected, pending, initialCode = "", initialMode = "host", onCreate, onJoin }: {
  world: ThemePack; connected: boolean; pending?: boolean; initialCode?: string; initialMode?: "host" | "join";
  onCreate: (entry: RoomEntryDetails) => void; onJoin: (entry: RoomEntryDetails, invite: RoomInvite) => void;
}) {
  const [name, setName] = useState(""), [profile, setProfile] = useState<PlayerProfile>(DEFAULT_PROFILE);
  const [code, setCode] = useState(initialCode), [mode, setMode] = useState(initialCode ? "join" : initialMode);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    try { setName(localStorage.getItem("ludo:name") ?? ""); setProfile(validateProfile(JSON.parse(sessionStorage.getItem("ludo:profile") ?? "null") ?? undefined)); } catch {}
  }, []);
  const enter = () => {
    try {
      if (!name.trim()) throw new Error("Enter your name so your friends can find you.");
      if (!connected) throw new Error("Still connecting. Try again in a moment.");
      if (busy) throw new Error("Your photo is still being prepared.");
      const entry = { name: validatePlayerName(name), profile };
      const invite = mode === "join" ? readRoomInvite(code) : null;
      try { localStorage.setItem("ludo:name", entry.name); sessionStorage.setItem("ludo:profile", JSON.stringify(profile)); } catch {}
      setError("");
      if (invite) onJoin(entry, invite); else onCreate(entry);
    } catch (e) { setError((e as Error).message); }
  };
  return <section className="glass rounded-3xl p-5 sm:p-8">
    <p className="text-xs font-semibold uppercase tracking-[.25em] text-accent">{splitTitle(world.world.name)[0]}</p>
    <h1 className="font-display mt-2 text-3xl font-black text-gold sm:text-4xl">Play with friends</h1>
    <p className="mt-3 text-sm text-muted">Create a room and share the invite. Everyone joins on their own device.</p>
    <div className="mt-6 grid grid-cols-2 gap-3" role="group" aria-label="Room action">
      {(["host", "join"] as const).map(option => <button key={option} aria-pressed={mode === option} onClick={() => { setMode(option); setError(""); }} className={`${lobbyButton} ${mode === option ? "border-accent bg-primary/20 text-accent ring-1 ring-accent/40" : ""}`}>{option === "host" ? "Host a room" : "Join a room"}</button>)}
    </div>
    <label className="mt-6 block text-sm font-semibold" htmlFor="player-name">Your name</label>
    <input id="player-name" autoComplete="nickname" maxLength={18} value={name} onChange={e => setName(e.target.value)} placeholder="What should friends call you?" onKeyDown={e => { if (e.key === "Enter") enter(); }} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-accent" />
    <details className="mt-4"><summary className="cursor-pointer text-sm text-accent">Choose your profile</summary><div className="mt-3"><ProfilePicker value={profile} onChange={setProfile} onBusy={setBusy} /></div></details>
    {mode === "join" && <label className="mt-5 block text-sm font-semibold">Invite link or room code<input aria-label="Invite link or room code" autoCapitalize="none" autoComplete="off" spellCheck={false} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === "Enter") enter(); }} placeholder="Paste the invite from your friend" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-accent" /></label>}
    {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
    <button disabled={pending || busy} onClick={enter} className={`${primaryButton} mt-6 w-full`}>{pending ? "Please wait…" : mode === "host" ? "Create room" : "Join room"}</button>
  </section>;
}

function InviteCard({ world, code }: { world: ThemePack; code: string }) {
  const [url, setUrl] = useState(""), [message, setMessage] = useState("");
  useEffect(() => setUrl(roomInviteUrl(location.origin, world.id, code)), [world.id, code]);
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: `Join my ${splitTitle(world.world.name)[0]} game`, url }); setMessage("Invite shared."); }
      else { await navigator.clipboard.writeText(url); setMessage("Invite link copied."); }
    } catch (e) { if ((e as Error).name !== "AbortError") setMessage("Select and copy the invite link below."); }
  };
  return <section className="glass rounded-3xl p-5 sm:p-6">
    <p className="text-xs uppercase tracking-[.25em] text-muted">Room code</p>
    <output aria-label="Room code" className="font-display mt-2 block break-all text-3xl font-black tracking-[.15em] text-gold sm:text-4xl">{code}</output>
    <button onClick={() => void share()} className="mt-4 w-full rounded-xl bg-primary px-5 py-3 font-bold text-white">Share invite link</button>
    <label className="mt-4 block text-xs text-muted">Invite link<input readOnly aria-label="Invite link" value={url} onFocus={e => e.target.select()} className="mt-2 w-full rounded-lg border border-white/10 bg-black/25 p-2 text-xs text-ink" /></label>
    {message && <p role="status" className="mt-2 text-xs text-accent">{message}</p>}
  </section>;
}

export function RoomLobby({ world, code, members, meId, host, connected, pending, onReady, onStart, onLeave, onRemove, allowBots = false, settings, extra }: {
  world: ThemePack; code: string; members: LobbyMember[]; meId: string; host: boolean; connected: boolean; pending?: boolean; allowBots?: boolean;
  onReady: (ready: boolean) => void; onStart: () => void; onLeave: () => void; onRemove?: (id: string) => void; settings?: ReactNode; extra?: ReactNode;
}) {
  const me = members.find(m => m.id === meId), players = members.filter(m => m.playing);
  const canStart = players.length >= (allowBots ? 1 : 2) && players.every(m => m.connected && m.ready);
  return <div className="space-y-4 pb-40">
    <div><p className="text-xs uppercase tracking-[.25em] text-accent">{splitTitle(world.world.name)[0]}</p><h1 className="font-display mt-2 text-3xl font-bold">Your room</h1><p className="mt-2 text-sm text-muted">Invite your friends, then everyone presses Ready.</p></div>
    <InviteCard world={world} code={code} />
    <section className="glass rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3"><h2 className="font-display text-xl font-bold">Friends</h2><span className="text-sm text-muted">{players.length}/4 players</span></div>
      <ul className="mt-4 max-h-[45vh] space-y-2 overflow-y-auto" aria-label="Room players">{members.map(member => <li key={member.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 ${member.ready ? "border-accent/60 bg-accent/5" : "border-white/5 bg-black/20"}`}>
        <ProfileAvatar profile={member.profile} name={member.name} />
        <div className="min-w-0 flex-1"><p className="truncate font-semibold">{member.name}{member.id === meId ? " (you)" : ""}{member.host ? " · host" : ""}</p>{member.detail && <p className="text-xs text-muted">{member.detail}</p>}</div>
        <span className={`text-xs ${member.ready ? "text-accent" : "text-muted"}`}>{!member.connected ? "Reconnecting…" : !member.playing ? "Watching" : member.ready ? "✓ Ready" : "Not ready"}</span>
        {host && onRemove && member.id !== meId && <button disabled={!connected || pending} aria-label={`Remove ${member.name}`} className="text-xs text-rose-300" onClick={() => onRemove(member.id)}>Remove</button>}
      </li>)}</ul>
      {players.length < 2 && !allowBots && <p role="status" className="mt-4 text-sm text-muted">Waiting for a friend. Share the invite link to get started.</p>}
    </section>
    {settings}
    {extra}
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-bg/95 px-3 pt-3 backdrop-blur" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }} aria-label="Game controls">
      <div className="mx-auto max-w-3xl space-y-2 sm:px-8">
        <div className={`grid gap-2 ${host && me?.playing ? "sm:grid-cols-2" : ""}`}>
          {me?.playing && <button disabled={!connected || pending} aria-pressed={me.ready} onClick={() => onReady(!me.ready)} className={`w-full rounded-2xl border-2 px-5 py-4 font-bold transition disabled:opacity-40 ${me.ready ? "border-accent bg-accent/15 text-accent ring-1 ring-accent/40" : "border-white/15 bg-white/5"}`}>{me.ready ? "✓ Ready — click to cancel" : "I'm ready"}</button>}
          {host && <button disabled={!connected || pending || !canStart} onClick={onStart} className={`${primaryButton} w-full`}>Start game</button>}
        </div>
        {host ? !canStart && <p role="status" className="text-center text-xs text-muted">{players.length < 2 && !allowBots ? "Invite a friend to get started." : "Waiting for everyone to be connected and ready."}</p> : <p role="status" className="text-center text-xs text-muted">{me?.ready ? "Waiting for the host to start." : "Ready up when you're set to play."}</p>}
      </div>
    </div>
    <button onClick={onLeave} className={`${lobbyButton} w-full text-muted`}>Leave room</button>
  </div>;
}
