import type { ThemePack } from "@ludo/engine";
import type { RoomEntryDetails } from "@/components/lobby/Lobby";
import type { RoomInvite } from "./invites";
export type JoinRequest = { entry: RoomEntryDetails; invite: RoomInvite };
export type OnlineWorldProps = {
  world: ThemePack; initialCode?: string; initialMode?: "host" | "join"; joinRequest?: JoinRequest;
  onCrossJoin: (entry: RoomEntryDetails, invite: RoomInvite) => void; onJoinHandled: () => void;
};
