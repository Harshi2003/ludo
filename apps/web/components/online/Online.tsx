"use client";
import { useEffect, useState } from "react";
import { getWorld, isPartyWorld, selectedWorldId } from "@/lib/worlds";
import { readRoomInvite, type LobbyEngine, type RoomInvite } from "@/lib/lobby/invites";
import type { JoinRequest } from "@/lib/lobby/types";
import type { RoomEntryDetails } from "../lobby/Lobby";
import ClassicOnline from "./ClassicOnline";
import PartyOnline from "../party-ludo/PartyOnline";
type Selection = { worldId: string; engine: LobbyEngine; initialCode?: string; initialMode: "host" | "join"; joinRequest?: JoinRequest };
export default function Online({ initialWorldId }: { initialWorldId?: string } = {}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    let world = getWorld(initialWorldId ?? params.get("world") ?? selectedWorldId()).pack;
    let code = params.get("room") ?? undefined;
    let engine: LobbyEngine = isPartyWorld(world) ? "party" : "classic";
    if (code) {
      try { const invite = readRoomInvite(code); code = invite.code; engine = invite.engine; if (engine === "party") world = getWorld("party-ludo").pack; else if (isPartyWorld(world)) world = getWorld(null).pack; } catch {}
    }
    setSelection({ worldId: world.id, engine, initialCode: code, initialMode: code || params.get("mode") === "join" ? "join" : "host" });
  }, [initialWorldId]);
  if (!selection) return <div role="status" className="grid min-h-screen place-items-center text-accent">Opening your room…</div>;
  const world = getWorld(selection.worldId).pack;
  const crossJoin = (entry: RoomEntryDetails, invite: RoomInvite) => {
    const worldId = invite.engine === "party" ? "party-ludo" : invite.worldId ?? (isPartyWorld(world) ? getWorld(null).pack.id : world.id);
    setSelection({ worldId, engine: invite.engine, initialCode: invite.code, initialMode: "join", joinRequest: { entry, invite } });
  };
  const Component = selection.engine === "party" ? PartyOnline : ClassicOnline;
  return <Component key={`${selection.engine}-${selection.initialCode ?? "new"}`} world={world} initialCode={selection.initialCode} initialMode={selection.initialMode} joinRequest={selection.joinRequest} onCrossJoin={crossJoin} onJoinHandled={() => setSelection(current => current ? { ...current, joinRequest: undefined } : current)} />;
}
