import { describe, expect, it } from 'vitest';
import { PartyRooms } from '../src/party-ludo/rooms';
import { createInviteCode } from '../src/party-ludo/invite';
import { partyInviteUrl, validInviteCode } from '../../web/lib/party-ludo/invite';
function lobby() {
  const manager = new PartyRooms();
  const peers = [0, 1, 2].map(() => ({ messages: [] as any[], send(data: string) { this.messages.push(JSON.parse(data)); } }));
  manager.handle(peers[0], { t: 'create', name: 'Host' });
  const room = [...manager.rooms.values()][0];
  manager.handle(peers[1], { t: 'join', code: room.code.toLowerCase(), name: 'Guest' });
  return { manager, room, peers, ready: () => room.members.forEach(m => m.peer && manager.handle(m.peer, { t: 'ready', ready: true })) };
}
describe('Party lobby invites and host controls', () => {
  it('generates the exact code composition and round-trips reserved symbols in invite links', () => {
    const codes = Array.from({ length: 1000 }, createInviteCode);
    expect(new Set(codes).size).toBe(1000);
    for (const code of codes) {
      expect(validInviteCode(code)).toBe(true);
      expect(new URL(partyInviteUrl('http://example.test:3000', code)).searchParams.get('room')).toBe(code);
    }
    for (const symbol of '!@#$%*?') {
      const code = `ABCDEF1234${symbol}${symbol}`;
      expect(new URL(partyInviteUrl('https://example.test', code)).searchParams.get('room')).toBe(code);
    }
    expect(validInviteCode('ABC123')).toBe(false);
  });
  it('requires every participant including the host to ready and resets on settings or roster changes', () => {
    const { manager, room, peers, ready } = lobby();
    manager.handle(peers[0], { t: 'start' }); expect(room.state).toBeNull();
    manager.handle(peers[1], { t: 'ready', ready: true });
    manager.handle(peers[0], { t: 'start' }); expect(room.state).toBeNull();
    ready();
    manager.handle(peers[1], { t: 'ready', ready: false });
    expect(peers[0].messages.at(-1).feed.ready).toEqual([true, false]);
    manager.handle(peers[1], { t: 'ready', ready: true });
    expect(peers[0].messages.at(-1).feed.ready).toEqual([true, true]);
    manager.handle(peers[0], { t: 'spice', spiceLevel: 2 });
    expect(room.members.every(m => !m.ready)).toBe(true);
    expect(peers[1].messages.at(-1).feed.spiceLevel).toBe(2);
    ready(); manager.handle(peers[2], { t: 'join', code: room.code, name: 'Third' });
    expect(room.members.every(m => !m.ready)).toBe(true);
    ready(); manager.leave(peers[2]);
    expect(room.members.every(m => !m.ready)).toBe(true);
  });
  it('lets only the host remove another lobby player and invalidates their reconnect token', () => {
    const { manager, room, peers, ready } = lobby();
    const guestToken = room.members[1].token, guestId = room.members[1].id;
    manager.handle(peers[1], { t: 'kick', memberId: room.members[0].id }); expect(room.members).toHaveLength(2);
    manager.handle(peers[0], { t: 'kick', memberId: room.members[0].id }); expect(room.members).toHaveLength(2);
    ready(); manager.handle(peers[0], { t: 'kick', memberId: guestId });
    expect(room.members).toHaveLength(1); expect(room.members[0].ready).toBe(false);
    expect(peers[1].messages.at(-1).t).toBe('kicked'); expect(manager.where.has(peers[1])).toBe(false);
    manager.handle(peers[1], { t: 'join', code: room.code, token: guestToken });
    expect(peers[1].messages.at(-1).t).toBe('error'); expect(room.members).toHaveLength(1);
  });
  it('starts only from the ready lobby and returns rematches to a fresh ready check', () => {
    const { manager, room, peers, ready } = lobby();
    ready(); manager.handle(peers[1], { t: 'start' }); expect(room.state).toBeNull();
    manager.handle(peers[0], { t: 'start' }); expect(room.state!.phase).toBe('roll');
    manager.handle(peers[0], { t: 'kick', memberId: room.members[1].id }); expect(room.members).toHaveLength(2);
    manager.handle(peers[0], { t: 'rematch' }); expect(room.state).not.toBeNull();
    room.state!.phase = 'over'; manager.handle(peers[0], { t: 'rematch' });
    expect(room.state).toBeNull(); expect(room.members.every(m => !m.ready)).toBe(true);
    ready(); manager.handle(peers[0], { t: 'start' }); expect(room.state!.phase).toBe('roll');
  });
});
