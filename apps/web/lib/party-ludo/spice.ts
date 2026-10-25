import { CATEGORIES, QUESTIONS, type Category, type SpiceLevel } from './prompts';
/** Selected level is a ceiling; category fallback must obey the same ceiling. */
export function availableQuestions(maxSpiceLevel: SpiceLevel, category?: Category) {
  const source = category ? QUESTIONS[category] : CATEGORIES.flatMap(c => QUESTIONS[c]);
  return source.filter(q => q.spiceLevel <= maxSpiceLevel);
}
export function validateSpiceLevel(level: number): asserts level is SpiceLevel {
  if (![1, 2, 3].includes(level)) throw new Error('Choose Mild, Medium, or Spicy.');
}
