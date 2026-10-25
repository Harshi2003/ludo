import type { PlayerProfile } from './profile';
import type { PartyAction, PartyState } from './rules';
export type PartyFeed = { code: string; seat: number; host: boolean; names: string[]; memberIds: string[]; ready: boolean[]; spiceLevel: 1 | 2 | 3; profiles: PlayerProfile[]; connected: boolean[]; state: PartyState | null; revision: number; action?: string; locked: boolean };
export function actingSeat(s: PartyState): number {
  if (s.phase === 'card' && s.card?.category === 'likely') return s.card.votes.length;
  if (s.phase === 'card' && s.card?.category === 'never') return s.card.responses.length;
  return s.turn;
}
export function canAct(s: PartyState, seat: number, action?: PartyAction): boolean {
  if (s.result?.privateVote && !s.result.privateVote.done) return !s.result.privateVote.checked && (!action || action.type === 'reveal-vote' || action.type === 'hide-vote');
  return actingSeat(s) === seat;
}
