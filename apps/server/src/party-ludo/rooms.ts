import { createInviteCode } from './invite';
import { ANIMATION_TIMING, validatePlayerName } from '@ludo/net';
import { validateSpiceLevel } from '../../../web/lib/party-ludo/spice';
import { validateProfile, type PlayerProfile } from '../../../web/lib/party-ludo/profile';
import { randomBytes, randomInt } from 'node:crypto';
import { createPartyGame, partyStep, voteLeaders, type PartyAction, type PartyState } from '../../../web/lib/party-ludo/rules';
import { DEFAULT_PARTY_CONFIG } from '../../../web/lib/party-ludo/config';
import { canAct, type PartyFeed } from '../../../web/lib/party-ludo/online';
type Peer = { send(data: string): void };
type Member = { id: string; ready: boolean; token: string; name: string; profile: PlayerProfile; peer: Peer | null };
type Room = { code: string; spiceLevel: 1 | 2 | 3; removedTokens: Set<string>; members: Member[]; state: PartyState | null; revision: number; until: number; reveals: Set<number>; checked: Set<number> };
export class PartyRooms {
  rooms = new Map<string, Room>();
  where = new Map<Peer, { room: Room; seat: number }>();
  send(peer: Peer, message: unknown) { peer.send(JSON.stringify(message)); }
  publish(r: Room, action?: string) {
    r.members.forEach((m, seat) => {
      if (!m.peer) return;
      const state = r.state ? structuredClone(r.state) : null;
      if (state?.card) {
        const privateResult = state.result?.privateVote;
        if (privateResult) {
          const done = r.checked.size === r.members.length;
          state.result!.privateVote = { seat, done, checked: r.checked.has(seat), revealed: !done && r.reveals.has(seat),
            selected: !done && r.reveals.has(seat) ? voteLeaders(r.state!).includes(seat) : undefined };
        }
        // Never transmit other guests' ballots, even to browser developer tools.
        state.card.votes = state.card.votes.map(() => -1);
      }
      const feed: PartyFeed = { code: r.code, seat, host: seat === 0, names: r.members.map(m => m.name), memberIds: r.members.map(m => m.id), ready: r.members.map(m => m.ready), spiceLevel: r.spiceLevel, profiles: r.members.map(m => m.profile), connected: r.members.map(m => !!m.peer), state, revision: r.revision, action, locked: Date.now() < r.until };
      this.send(m.peer, { t: 'feed', feed });
    });
  }
  handle(peer: Peer, msg: any) {
    try {
      if (!msg || typeof msg !== 'object') throw new Error('Invalid message.');
      if (msg.t === 'create' || msg.t === 'join') {
        if (this.where.has(peer)) throw new Error('Leave your current room first.');
        const name = typeof msg.name === 'string' ? msg.name.trim() : '';
        if (msg.t === 'create' || !msg.token) validatePlayerName(name);
        const profile = validateProfile(msg.profile);
        let r: Room;
        if (msg.t === 'create') {
          let code: string; do { code = createInviteCode(); } while (this.rooms.has(code));
          r = { code, spiceLevel: 1, removedTokens: new Set(), members: [], state: null, revision: 0, until: 0, reveals: new Set(), checked: new Set() }; this.rooms.set(code, r);
        } else {
          r = this.rooms.get(String(msg.code).trim().toUpperCase())!;
          if (!r) throw new Error('Room not found.');
        }
        if (msg.token && r.removedTokens.has(msg.token)) throw new Error('You were removed from this room.');
        let seat = typeof msg.token === 'string' ? r.members.findIndex(m => m.token === msg.token) : -1;
        if (seat >= 0 && r.members[seat].peer) throw new Error('This seat is already connected. Close the other tab first.');
        if (seat < 0) {
          if (r.state) throw new Error('This game has started. Rejoin with your original browser.');
          if (r.members.length >= 4) throw new Error('This room is full.');
          validatePlayerName(name);
          if (r.members.some(m => m.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('That name is already taken in this room. Choose another name.');
          seat = r.members.length; r.members.push({ id: randomBytes(8).toString('hex'), ready: false, token: randomBytes(24).toString('hex'), name, profile, peer });
        } else r.members[seat].peer = peer;
        if (!r.state) r.members.forEach(m => m.ready = false);
        this.where.set(peer, { room: r, seat });
        this.send(peer, { t: 'session', code: r.code, token: r.members[seat].token }); this.publish(r); return;
      }
      const at = this.where.get(peer); if (!at) throw new Error('Join a room first.');
      const { room: r, seat } = at;
      if (msg.t === 'leave') {
        if (r.state) throw new Error('A running game keeps your seat for reconnection.');
        this.where.delete(peer); r.members.splice(seat, 1); r.members.forEach(m => m.ready = false);
        r.members.forEach((m, i) => { if (m.peer) this.where.set(m.peer, { room: r, seat: i }); });
        if (!r.members.length) this.rooms.delete(r.code); else this.publish(r);
        return;
      }
      if (msg.t === 'ready') {
        if (r.state || typeof msg.ready !== 'boolean') throw new Error('Ready is available in the lobby only.');
        r.members[seat].ready = msg.ready; this.publish(r); return;
      }
      if (msg.t === 'spice') {
        if (seat !== 0 || r.state) throw new Error('Only the host can change lobby settings.');
        validateSpiceLevel(msg.spiceLevel); r.spiceLevel = msg.spiceLevel;
        r.members.forEach(m => m.ready = false); this.publish(r); return;
      }
      if (msg.t === 'kick') {
        if (seat !== 0 || r.state) throw new Error('Only the host can remove players in the lobby.');
        const target = r.members.findIndex(m => m.id === msg.memberId);
        if (target <= 0) throw new Error('Choose another player in this room.');
        const member = r.members[target]; r.removedTokens.add(member.token);
        if (member.peer) { this.where.delete(member.peer); this.send(member.peer, { t: 'kicked', message: 'The host removed you from the room.' }); }
        r.members.splice(target, 1); r.members.forEach(m => m.ready = false);
        r.members.forEach((m, i) => { if (m.peer) this.where.set(m.peer, { room: r, seat: i }); });
        this.publish(r); return;
      }
      if (msg.t === 'rematch') {
        if (seat !== 0 || r.state?.phase !== 'over') throw new Error('Only the host can return a finished game to the lobby.');
        r.state = null; r.until = 0; r.members.forEach(m => m.ready = false); r.revision++; this.publish(r); return;
      }
      if (msg.t === 'start') {
        if (seat !== 0 || r.state) throw new Error('Only the host can start a new game.');
        if (r.members.length < 2 || r.members.some(m => !m.peer)) throw new Error('Connect 2–4 players before starting.');
        if (r.members.some(m => !m.ready)) throw new Error('Every player, including the host, must be ready.');
        if (msg.spiceLevel !== undefined && msg.spiceLevel !== r.spiceLevel) throw new Error('Lobby settings changed. Confirm the spice level and ready up again.');
        r.state = createPartyGame(r.members.length, randomInt(2 ** 31), DEFAULT_PARTY_CONFIG, r.spiceLevel);
        r.state.players.forEach((p, i) => p.name = r.members[i].name);
        r.reveals.clear(); r.checked.clear(); r.revision++; this.publish(r); return;
      }
      if (msg.t !== 'action' || !r.state) throw new Error('No active game.');
      if (msg.revision !== r.revision) throw new Error('The game changed. Try again.');
      if (Date.now() < r.until) throw new Error('Wait for the animation to finish.');
      const a = msg.action as PartyAction;
      if (!a || !canAct(r.state, seat, a)) throw new Error('Wait for your turn.');
      if (r.state.result?.privateVote && !r.state.result.privateVote.done) {
        if (a.type === 'reveal-vote' && !r.checked.has(seat)) r.reveals.add(seat);
        else if (a.type === 'hide-vote' && r.reveals.has(seat)) { r.reveals.delete(seat); r.checked.add(seat); }
        else throw new Error('Reveal your own result, then hide it.');
        if (r.checked.size === r.members.length) r.state.result.privateVote.done = true;
        r.state.motions = [];
      } else {
        r.state = partyStep(r.state, a);
        if (r.state.result?.privateVote) { r.reveals.clear(); r.checked.clear(); }
      }
      r.revision++;
      const ms = a.type === 'roll' ? ANIMATION_TIMING.rollMs + 100 : r.state.motions.reduce((sum, m) => sum + m.path.length * ANIMATION_TIMING.stepMs + 800, 0);
      r.until = Date.now() + ms;
      this.publish(r, a.type);
      if (ms) setTimeout(() => this.publish(r), ms + 30).unref();
    } catch (e) { this.send(peer, { t: 'error', message: e instanceof Error ? e.message : 'Invalid action.' }); }
  }
  leave(peer: Peer) {
    const at = this.where.get(peer); if (!at) return;
    this.where.delete(peer); at.room.members[at.seat].peer = null; if (!at.room.state) at.room.members.forEach(m => m.ready = false); this.publish(at.room);
    if (at.room.members.every(m => !m.peer)) setTimeout(() => {
      if (at.room.members.every(m => !m.peer)) this.rooms.delete(at.room.code);
    }, 30 * 60_000).unref();
  }
}
