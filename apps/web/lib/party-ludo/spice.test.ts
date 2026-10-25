import { describe, expect, it } from 'vitest';
import { availableQuestions } from './spice';
import { createPartyGame, drawCard } from './rules';
import { DEFAULT_PARTY_CONFIG } from './config';
import { QUESTION_BY_ID, type SpiceLevel } from './prompts';

describe('Party question spice selection', () => {
  it.each([1, 2, 3] as const)('honors level %i through category exhaustion and fallback without repeats', level => {
    const s = createPartyGame(2, 17, DEFAULT_PARTY_CONFIG, level);
    const expected = availableQuestions(level);
    expect(expected).toHaveLength(level === 1 ? 45 : 50);
    const seen = new Set<string>();
    for (let i = 0; i < expected.length; i++) {
      const card = drawCard(s, 'truth')!;
      expect(card).not.toBeNull();
      expect(QUESTION_BY_ID[card.questionId].spiceLevel).toBeLessThanOrEqual(level);
      expect(seen.has(card.questionId)).toBe(false);
      seen.add(card.questionId);
    }
    expect(drawCard(s, 'rather')).toBeNull();
    expect([...seen].sort()).toEqual(expected.map(q => q.id).sort());
  });

  it('changes only question eligibility, preserving the board, players, and initial random state', () => {
    const mild = createPartyGame(4, 123, DEFAULT_PARTY_CONFIG, 1);
    const spicy = createPartyGame(4, 123, DEFAULT_PARTY_CONFIG, 3);
    expect(mild.maxSpiceLevel).toBe(1);
    expect(spicy).toEqual({ ...mild, maxSpiceLevel: 3 });
  });

  it('rejects invalid levels before creating a game', () => {
    for (const value of [0, 4, 1.5, NaN]) {
      expect(() => createPartyGame(2, 17, DEFAULT_PARTY_CONFIG, value as SpiceLevel)).toThrow('Choose Mild, Medium, or Spicy.');
    }
  });
});
