export function partyInviteUrl(base: string, code: string) {
  const url = new URL('/party-ludo/online', base);
  url.searchParams.set('room', code);
  return url.toString();
}
export const validInviteCode = (code: string) => code.length === 12 && (code.match(/[A-Z]/g)?.length ?? 0) === 6 && (code.match(/[0-9]/g)?.length ?? 0) === 4 && (code.match(/[!@#$%*?]/g)?.length ?? 0) === 2;

/** Accept a copied invitation link or a code; old live rooms still use six hex digits. */
export function readInviteCode(input: string): string {
  const text = input.trim();
  if (/^https?:\/\//i.test(text)) {
    try {
      const code = new URL(text).searchParams.get('room');
      if (!code) throw new Error();
      return code.trim().toUpperCase();
    } catch { throw new Error('This invite link has no room code. Ask the host for a new invite.'); }
  }
  return text.toUpperCase();
}
export function prepareRoomEntry(connected: boolean, name: string, input?: string) {
  if (!connected) throw new Error('Party server is not connected yet. Check that the Party server is running, then try again.');
  if (!/^[a-zA-Z0-9 _.-]{1,18}$/.test(name.trim())) throw new Error('Enter your player name first (1–18 English letters, numbers, spaces, periods, hyphens, or underscores).');
  if (input === undefined) return { name: name.trim() };
  const code = readInviteCode(input);
  if (!code) throw new Error('Paste the room code or invite link from your host.');
  if (!validInviteCode(code) && !/^[A-F0-9]{6}$/.test(code)) throw new Error('Check the room code: 6 letters, 4 digits and 2 symbols (12 characters total), or paste the full invite link.');
  return { name: name.trim(), code };
}
