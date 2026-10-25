import { randomInt } from 'node:crypto';
/** Six uppercase letters, four digits and two symbols, shuffled into twelve positions. */
export function createInviteCode() {
  const pick = (chars: string, count: number) => Array.from({ length: count }, () => chars[randomInt(chars.length)]);
  const chars = [...pick('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 6), ...pick('0123456789', 4), ...pick('!@#$%*?', 2)];
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}
