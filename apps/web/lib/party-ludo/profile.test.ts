import { describe, expect, it } from 'vitest';
import { ANIMAL_ICONS, DEFAULT_PROFILE, MAX_PHOTO_LENGTH, validateProfile } from './profile';
describe('Party profiles', () => {
  it('provides ten distinct named animal icons and a backwards compatible default', () => {
    expect(ANIMAL_ICONS).toHaveLength(10);
    expect(new Set(ANIMAL_ICONS.map(a => a.id)).size).toBe(10);
    expect(new Set(ANIMAL_ICONS.map(a => a.emoji)).size).toBe(10);
    expect(validateProfile(undefined)).toEqual(DEFAULT_PROFILE);
    for (const animal of ANIMAL_ICONS) expect(validateProfile({ kind: 'animal', animal: animal.id })).toEqual({ kind: 'animal', animal: animal.id });
  });
  it('accepts bounded JPEG data and strips extra properties', () => {
    const photo = { kind: 'photo', dataUrl: 'data:image/jpeg;base64,/9j/2Q==' };
    expect(validateProfile({ ...photo, extra: 'ignored' })).toEqual(photo);
  });
  it('rejects unknown animals, external images, SVG, markup, malformed or oversized photos', () => {
    for (const value of [null, 'fox', { kind: 'animal', animal: 'unknown' },
      ...['https://example.com/a.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)', 'data:image/jpeg;base64,invalid', 'data:image/jpeg;base64,/9j/' + 'A'.repeat(MAX_PHOTO_LENGTH)].map(dataUrl => ({ kind: 'photo', dataUrl }))]) {
      expect(() => validateProfile(value)).toThrow();
    }
  });
});
