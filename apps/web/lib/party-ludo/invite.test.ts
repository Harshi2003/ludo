import { describe, expect, it } from 'vitest';
import { partyInviteUrl, prepareRoomEntry, readInviteCode } from './invite';
describe('Party room entry feedback', () => {
  it('accepts codes and complete invite links without losing reserved symbols', () => {
    const code = 'ABCDEF1234#?';
    expect(prepareRoomEntry(true, '  Alex  ', code.toLowerCase())).toEqual({ name: 'Alex', code });
    expect(prepareRoomEntry(true, 'Alex', partyInviteUrl('http://example.test', code))).toEqual({ name: 'Alex', code });
  });
  it('lets existing six-digit rooms be submitted to the server', () => {
    expect(prepareRoomEntry(true, 'Alex', ' a1b2c3 ')).toEqual({ name: 'Alex', code: 'A1B2C3' });
  });
  it('gives a specific reason instead of silently disabling Join', () => {
    expect(() => prepareRoomEntry(false, 'Alex', 'ABCDEF1234!?')).toThrow('server is not connected');
    expect(() => prepareRoomEntry(true, '', 'ABCDEF1234!?')).toThrow('player name first');
    expect(() => prepareRoomEntry(true, 'Alex', '')).toThrow('Paste the room code');
    expect(() => prepareRoomEntry(true, 'Alex', 'ABC123WRONG')).toThrow('Check the room code');
    expect(() => readInviteCode('https://example.test/party-ludo/online')).toThrow('no room code');
  });
  it('allows hosting with a name without requiring a room code', () => {
    expect(prepareRoomEntry(true, 'Alex')).toEqual({ name: 'Alex' });
  });
});
