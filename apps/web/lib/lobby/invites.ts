export type LobbyEngine = "classic" | "party";
export type RoomInvite = { code: string; engine: LobbyEngine; worldId?: string };

/** Current links and the original /party-ludo/online links share one entry flow. */
export function readRoomInvite(input: string): RoomInvite {
  let code = input.trim(), worldId: string | undefined;
  let partyLink = false;
  if (/^https?:\/\//i.test(code)) {
    const url = new URL(code);
    code = url.searchParams.get("room") ?? "";
    worldId = url.searchParams.get("world") ?? undefined;
    partyLink = url.pathname.startsWith("/party-ludo");
  }
  code = code.trim().toUpperCase();
  if (/^[A-Z2-9]{5}$/.test(code)) return { code, engine: "classic", worldId: worldId === "party-ludo" ? undefined : worldId };
  const partyCode = code.length === 12 && (code.match(/[A-Z]/g)?.length ?? 0) === 6 && (code.match(/[0-9]/g)?.length ?? 0) === 4 && (code.match(/[!@#$%*?]/g)?.length ?? 0) === 2;
  if (partyCode || /^[A-F0-9]{6}$/.test(code)) return { code, engine: "party", worldId: "party-ludo" };
  throw new Error(partyLink ? "This invitation has no valid room code. Ask your friend for a new link." : "Paste the full invite link or room code from your friend.");
}

export function roomInviteUrl(origin: string, worldId: string, code: string) {
  const url = new URL("/online", origin);
  url.searchParams.set("world", worldId);
  url.searchParams.set("room", code);
  return url.toString();
}

export function lobbyUrl(worldId: string, mode: "host" | "join") {
  return `/online?${new URLSearchParams({ world: worldId, mode })}`;
}
