import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '@ludo/net';
import { magicPack } from '@ludo/themepack';
import { RoomManager, TIMING, type Clock, type Peer } from '../src/rooms';

class FakeClock implements Clock {
  t = 0;
  timers: { at: number; fn: () => void; id: number }[] = [];
  private n = 0;
  setTimeout(fn: () => void, ms: number) {
    const id = ++this.n;
    this.timers.push({ at: this.t + ms, fn, id });
    return id;
  }
  clearTimeout(h: unknown) {
    this.timers = this.timers.filter((x) => x.id !== h);
  }
  now() {
    return this.t;
  }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const next = this.timers[0];
      if (!next || next.at > end) break;
      this.timers.shift();
      this.t = next.at;
      next.fn();
    }
    this.t = end;
  }
}

class FakePeer implements Peer {
  inbox: ServerMessage[] = [];
  send(m: ServerMessage) {
    this.inbox.push(m);
  }
  last<T extends ServerMessage['t']>(t: T) {
    return [...this.inbox].reverse().find((m) => m.t === t) as Extract<ServerMessage, { t: T }> | undefined;
  }
}

function setup() {
  const clock = new FakeClock();
  const mgr = new RoomManager(clock);
  const host = new FakePeer();
  mgr.handle(host, { t: 'create', name: 'Ana', pack: magicPack });
  const welcome = host.last('welcome')!;
  const code = welcome.room.code;
  const guest = new FakePeer();
  mgr.handle(guest, { t: 'join', code: code.toLowerCase(), name: 'Ben' });
  return { clock, mgr, host, guest, code, hostId: welcome.you.id, guestWelcome: guest.last('welcome')! };
}

function readyPlayers(manager: RoomManager, ...peers: FakePeer[]) {
  for (const peer of peers) manager.handle(peer, { t: 'ready', ready: true });
}

describe('rooms', () => {
  it('requires friends and ready checks, then starts only the humans who joined', () => {
    const clock = new FakeClock(), mgr = new RoomManager(clock), host = new FakePeer();
    mgr.handle(host, { t: 'create', name: 'Ana', pack: magicPack, profile: { kind: 'animal', animal: 'cat' } });
    const code = host.last('welcome')!.room.code;
    mgr.handle(host, { t: 'ready', ready: true });
    mgr.handle(host, { t: 'start' });
    expect(host.last('error')!.message).toContain('two friends');
    const guest = new FakePeer();
    mgr.handle(guest, { t: 'join', code, name: 'Júlia', profile: { kind: 'animal', animal: 'panda' } });
    expect(host.last('room')!.room.members.every(m => !m.ready)).toBe(true);
    readyPlayers(mgr, host);
    mgr.handle(host, { t: 'start' });
    expect(host.last('error')!.message).toContain('connected and ready');
    readyPlayers(mgr, guest);
    mgr.handle(host, { t: 'start' });
    const started = host.last('start')!;
    expect(started.room.allowBots).toBe(false);
    expect(started.room.seats).toHaveLength(2);
    expect(started.room.seats!.every(s => s.owner && !s.covering)).toBe(true);
    expect(started.room.members.map(m => m.profile)).toEqual([{ kind: 'animal', animal: 'cat' }, { kind: 'animal', animal: 'panda' }]);
    clock.advance(10 * 60_000);
    expect(host.last('update')).toBeUndefined();
  });

  it('resets readiness on settings changes and keeps lobby profiles and tokens across reconnects', () => {
    const { mgr, host, guest, code, guestWelcome } = setup();
    readyPlayers(mgr, host, guest);
    mgr.handle(guest, { t: 'bots', enabled: true });
    expect(guest.last('error')!.message).toContain('host');
    mgr.handle(host, { t: 'bots', enabled: true });
    expect(host.last('room')!.room.members.every(m => !m.ready)).toBe(true);
    readyPlayers(mgr, host, guest);
    mgr.leave(guest);
    expect(host.last('room')!.room.members.find(m => m.id === guestWelcome.you.id)!.connected).toBe(false);
    const returning = new FakePeer();
    mgr.handle(returning, { t: 'join', code, name: 'Ben', token: guestWelcome.you.token });
    expect(returning.last('welcome')!.you.id).toBe(guestWelcome.you.id);
    expect(host.last('room')!.room.members.every(m => !m.ready)).toBe(true);
    mgr.handle(returning, { t: 'leave' });
    expect(host.last('room')!.room.members).toHaveLength(1);
  });

  it('rejects invalid profile data before allocating a room', () => {
    const mgr = new RoomManager(new FakeClock()), peer = new FakePeer();
    mgr.handle(peer, { t: 'create', name: 'Ana', pack: magicPack, profile: { kind: 'photo', dataUrl: 'https://example.test/photo.svg' } });
    expect(peer.last('error')!.message).toContain('profile photo');
    expect(mgr.rooms.size).toBe(0);
  });
  it('creates a room and lets a friend join by code', () => {
    const { host, code, guestWelcome } = setup();
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    expect(guestWelcome.room.members.map((m) => m.name)).toEqual(['Ana', 'Ben']);
    expect(host.last('room')!.room.members).toHaveLength(2);
    // Each joiner is given a free champion.
    const chars = host.last('room')!.room.members.map((m) => m.character);
    expect(new Set(chars).size).toBe(2);
  });

  it('keeps champion picks unique and only lets the host start', () => {
    const { mgr, host, guest } = setup();
    const hostChar = host.last('room')!.room.members[0].character;
    mgr.handle(guest, { t: 'pick', character: hostChar });
    expect(guest.last('error')!.message).toMatch(/already picked/);
    mgr.handle(guest, { t: 'start' });
    expect(guest.last('error')!.message).toMatch(/host/);
  });

  it('rejects an invalid world', () => {
    const mgr = new RoomManager(new FakeClock());
    const p = new FakePeer();
    mgr.handle(p, { t: 'create', name: 'x', pack: { ...magicPack, zones: [] } });
    expect(p.last('error')!.message).toMatch(/valid/);
  });

  it('rejects duplicate names after cleaning and ignoring case, but allows token reconnection', () => {
    const { mgr, code, host, guest, hostId } = setup();
    const duplicate = new FakePeer();
    mgr.handle(duplicate, { t: 'join', code, name: '  aNA! ' });
    expect(duplicate.last('error')!.message).toMatch(/name is already taken/);
    const token = host.last('welcome')!.you.token;
    mgr.handle(host, { t: 'players', count: 2 });
    readyPlayers(mgr, host, guest);
    mgr.handle(host, { t: 'start' });
    mgr.leave(host);
    const back = new FakePeer();
    mgr.handle(back, { t: 'join', code, name: 'Ana', token });
    expect(back.last('welcome')!.you.id).toBe(hostId);
  });

  it('transfers hosting during a game so the remaining player can rematch', () => {
    const { mgr, host, guest, clock, guestWelcome } = setup();
    mgr.handle(host, { t: 'bots', enabled: true });
    mgr.handle(host, { t: 'players', count: 2 });
    readyPlayers(mgr, host, guest);
    mgr.handle(host, { t: 'start' });
    mgr.leave(host);
    expect(guest.last('room')!.room.hostId).toBe(guestWelcome.you.id);
    for (let i = 0; i < 400 && guest.last('update')?.room.status !== 'over'; i++) clock.advance(5 * 60_000);
    expect(guest.last('update')!.room.status).toBe('over');
    mgr.handle(guest, { t: 'rematch' });
    expect(guest.last('room')!.room.status).toBe('lobby');
    expect(guest.last('room')!.room.members.every(m => !m.ready)).toBe(true);
  });

  it('never silently drops a selected player when changing the seat count', () => {
    const { mgr, host, guest, code } = setup();
    mgr.handle(host, { t: 'players', count: 2 });
    const watcher = new FakePeer();
    mgr.handle(watcher, { t: 'join', code, name: 'Cat' });
    expect(watcher.last('welcome')!.room.members.find((m) => m.name === 'Cat')!.character).toBeNull();
    mgr.handle(watcher, { t: 'pick', character: magicPack.characters[2].id });
    expect(watcher.last('error')!.message).toMatch(/seats are taken/);
    mgr.handle(host, { t: 'players', count: 3 });
    mgr.handle(watcher, { t: 'pick', character: magicPack.characters[2].id });
    mgr.handle(host, { t: 'players', count: 2 });
    expect(host.last('error')!.message).toMatch(/Not enough seats/);
    expect(guest.last('room')!.room.playerCount).toBe(3);
    mgr.handle(watcher, { t: 'pick', character: null });
    mgr.handle(host, { t: 'players', count: 2 });
    readyPlayers(mgr, host, guest);
    mgr.handle(host, { t: 'start' });
    expect(host.last('start')!.room.seats!.map((s) => s.owner).filter(Boolean)).toHaveLength(2);
  });

  it('runs a server-authoritative game: turn ownership, bots, updates to everyone', () => {
    const { mgr, host, guest, clock, hostId } = setup();
    mgr.handle(host, { t: 'bots', enabled: true });
    mgr.handle(host, { t: 'players', count: 3 });
    readyPlayers(mgr, host, guest);
    mgr.handle(host, { t: 'start' });
    const start = host.last('start')!;
    expect(guest.last('start')).toBeTruthy();
    expect(start.room.seats).toHaveLength(3);
    expect(start.room.seats!.filter((s) => s.owner === null)).toHaveLength(1);

    // Whoever is not on turn gets refused.
    const seats = start.room.seats!;
    const turnOwner = seats[start.state.turn].owner;
    const wrong = turnOwner === hostId ? guest : host;
    if (turnOwner) {
      mgr.handle(wrong, { t: 'action', action: { type: 'roll' } });
      expect(wrong.last('error')!.message).toMatch(/your turn/);
    }
    // Let the clock run: humans idle out to bot cover, bots play; the game must progress for everyone.
    clock.advance(10 * 60_000);
    const u = host.last('update')!;
    expect(u.state.round).toBeGreaterThan(1);
    expect(guest.last('update')!.state.round).toBe(u.state.round);
  });

  it('covers a disconnected player with a bot and hands the seat back on reconnect', () => {
    const { mgr, host, guest, clock, code, guestWelcome } = setup();
    mgr.handle(host, { t: 'bots', enabled: true });
    mgr.handle(host, { t: 'players', count: 2 });
    readyPlayers(mgr, host, guest);
    mgr.handle(host, { t: 'start' });
    mgr.leave(guest);
    clock.advance(TIMING.disconnectGraceMs + 60_000);
    const room = host.last('update')!.room;
    expect(room.members.find((m) => m.name === 'Ben')!.connected).toBe(false);

    const back = new FakePeer();
    mgr.handle(back, { t: 'join', code, name: 'Ben', token: guestWelcome.you.token });
    const w = back.last('welcome')!;
    expect(w.you.id).toBe(guestWelcome.you.id);
    expect(w.board).toBeTruthy();
    expect(w.state).toBeTruthy();
    expect(w.room.seats!.find((s) => s.owner === w.you.id)!.covering).toBe(false);
  });

  it('plays a whole game to the end and allows a rematch', () => {
    const { mgr, host, guest, clock } = setup();
    mgr.handle(host, { t: 'bots', enabled: true });
    mgr.handle(host, { t: 'players', count: 2 });
    readyPlayers(mgr, host, guest);
    mgr.handle(host, { t: 'start' });
    for (let i = 0; i < 400 && host.last('update')?.room.status !== 'over'; i++) clock.advance(5 * 60_000);
    expect(host.last('update')!.room.status).toBe('over');
    expect(host.last('update')!.state.winner).not.toBeNull();
    mgr.handle(host, { t: 'rematch' });
    expect(host.last('room')!.room.status).toBe('lobby');
    expect(host.last('room')!.room.members.every(m => !m.ready)).toBe(true);
    readyPlayers(mgr, host, guest);
    mgr.handle(host, { t: 'start' });
    expect(host.last('start')!.room.status).toBe('playing');
  });
});
