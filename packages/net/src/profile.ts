export const ANIMAL_ICONS = [
  { id: 'fox', name: 'Fox', emoji: '🦊' }, { id: 'cat', name: 'Cat', emoji: '🐱' },
  { id: 'dog', name: 'Dog', emoji: '🐶' }, { id: 'panda', name: 'Panda', emoji: '🐼' },
  { id: 'bear', name: 'Bear', emoji: '🐻' }, { id: 'rabbit', name: 'Rabbit', emoji: '🐰' },
  { id: 'tiger', name: 'Tiger', emoji: '🐯' }, { id: 'lion', name: 'Lion', emoji: '🦁' },
  { id: 'koala', name: 'Koala', emoji: '🐨' }, { id: 'penguin', name: 'Penguin', emoji: '🐧' },
] as const;
export type AnimalId = typeof ANIMAL_ICONS[number]['id'];
export type PlayerProfile = { kind: 'animal'; animal: AnimalId } | { kind: 'photo'; dataUrl: string };
export const DEFAULT_PROFILE: PlayerProfile = { kind: 'animal', animal: 'fox' };
export const MAX_PHOTO_LENGTH = 64 * 1024;
export function validatePlayerName(value: string): string {
  const name = value.trim();
  if (!/^[\p{L}\p{N} _.'-]{1,18}$/u.test(name)) throw new Error("Use 1–18 letters, numbers, spaces, periods, hyphens or underscores for your name.");
  return name;
}
/** Only bounded, embedded JPEGs; never accept external URLs, SVG, or arbitrary markup. */
export function validateProfile(value: unknown): PlayerProfile {
  if (value === undefined) return { ...DEFAULT_PROFILE };
  if (!value || typeof value !== 'object') throw new Error('Choose a valid profile.');
  const p = value as Record<string, unknown>;
  if (p.kind === 'animal' && ANIMAL_ICONS.some(a => a.id === p.animal)) return { kind: 'animal', animal: p.animal as AnimalId };
  if (p.kind === 'photo' && typeof p.dataUrl === 'string' && p.dataUrl.length <= MAX_PHOTO_LENGTH && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(p.dataUrl)) return { kind: 'photo', dataUrl: p.dataUrl };
  throw new Error('Choose an animal icon or upload a valid profile photo.');
}
