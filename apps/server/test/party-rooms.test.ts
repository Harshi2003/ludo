import { describe, expect, it, vi } from 'vitest';
import { ANIMATION_TIMING } from '@ludo/net';
import { PartyRooms } from '../src/party-ludo/rooms';
import { drawCard } from '../../web/lib/party-ludo/rules';
import { actingSeat } from '../../web/lib/party-ludo/online';
function setup(count: number) {
  const manager = new PartyRooms();
  const peers = Array.from({ length: count }, () => ({ messages: [] as any[], send(data: string) { this.messages.push(JSON.parse(data)); } }));
  manager.handle(peers[0], { t: 'create', name: 'Guest 1' });
  const room = [...manager.rooms.values()][0];
  for (let i = 1; i < count; i++) manager.handle(peers[i], { t: 'join', code: room.code, name: `Guest ${i + 1}` });
  peers.forEach(p => manager.handle(p, { t: 'ready', ready: true }));
  manager.handle(peers[0], { t: 'start', spiceLevel: 1 });
  const action = (seat: number, action: unknown) => { room.until = 0; manager.handle(peers[seat], { t: 'action', revision: room.revision, action }); };
  return { manager, peers, room, action };
}
describe('Independent Party online rooms', () => {
  it('keeps online actions locked until the shared dice and movement playback finishes', () => {
    vi.useFakeTimers();
    try {
      const { manager, room, peers, action } = setup(2);
      action(0, { type: 'roll' });
      vi.advanceTimersByTime(ANIMATION_TIMING.rollMs - 1);
      const rolledRevision = room.revision;
      manager.handle(peers[0], { t: 'action', revision: room.revision, action: { type: 'move', index: 0 } });
      expect(room.revision).toBe(rolledRevision);
      expect(peers[0].messages.at(-1).message).toContain('animation');
      vi.advanceTimersByTime(131);
      manager.handle(peers[0], { t: 'action', revision: room.revision, action: { type: 'move', index: 0 } });
      expect(room.revision).toBe(rolledRevision + 1);
      const duration = room.state!.motions.reduce((sum, motion) => sum + motion.path.length * ANIMATION_TIMING.stepMs + 800, 0);
      expect(duration).toBeGreaterThan(0);
      vi.advanceTimersByTime(duration - 1);
      const movedRevision = room.revision;
      manager.handle(peers[0], { t: 'action', revision: room.revision, action: { type: 'next' } });
      expect(room.revision).toBe(movedRevision);
      expect(peers[0].messages.at(-1).message).toContain('animation');
      vi.advanceTimersByTime(31);
      for (const peer of peers) expect(peer.messages.at(-1).feed.locked).toBe(false);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
  it.each([2, 3, 4])('finishes a synchronized %i-player session with server-controlled turns', count => {
    const { room, peers, action } = setup(count);
    for (let steps = 0; room.state!.phase !== 'over'; steps++) {
      expect(steps).toBeLessThan(300);
      const s = room.state!, seat = actingSeat(s);
      const revision = room.revision;
      if (s.phase === 'roll') {
        action((seat + 1) % count, { type: 'roll' }); expect(room.revision).toBe(revision);
        action(seat, { type: 'roll' });
      } else if (s.phase === 'move') action(seat, { type: 'move', index: 0 });
      else if (s.phase === 'card') action(seat, { type: 'skip' });
      else if (s.result?.trapChoice === 'pending') action(seat, { type: 'trap-choice', choice: 'back' });
      else if (s.result?.drink) action(seat, { type: 'acknowledge-drink' });
      else action(seat, { type: 'next' });
      const states = peers.map(p => p.messages.filter(m => m.t === 'feed').at(-1).feed.state);
      expect(states.every(state => state.turn === room.state!.turn && state.rng === room.state!.rng)).toBe(true);
    }
  });
  it('does not send ballots or another seat’s selection result; reconnect retains the seat', () => {
    const { manager, peers, room, action } = setup(3);
    room.state!.phase = 'card'; room.state!.card = drawCard(room.state!, 'likely');
    for (let i = 0; i < 3; i++) action(i, { type: 'vote', player: 1 });
    const latest = (i: number) => peers[i].messages.filter(m => m.t === 'feed').at(-1).feed;
    for (let i = 0; i < 3; i++) {
      expect(latest(i).state.card.votes).toEqual([-1, -1, -1]);
      expect(latest(i).state.result.privateVote.selected).toBeUndefined();
    }
    action(1, { type: 'reveal-vote' });
    expect(latest(1).state.result.privateVote.selected).toBe(true);
    expect(latest(0).state.result.privateVote.selected).toBeUndefined();
    action(1, { type: 'hide-vote' });
    expect(latest(1).state.result.privateVote.selected).toBeUndefined();
    const token = peers[1].messages.find(m => m.t === 'session').token;
    manager.leave(peers[1]);
    const rejoined = { messages: [] as any[], send(data: string) { this.messages.push(JSON.parse(data)); } };
    manager.handle(rejoined, { t: 'join', code: room.code, token });
    expect(rejoined.messages.find(m => m.t === 'feed').feed.seat).toBe(1);
    for (const i of [0, 2]) { action(i, { type: 'reveal-vote' }); action(i, { type: 'hide-vote' }); }
    expect(room.state!.result!.privateVote!.done).toBe(true);
    action(0, { type: 'next' }); expect(room.state!.turn).toBe(1);
  });
  it('requires custom names and carries them into the game and reconnect', () => {
    const manager = new PartyRooms();
    const peer = () => ({ messages: [] as any[], send(data: string) { this.messages.push(JSON.parse(data)); } });
    const host = peer(), guest = peer();
    for (const name of ['', '   ', 'A'.repeat(19), '<script>']) {
      manager.handle(host, { t: 'create', name });
      expect(host.messages.at(-1).t).toBe('error'); expect(manager.rooms.size).toBe(0);
    }
    manager.handle(host, { t: 'create', name: '  Alex  ' });
    const room = [...manager.rooms.values()][0];
    manager.handle(guest, { t: 'join', code: room.code, name: '' });
    expect(room.members).toHaveLength(1);
    manager.handle(guest, { t: 'join', code: room.code, name: 'Sam' });
    manager.handle(host, { t: 'ready', ready: true }); manager.handle(guest, { t: 'ready', ready: true });
    manager.handle(host, { t: 'start', spiceLevel: 1 });
    expect(room.state!.players.map(p => p.name)).toEqual(['Alex', 'Sam']);
    const token = guest.messages.find(m => m.t === 'session').token;
    manager.leave(guest);
    const returning = peer(); manager.handle(returning, { t: 'join', code: room.code, token });
    expect(returning.messages.at(-1).feed.names).toEqual(['Alex', 'Sam']);
  });
  it('shares selected profiles with the room and preserves them on reconnect', () => {
    const manager = new PartyRooms();
    const peer = () => ({ messages: [] as any[], send(data: string) { this.messages.push(JSON.parse(data)); } });
    const host = peer(), guest = peer();
    manager.handle(host, { t: 'create', name: 'Alex', profile: { kind: 'animal', animal: 'tiger' } });
    const room = [...manager.rooms.values()][0];
    const photo = { kind: 'photo', dataUrl: 'data:image/jpeg;base64,/9j/2Q==' };
    manager.handle(guest, { t: 'join', code: room.code, name: 'Sam', profile: photo });
    expect(host.messages.at(-1).feed.profiles).toEqual([{ kind: 'animal', animal: 'tiger' }, photo]);
    manager.handle(host, { t: 'ready', ready: true }); manager.handle(guest, { t: 'ready', ready: true });
    manager.handle(host, { t: 'start', spiceLevel: 1 });
    const token = guest.messages.find(m => m.t === 'session').token;
    manager.leave(guest); const returning = peer();
    manager.handle(returning, { t: 'join', code: room.code, token });
    expect(returning.messages.at(-1).feed.profiles[1]).toEqual(photo);
    expect(returning.messages.at(-1).feed.names[1]).toBe('Sam');
    const bad = peer(); manager.handle(bad, { t: 'create', name: 'Bad', profile: { kind: 'photo', dataUrl: 'https://example.com/photo.svg' } });
    expect(bad.messages.at(-1).t).toBe('error'); expect(manager.rooms.size).toBe(1);
  });
  it('frees a lobby seat on explicit leave and keeps the remaining host connected', () => {
    const manager = new PartyRooms();
    const peers = [0, 1].map(() => ({ messages: [] as any[], send(data: string) { this.messages.push(JSON.parse(data)); } }));
    manager.handle(peers[0], { t: 'create', name: 'Host' });
    const room = [...manager.rooms.values()][0];
    manager.handle(peers[1], { t: 'join', code: room.code, name: 'Guest' });
    manager.handle(peers[0], { t: 'leave' });
    expect(room.members).toHaveLength(1);
    expect(peers[1].messages.at(-1).feed.host).toBe(true);
    expect(manager.where.get(peers[1])!.seat).toBe(0);
  });
  it('rejects stale actions, non-host starts, occupied-seat tokens and invalid spice', () => {
    const { manager, room, peers } = setup(2);
    manager.handle(peers[1], { t: 'start', spiceLevel: 1 });
    expect(peers[1].messages.at(-1).t).toBe('error');
    manager.handle(peers[0], { t: 'action', revision: -1, action: { type: 'roll' } });
    expect(peers[0].messages.at(-1).t).toBe('error');
    room.state!.phase = 'over';
    manager.handle(peers[0], { t: 'rematch' });
    manager.handle(peers[0], { t: 'spice', spiceLevel: 4 });
    expect(peers[0].messages.at(-1).message).toContain('Mild, Medium, or Spicy');
    const outsider = { messages: [] as any[], send(data: string) { this.messages.push(JSON.parse(data)); } };
    manager.handle(outsider, { t: 'join', code: room.code, token: room.members[0].token });
    expect(outsider.messages.at(-1).t).toBe('error');
  });
});
