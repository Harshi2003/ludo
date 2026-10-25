import type { Action, Board, GameEvent, GameState, ThemePack } from '@ludo/engine';
import type { PlayerProfile } from './profile';
export * from './profile';

export type PlayerCount = 2 | 3 | 4;

/** Shared with the server so bot turns leave time for the client's animations. */
export const ANIMATION_TIMING = { stepMs: 360, rollMs: 1200 } as const;

export interface MemberView {
  id: string;
  name: string;
  connected: boolean;
  character: string | null;
  ready: boolean;
  profile: PlayerProfile;
}

export interface SeatView {
  /** Member who controls the seat; null = bot. */
  owner: string | null;
  character: string;
  /** True while a bot is covering for a disconnected or idle human. */
  covering: boolean;
}

export interface RoomView {
  code: string;
  status: 'lobby' | 'playing' | 'over';
  hostId: string;
  playerCount: PlayerCount;
  allowBots: boolean;
  members: MemberView[];
  seats: SeatView[] | null;
  worldName: string;
}

/** Game state on the wire: events travel separately, the board only once. */
export type WireState = Omit<GameState, 'events' | 'board'>;

export type ClientMessage = { requestId?: number } & (
  | { t: 'create'; name: string; pack: ThemePack; profile?: PlayerProfile }
  | { t: 'join'; code: string; name: string; token?: string; profile?: PlayerProfile }
  | { t: 'ready'; ready: boolean }
  | { t: 'bots'; enabled: boolean }
  | { t: 'pick'; character: string | null }
  | { t: 'players'; count: PlayerCount }
  | { t: 'start' }
  | { t: 'action'; action: Action }
  | { t: 'rematch' }
  | { t: 'leave' });

export type ServerMessage =
  | { t: 'ack'; requestId: number; error?: string }
  | { t: 'welcome'; you: { id: string; token: string }; room: RoomView; pack: ThemePack; board?: Board; state?: WireState }
  | { t: 'room'; room: RoomView }
  | { t: 'start'; room: RoomView; board: Board; state: WireState; events: GameEvent[] }
  | { t: 'update'; room: RoomView; state: WireState; events: GameEvent[] }
  | { t: 'error'; message: string };

export function toWire(s: GameState): WireState {
  const { events: _e, board: _b, ...rest } = s;
  return rest;
}

export function fromWire(w: WireState, board: Board, events: GameEvent[] = []): GameState {
  return { ...w, board, events };
}

/** Room codes avoid look-alike characters (0/O, 1/I). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
