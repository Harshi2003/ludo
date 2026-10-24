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

describe('rooms', () => {
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

  it('runs a server-authoritative game: turn ownership, bots, updates to everyone', () => {
    const { mgr, host, guest, clock, hostId } = setup();
    mgr.handle(host, { t: 'players', count: 3 });
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
    mgr.handle(host, { t: 'players', count: 2 });
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
    const { mgr, host, clock } = setup();
    mgr.handle(host, { t: 'players', count: 2 });
    mgr.handle(host, { t: 'start' });
    for (let i = 0; i < 400 && host.last('update')?.room.status !== 'over'; i++) clock.advance(5 * 60_000);
    expect(host.last('update')!.room.status).toBe('over');
    expect(host.last('update')!.state.winner).not.toBeNull();
    mgr.handle(host, { t: 'rematch' });
    expect(host.last('start')!.room.status).toBe('playing');
  });
});
