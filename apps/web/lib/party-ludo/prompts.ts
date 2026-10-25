/** Curated local data: append reviewed entries with stable IDs to expand to 150+. */
export const CATEGORIES = ['truth', 'dare', 'likely', 'never', 'rather'] as const;
export type Category = typeof CATEGORIES[number];
export const LABELS: Record<Category, string> = {
  truth: 'Truth', dare: 'Dare / Challenge', likely: 'Most Likely To', never: 'Never Have I Ever', rather: 'Would You Rather',
};
export type SpiceLevel = 1 | 2 | 3;
export const SPICE_LABELS: Record<SpiceLevel, string> = { 1: 'Mild', 2: 'Medium', 3: 'Spicy' };
export type SpiceAssessment = {
  spiceLevel: SpiceLevel;
  spiceReview: {
    basis: 'content' | 'source-rating';
    needsReview: boolean;
    reason: string;
    /** Preserve a source's raw rating; do not assume it equals our spice scale. */
    originalRating?: string;
  };
};
function assess(spiceLevel: SpiceLevel, reason: string, needsReview = false): SpiceAssessment {
  return { spiceLevel, spiceReview: { basis: 'content', needsReview, reason } };
}
// Editorial assessment of these selected entries, not a default for future imports.
const MILD: Record<Category, SpiceAssessment> = {
  truth: assess(1, 'Light personal preferences or harmless anecdotes; no intimate disclosure requested.'),
  dare: assess(1, 'Brief, adaptable performance task without intimacy, contact, or private information.'),
  likely: assess(1, 'Playful group prediction about harmless everyday behavior.'),
  never: assess(1, 'Ordinary travel, food, hobby, or pet experience; no intimate disclosure requested.'),
  rather: assess(1, 'Fictional abilities or lifestyle preferences without explicit or intimate content.'),
};
export type Question = SpiceAssessment & { id: string; category: Category; text: string; options?: readonly [string, string];
  source: { repository: string; file: string; locator: string; adapted: boolean } };
const repo = 'https://github.com/itsbrunodev/party-game-sentences';
function sourced(category: Category, text: string, locator: string, assessment: SpiceAssessment, adapted = false): Question {
  const file = category === 'never' ? 'src/json/never-have-i-ever.json' : 'src/json/truth-or-dare.json';
  return { ...assessment, id: `${category}-${locator.replace(/[^a-z0-9]+/gi, '-')}`, category, text,
    source: { repository: repo, file, locator, adapted: adapted || category === 'never' } };
}
export const QUESTIONS: Record<Category, readonly Question[]> = {
  truth: [
    sourced('truth', 'What is your secret talent?', 'truth[5]', MILD.truth),
    sourced('truth', 'What is your guilty pleasure?', 'truth[7]', assess(2, 'Guilty pleasure can mean a harmless preference or an intimate disclosure; review the intended interpretation.', true)),
    sourced('truth', "What is the weirdest dream you've ever had?", 'truth[11]', MILD.truth),
    sourced('truth', 'What is your most annoying habit?', 'truth[13]', assess(2, 'Admitting an annoying habit may feel like light teasing or a more personal judgment depending on the group.', true)),
    sourced('truth', "What is the worst gift you've ever received?", 'truth[17]', assess(2, 'Discussing an unwanted gift can create interpersonal embarrassment if the giver is present.', true)),
    sourced('truth', 'What is your most embarrassing nickname?', 'truth[29]', assess(2, 'An embarrassing nickname may be playful or connected to unwanted teasing; group context matters.', true)),
    sourced('truth', "What is the strangest thing you've ever eaten?", 'truth[31]', MILD.truth),
    sourced('truth', 'Have you ever had a crush on a fictional character?', 'truth[50]', assess(2, 'Asks about a romantic preference involving a fictional character, without explicit detail.')),
    sourced('truth', 'Have you ever worn mismatched socks on purpose?', 'truth[52]', MILD.truth),
    sourced('truth', 'What is the silliest fear you have?', 'truth[57]', MILD.truth),
  ],
  dare: [
    sourced('dare', 'Do a seated chicken dance for ten seconds, or describe your best chicken dance.', 'dare[4]', MILD.dare, true),
    sourced('dare', 'Say one sentence in slow motion.', 'dare[11]', MILD.dare, true),
    sourced('dare', 'Dance like a robot for ten seconds, or describe a robot dance.', 'dare[19]', MILD.dare, true),
    sourced('dare', 'Hum a song with your mouth closed for ten seconds.', 'dare[42]', MILD.dare, true),
    sourced('dare', 'Do a dramatic reenactment of your favorite movie scene for ten seconds.', 'dare[50]', MILD.dare, true),
    sourced('dare', 'Recite a two-line poem about your favorite vegetable.', 'dare[52]', MILD.dare, true),
    sourced('dare', 'Put on a ten-second puppet show using your hands.', 'dare[75]', MILD.dare, true),
    sourced('dare', 'Try reciting the alphabet backward for ten seconds.', 'dare[107]', MILD.dare, true),
    sourced('dare', 'Say “red lorry, yellow lorry” three times.', 'dare[115]', MILD.dare, true),
    sourced('dare', 'Perform a ten-second improvised rap about an object in the room.', 'dare[151]', MILD.dare, true),
  ],
  never: [
    sourced('never', 'Never have I ever traveled to a different continent.', 'index-1', MILD.never),
    sourced('never', 'Never have I ever eaten sushi.', 'index-2', MILD.never),
    sourced('never', 'Never have I ever dyed my hair a wild color.', 'index-8', MILD.never),
    sourced('never', 'Never have I ever tried karaoke.', 'index-10', MILD.never),
    sourced('never', 'Never have I ever gone camping.', 'index-12', MILD.never),
    sourced('never', 'Never have I ever been on a road trip.', 'index-14', MILD.never),
    sourced('never', 'Never have I ever gone ice skating.', 'index-19', MILD.never),
    sourced('never', 'Never have I ever been in a play or musical.', 'index-20', MILD.never),
    sourced('never', 'Never have I ever attended a music festival.', 'index-26', MILD.never),
    sourced('never', 'Never have I ever had a pet other than a cat or dog.', 'index-28', MILD.never),
  ],
  likely: [
    'Who is most likely to pack snacks for a five-minute trip?',
    'Who is most likely to name every houseplant?',
    'Who is most likely to turn a small story into a theatrical production?',
    'Who is most likely to befriend the villain in a movie?',
    'Who is most likely to start a dance party in an elevator?',
    'Who is most likely to become famous completely by accident?',
    'Who is most likely to have a secret karaoke alter ego?',
    'Who is most likely to give a pet an elaborate birthday party?',
    'Who is most likely to survive a week using only movie quotes?',
    'Who is most likely to make friends while waiting in any line?',
  ].map((text, i) => ({ ...MILD.likely, id: `likely-${i + 1}`, category: 'likely' as const, text,
    source: { repository: 'local-original', file: 'prompts.ts', locator: `likely-${i + 1}`, adapted: false } })),
  rather: [
    ['Have the ability to fly', 'Be invisible'],
    ['Read minds', 'See into the future'],
    ['Be a famous actor', 'Be a renowned athlete'],
    ['Have unlimited money', 'Have unlimited knowledge'],
    ['Meet your ancestors', 'Meet your descendants'],
    ['Speak every language', 'Play every musical instrument'],
    ['Live without music', 'Live without movies'],
    ['Have super strength', 'Have super speed'],
    ['Be able to teleport', 'Be able to time travel'],
    ['Have a photographic memory', 'Be able to forget anything you choose'],
  ].map((pair, i) => {
    const options = pair as [string, string];
    return { ...MILD.rather, id: `rather-${i + 1}`, category: 'rather' as const, text: `Would you rather ${options[0].charAt(0).toLowerCase() + options[0].slice(1)} or ${options[1].charAt(0).toLowerCase() + options[1].slice(1)}?`, options,
      source: { repository: repo, file: 'src/json/would-you-rather.json', locator: `index-${[0, 2, 3, 4, 5, 7, 8, 9, 13, 14][i]}`, adapted: true } };
  }),
};
export const QUESTION_BY_ID = Object.fromEntries(Object.values(QUESTIONS).flat().map(q => [q.id, q])) as Record<string, Question>;
