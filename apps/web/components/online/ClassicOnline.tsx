"use client";
import { useEffect, useMemo, useRef } from "react";
import { validatePack } from "@ludo/themepack";
import { DEFAULT_PROFILE } from "@ludo/net";
import { useRoom } from "@/lib/net/useRoom";
import { applyTuning, loadTuning } from "@/lib/tuning";
import { roomInviteUrl } from "@/lib/lobby/invites";
import type { OnlineWorldProps } from "@/lib/lobby/types";
import { OnlineShell, RoomEntry, RoomLobby, lobbyButton } from "../lobby/Lobby";
import { Emblem } from "../Emblem";
import Game, { type OnlineBinding } from "../game/Game";

export default function ClassicOnline({ world, initialCode, initialMode, joinRequest, onCrossJoin, onJoinHandled }: OnlineWorldProps) {
  const api = useRoom(initialCode);
  const { room, you, game, pack, conn } = api;
  const connected = conn === "open", handled = useRef<object | null>(null);
  useEffect(() => {
    if (!joinRequest || joinRequest.invite.engine !== "classic" || !connected || handled.current === joinRequest) return;
    handled.current = joinRequest;
    api.join(joinRequest.invite.code, joinRequest.entry.name, joinRequest.entry.profile);
    onJoinHandled();
  }, [joinRequest, connected]);
  useEffect(() => { if (room && pack) history.replaceState(null, "", roomInviteUrl(location.origin, pack.id, room.code)); }, [room?.code, pack?.id]);
  const leave = () => { api.leave(); location.href = `/?world=${encodeURIComponent(pack?.id ?? world.id)}`; };
  const binding = useMemo<OnlineBinding | null>(() => {
    if (!game || !room || !you) return null;
    return {
      initial: game.initial, feed: api.feed,
      mine: seat => room.seats?.[seat]?.owner === you.id,
      send: api.act,
      label: seat => { const s = room.seats?.[seat]; const m = s?.owner ? room.members.find(m => m.id === s.owner) : null; return { name: m?.name ?? null, covering: !!s?.covering }; },
      onRematch: room.hostId === you.id ? api.rematch : undefined,
      error: api.error, clearError: api.clearError, conn,
    };
  }, [game?.epoch, room, you, api.error, conn]);
  if (pack && binding && game && room?.status !== "lobby") return <Game key={game.epoch} pack={pack} online={binding} onExit={leave} />;
  const me = room?.members.find(m => m.id === you?.id), host = room?.hostId === you?.id;
  return <OnlineShell connected={connected} error={api.error} onLeave={() => { if (room) api.leave(); }}>
    {room && pack && you ? <RoomLobby world={pack} code={room.code} meId={you.id} host={host} connected={connected} pending={api.requestPending} allowBots={room.allowBots}
      members={room.members.map(m => ({ id: m.id, name: m.name, profile: m.profile ?? DEFAULT_PROFILE, connected: m.connected, ready: !!m.ready, host: m.id === room.hostId, playing: !!m.character, detail: pack.characters.find(c => c.id === m.character)?.name ?? "Watching" }))}
      onReady={api.ready} onStart={api.start} onLeave={leave}
      extra={<details className="glass rounded-2xl p-4"><summary className="cursor-pointer text-sm text-accent">Champions &amp; optional bots</summary>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{pack.characters.map(c => {
          const mine = me?.character === c.id;
          const taken = room.members.some(m => m.id !== you.id && m.character === c.id);
          return <button key={c.id} disabled={!connected || api.requestPending || taken} aria-pressed={mine} onClick={() => api.pick(mine ? null : c.id)} className={`${lobbyButton} px-2 text-center ${mine ? "border-accent bg-primary/20" : ""}`}><span className="mx-auto block w-fit"><Emblem c={c} size={40} portrait={pack.art.portraits?.[c.id]} /></span><span className="mt-2 block text-xs">{c.name}{mine ? " · you" : ""}</span></button>;
        })}</div>
        {host && <><label className="mt-5 flex items-start gap-3 text-sm text-muted"><input type="checkbox" checked={room.allowBots} disabled={!connected || api.requestPending} onChange={e => api.bots(e.target.checked)} className="mt-1" />Fill empty seats and cover away players with bots</label>
          {room.allowBots && <div className="mt-3 flex gap-2" role="group" aria-label="Seats">{([2, 3, 4] as const).map(count => <button key={count} disabled={api.requestPending || count < room.members.filter(m => m.character).length} aria-pressed={room.playerCount === count} className={lobbyButton} onClick={() => api.players(count)}>{count} seats</button>)}</div>}
        </>}
      </details>}
    /> : <RoomEntry world={world} connected={connected} pending={api.requestPending || !!joinRequest} initialCode={initialCode} initialMode={initialMode}
      onCreate={entry => { const tuning = loadTuning(world); const tuned = tuning ? applyTuning(world, tuning) : world; api.create(entry.name, validatePack(structuredClone(tuned)).ok ? tuned : world, entry.profile); }}
      onJoin={(entry, invite) => { if (invite.engine !== "classic") onCrossJoin(entry, invite); else api.join(invite.code, entry.name, entry.profile); }} />}
  </OnlineShell>;
}
