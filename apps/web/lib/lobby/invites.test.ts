import { describe, expect, it } from "vitest";
import { lobbyUrl, readRoomInvite, roomInviteUrl } from "./invites";

describe("shared world invitations", () => {
  it("round-trips both engines and preserves reserved Party code symbols", () => {
    for (const [world, code, engine] of [["magic-elements", "ABC23", "classic"], ["party-ludo", "ABCDEF1234#?", "party"]] as const) {
      expect(readRoomInvite(roomInviteUrl("https://play.example", world, code))).toEqual({ engine, code, worldId: world });
    }
  });
  it("recognizes a friend's world even when entered from another world's lobby", () => {
    expect(readRoomInvite("abcdef1234#?")).toMatchObject({ engine: "party", worldId: "party-ludo" });
    expect(readRoomInvite(" abc23 ")).toMatchObject({ code: "ABC23", engine: "classic" });
    expect(readRoomInvite("https://play.example/party-ludo/online?room=ABCDEF1234%23%3F").engine).toBe("party");
    expect(readRoomInvite("a1b2c3").engine).toBe("party");
  });
  it("rejects malformed invitations and creates one entry route for every theme", () => {
    for (const input of ["", "ABCDE1234567", "https://play.example/online", "#?", "javascript:alert(1)"]) expect(() => readRoomInvite(input)).toThrow();
    expect(lobbyUrl("party-ludo", "host")).toBe("/online?world=party-ludo&mode=host");
    expect(lobbyUrl("custom-world", "join")).toBe("/online?world=custom-world&mode=join");
  });
});
