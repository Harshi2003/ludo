"use client";
import { useEffect, useRef } from "react";
import { usePartyRoom } from "@/lib/net/usePartyRoom";
import { roomInviteUrl } from "@/lib/lobby/invites";
import type { OnlineWorldProps } from "@/lib/lobby/types";
import { partyPack } from "@/lib/party-ludo/data";
import type { PartyAction } from "@/lib/party-ludo/rules";
import { OnlineShell, RoomEntry, RoomLobby } from "../lobby/Lobby";
import { SpicePicker } from "../lobby/SpicePicker";
import { Match } from "./PartyLudo";
export default function PartyOnline({ initialCode, initialMode, joinRequest, onCrossJoin, onJoinHandled }: OnlineWorldProps) {
  const api = usePartyRoom(initialCode), handled = useRef<object | null>(null);
  const { feed, connected, error, pending, send } = api;
  useEffect(() => {
    if (!joinRequest || joinRequest.invite.engine !== "party" || !connected || handled.current === joinRequest) return;
    handled.current = joinRequest;
    send({ t: "join", code: joinRequest.invite.code, ...joinRequest.entry }); onJoinHandled();
  }, [joinRequest, connected, send]);
  useEffect(() => { if (feed) history.replaceState(null, "", roomInviteUrl(location.origin, partyPack.id, feed.code)); }, [feed?.code]);
  const leave = () => { api.leave(); location.href = "/?world=party-ludo"; };
  const act = async (action: PartyAction) => { if (feed) send({ t: "action", revision: feed.revision, action }); };
  if (feed?.state) return <Match key={`${feed.code}-${feed.state.seed}`} initial={{ players: feed.names.length, seed: feed.state.seed, maxSpiceLevel: feed.state.maxSpiceLevel }} remote={{ feed, connected, act, error }} onExit={leave} onRematch={() => send({ t: "rematch" })} />;
  return <OnlineShell connected={connected} error={error} onLeave={api.leave}>
    {feed ? <RoomLobby world={partyPack} code={feed.code} meId={feed.memberIds[feed.seat]} host={feed.host} connected={connected} pending={pending}
      members={feed.names.map((name, i) => ({ id: feed.memberIds[i], name, profile: feed.profiles[i], connected: feed.connected[i], ready: feed.ready[i], host: i === 0, playing: true }))}
      onReady={ready => send({ t: "ready", ready })} onStart={() => send({ t: "start", spiceLevel: feed.spiceLevel })} onLeave={leave} onRemove={memberId => send({ t: "kick", memberId })}
      settings={<SpicePicker value={feed.spiceLevel} disabled={!connected || pending} onChange={feed.host ? spiceLevel => send({ t: "spice", spiceLevel }) : undefined} />}
    /> : <RoomEntry world={partyPack} connected={connected} pending={pending || !!joinRequest} initialCode={initialCode} initialMode={initialMode}
      onCreate={entry => send({ t: "create", ...entry })}
      onJoin={(entry, invite) => { if (invite.engine !== "party") onCrossJoin(entry, invite); else send({ t: "join", code: invite.code, ...entry }); }} />}
  </OnlineShell>;
}
