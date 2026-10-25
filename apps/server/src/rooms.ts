import { randomBytes, randomInt } from 'node:crypto';
import { botAction, createGame, step, type Action, type GameEvent, type GameState, type ThemePack } from '@ludo/engine';
import { ANIMATION_TIMING, CODE_ALPHABET, normalizeCode, toWire, validateProfile, type PlayerProfile, type ClientMessage, type PlayerCount, type RoomView, type SeatView, type ServerMessage } from '@ludo/net';
import { validatePack } from '@ludo/themepack';

/** Anything that can receive messages; a WebSocket in production, a fake in tests. */
export interface Peer {
  send(msg: ServerMessage): void;
}

interface Member {
  id: string;
  token: string;
  name: string;
  peer: Peer | null;
  character: string | null;
  lastSeen: number;
  ready: boolean;
  profile: PlayerProfile;
}

export interface Clock {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
  now(): number;
}

export const realClock: Clock = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export const TIMING = {
  /** A connected human gets this long to act before a bot plays for them. */
  idleTurnMs: 45_000,
  /** A disconnected human's seat is covered by a bot after this grace period. */
  disconnectGraceMs: 6_000,
  /** Rooms with nobody connected are removed after this long. */
  emptyRoomMs: 15 * 60_000,
};

/** Roughly how long clients spend animating these events, so bots don't outrun the screen. */
export function animationMs(events: GameEvent[]): number {
  let ms = 350;
  for (const e of events) {
    if (e.kind === 'roll' && e.value) ms += ANIMATION_TIMING.rollMs + 50;
    else if (e.kind === 'move') ms += (e.path?.length ?? 1) * ANIMATION_TIMING.stepMs + 450;
    else if (e.kind === 'ultimate') ms += 1900;
    else if (e.kind === 'ability') ms += 1200;
    else if (e.kind === 'capture') ms += 1400;
    else if (e.kind === 'tile' || e.kind === 'skip') ms += 550;
    else if (e.kind === 'win') ms += 1500;
    else ms += 120;
  }
  return Math.min(ms, 12_000);
}

const newId = () => randomBytes(6).toString('base64url');

export class Room {
  readonly members = new Map<string, Member>();
  status: RoomView['status'] = 'lobby';
  playerCount: PlayerCount = 4;
  allowBots = false;
  game: GameState | null = null;
  seats: SeatView[] | null = null;
  private timer: unknown = null;
  private seen = 0;
  private emptySince: number | null = null;

  constructor(
    readonly code: string,
    public hostId: string,
    readonly pack: ThemePack,
    private clock: Clock,
  ) {}

  view(): RoomView {
    return {
      code: this.code,
      status: this.status,
      hostId: this.hostId,
      playerCount: this.playerCount,
      allowBots: this.allowBots,
      members: [...this.members.values()].map((m) => ({ id: m.id, name: m.name, connected: !!m.peer, character: m.character, ready: m.ready, profile: m.profile })),
      seats: this.seats,
      worldName: this.pack.world.name,
    };
  }

  broadcast(msg: ServerMessage) {
    for (const m of this.members.values()) m.peer?.send(msg);
  }

  private roomChanged() {
    this.broadcast({ t: 'room', room: this.view() });
  }

  private resetReady() {
    if (this.status === 'lobby') for (const member of this.members.values()) member.ready = false;
  }

  addMember(name: string, peer: Peer, profile?: PlayerProfile): Member {
    const m: Member = { id: newId(), token: randomBytes(16).toString('base64url'), name: cleanName(name), peer, character: null, lastSeen: this.clock.now(), ready: false, profile: validateProfile(profile) };
    // Late joiners pick nothing during a game: they spectate.
    if (this.status === 'lobby' && this.playerMembers().length < this.playerCount) m.character = this.freeCharacters()[0] ?? null;
    this.emptySince = null;
    if (!this.members.get(this.hostId)?.peer) this.hostId = m.id;
    this.members.set(m.id, m);
    this.resetReady();
    this.welcome(m);
    this.roomChanged();
    return m;
  }

  /** Reattach a returning player to their member record. */
  reconnect(token: string, peer: Peer): Member | null {
    const m = [...this.members.values()].find((x) => x.token === token);
    if (!m) return null;
    m.peer = peer;
    m.lastSeen = this.clock.now();
    this.resetReady();
    this.emptySince = null;
    if (!this.members.get(this.hostId)?.peer) this.hostId = m.id;
    if (this.seats) {
      for (const s of this.seats) if (s.owner === m.id) s.covering = false;
    }
    this.welcome(m);
    this.roomChanged();
    this.schedule();
    return m;
  }

  disconnect(peer: Peer, permanent = false) {
    const m = [...this.members.values()].find((x) => x.peer === peer);
    if (!m) return;
    m.peer = null;
    m.lastSeen = this.clock.now();
    this.resetReady();
    if (this.status === 'lobby' && permanent) {
      this.members.delete(m.id);
    }
    if (this.hostId === m.id) this.hostId = [...this.members.values()].find((x) => x.peer)?.id ?? this.hostId;
    if (![...this.members.values()].some((x) => x.peer)) this.emptySince = this.clock.now();
    this.roomChanged();
    this.schedule();
  }

  isAbandoned() {
    return this.emptySince !== null && this.clock.now() - this.emptySince > TIMING.emptyRoomMs;
  }

  private welcome(m: Member) {
    m.peer?.send({
      t: 'welcome',
      you: { id: m.id, token: m.token },
      room: this.view(),
      pack: this.pack,
      board: this.game?.board,
      state: this.game ? toWire(this.game) : undefined,
    });
  }

  private freeCharacters() {
    const taken = new Set([...this.members.values()].map((m) => m.character));
    return this.pack.characters.map((c) => c.id).filter((id) => !taken.has(id));
  }

  private playerMembers() {
    return [...this.members.values()].filter((m) => m.character);
  }

  handle(memberId: string, msg: ClientMessage) {
    const m = this.members.get(memberId);
    if (!m) return;
    m.lastSeen = this.clock.now();
    const fail = (message: string) => m.peer?.send({ t: 'error', message });

    switch (msg.t) {
      case 'ready':
        if (this.status !== 'lobby' || typeof msg.ready !== 'boolean') return fail('Ready is available in the lobby only.');
        m.ready = msg.ready;
        return this.roomChanged();
      case 'bots':
        if (m.id !== this.hostId || this.status !== 'lobby' || typeof msg.enabled !== 'boolean') return fail('Only the host can change lobby settings.');
        this.allowBots = msg.enabled;
        this.resetReady();
        return this.roomChanged();
      case 'pick': {
        if (this.status !== 'lobby') return fail('The game has already started.');
        if (msg.character !== null) {
          if (!m.character && this.playerMembers().length >= this.playerCount) return fail('All seats are taken. Ask the host for more seats or watch instead.');
          if (!this.pack.characters.some((c) => c.id === msg.character)) return fail('Unknown champion.');
          const holder = [...this.members.values()].find((x) => x.character === msg.character && x.id !== m.id);
          if (holder) return fail(`${holder.name} already picked that champion.`);
        }
        m.character = msg.character;
        this.resetReady();
        return this.roomChanged();
      }
      case 'players':
        if (m.id !== this.hostId) return fail('Only the host can change this.');
        if (this.status !== 'lobby') return;
        if (![2, 3, 4].includes(msg.count)) return fail('2–4 players.');
        if (msg.count < this.playerMembers().length) return fail('Not enough seats for the selected players. Someone must choose to watch first.');
        this.playerCount = msg.count;
        this.resetReady();
        return this.roomChanged();
      case 'start':
        if (m.id !== this.hostId) return fail('Only the host can start.');
        if (this.status !== 'lobby') return;
        if (this.playerMembers().length < (this.allowBots ? 1 : 2)) return fail('Invite at least two friends before starting.');
        if (this.playerMembers().some(p => !p.peer || !p.ready)) return fail('Every player must be connected and ready.');
        return this.start();
      case 'rematch':
        if (m.id !== this.hostId) return fail('Only the host can start a rematch.');
        if (this.status !== 'over') return;
        this.status = 'lobby';
        this.game = null;
        this.seats = null;
        if (this.timer) this.clock.clearTimeout(this.timer);
        this.timer = null;
        this.resetReady();
        return this.roomChanged();
      case 'action':
        return this.act(m, msg.action);
      default:
        return;
    }
  }

  private start() {
    const players = this.playerMembers();
    const used = new Set(players.map((p) => p.character));
    const free = this.pack.characters.map((c) => c.id).filter((id) => !used.has(id));
    const seats: SeatView[] = players.map((p) => ({ owner: p.id, character: p.character!, covering: !p.peer }));
    while (this.allowBots && seats.length < this.playerCount) seats.push({ owner: null, character: free.shift()!, covering: false });
    // Shuffle seat order so the host doesn't always move first.
    for (let i = seats.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [seats[i], seats[j]] = [seats[j], seats[i]];
    }
    this.seats = seats;
    this.game = createGame(this.pack, {
      seed: randomInt(2 ** 31),
      players: seats.map((s) => ({ character: s.character, bot: s.owner === null })),
    });
    this.status = 'playing';
    const events = this.game.events.slice();
    this.seen = this.game.events.length;
    this.broadcast({ t: 'start', room: this.view(), board: this.game.board, state: toWire(this.game), events });
    this.schedule(animationMs(events));
  }

  private act(m: Member, action: Action) {
    const g = this.game;
    if (!g || this.status !== 'playing' || !this.seats) return m.peer?.send({ t: 'error', message: 'No game in progress.' });
    if (this.seats[g.turn].owner !== m.id) return m.peer?.send({ t: 'error', message: "It isn't your turn." });
    this.apply(action);
  }

  private apply(action: Action) {
    const g = this.game!;
    try {
      step(this.pack, g, action);
    } catch (err) {
      const owner = this.seats![g.turn].owner;
      if (owner) this.members.get(owner)?.peer?.send({ t: 'error', message: (err as Error).message });
      return;
    }
    const events = g.events.slice(this.seen);
    this.seen = g.events.length;
    if (g.phase === 'over') this.status = 'over';
    this.broadcast({ t: 'update', room: this.view(), state: toWire(g), events });
    this.schedule(animationMs(events));
  }

  /**
   * After each update: bots (and covered humans) act once clients have had time
   * to animate; connected humans get an idle timeout so a game can't stall.
   */
  private schedule(delay = 600) {
    if (this.timer) this.clock.clearTimeout(this.timer);
    this.timer = null;
    const g = this.game;
    if (!g || g.phase === 'over' || !this.seats) return;
    const seat = this.seats[g.turn];
    const owner = seat.owner ? this.members.get(seat.owner) : null;

    if (!owner) {
      this.timer = this.clock.setTimeout(() => this.apply(botAction(this.pack, g)), delay + 400);
      return;
    }
    if (!this.allowBots) return;
    const gone = !owner.peer;
    const wait = gone ? Math.max(delay, TIMING.disconnectGraceMs - (this.clock.now() - owner.lastSeen)) : delay + TIMING.idleTurnMs;
    this.timer = this.clock.setTimeout(() => {
      seat.covering = true;
      this.apply(botAction(this.pack, g));
    }, Math.max(delay, wait));
  }
}

function cleanName(name: string) {
  const n = name.replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 18);
  return n || 'Player';
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private where = new Map<Peer, { room: Room; member: string }>();

  constructor(private clock: Clock = realClock) {}

  private code() {
    for (;;) {
      const c = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      if (!this.rooms.has(c)) return c;
    }
  }

  handle(peer: Peer, msg: ClientMessage) {
    const at = this.where.get(peer);
    if (msg.t === 'create') {
      if (at) this.leave(peer, true);
      const v = validatePack(msg.pack);
      if (!v.ok) return peer.send({ t: 'error', message: `That world isn't valid: ${v.errors[0]}` });
      let profile: PlayerProfile;
      try { profile = validateProfile(msg.profile); } catch (e) { return peer.send({ t: 'error', message: (e as Error).message }); }
      const room = new Room(this.code(), '', v.pack, this.clock);
      this.rooms.set(room.code, room);
      const m = room.addMember(msg.name, peer, profile);
      room.hostId = m.id;
      room.broadcast({ t: 'room', room: room.view() });
      this.where.set(peer, { room, member: m.id });
      return;
    }
    if (msg.t === 'join') {
      if (at) this.leave(peer);
      const room = this.rooms.get(normalizeCode(msg.code));
      if (!room) return peer.send({ t: 'error', message: 'No room with that code. Check it and try again.' });
      const m = (msg.token && room.reconnect(msg.token, peer)) || null;
      if (m) return void this.where.set(peer, { room, member: m.id });
      if (room.members.size >= 12) return peer.send({ t: 'error', message: 'That room is full.' });
      const name = cleanName(msg.name);
      if ([...room.members.values()].some((m) => m.name.toLowerCase() === name.toLowerCase())) {
        return peer.send({ t: 'error', message: 'That name is already taken in this room. Choose another name.' });
      }
      let profile: PlayerProfile;
      try { profile = validateProfile(msg.profile); } catch (e) { return peer.send({ t: 'error', message: (e as Error).message }); }
      const fresh = room.addMember(msg.name, peer, profile);
      this.where.set(peer, { room, member: fresh.id });
      return;
    }
    if (msg.t === 'leave') return this.leave(peer, true);
    if (!at) return peer.send({ t: 'error', message: 'Join a room first.' });
    at.room.handle(at.member, msg);
  }

  leave(peer: Peer, permanent = false) {
    const at = this.where.get(peer);
    if (!at) return;
    this.where.delete(peer);
    at.room.disconnect(peer, permanent);
    if (at.room.members.size === 0) this.rooms.delete(at.room.code);
  }

  sweep() {
    for (const [code, room] of this.rooms) if (room.isAbandoned() || room.members.size === 0) this.rooms.delete(code);
  }
}
