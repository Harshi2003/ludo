import { magicPack } from '@ludo/themepack';
import type { Glyph, ThemePack, TileBase } from '@ludo/engine';
import { CATEGORIES, LABELS } from './prompts';
import { DEFAULT_PARTY_CONFIG } from './config';
export const ROUNDS = DEFAULT_PARTY_CONFIG.rounds;
export const TOKEN_NAMES = ['Nova', 'Ace', 'Luna', 'Jet'];
const glyphs: Glyph[] = ['question', 'bolt', 'crown', 'eye', 'heart'];
const bases: TileBase[] = ['mystery', 'speed', 'swap', 'elemental', 'shield'];
export const partyPack: ThemePack = structuredClone(magicPack);
partyPack.id = 'party-ludo';
// Party plays by its own card rules; drop the squad battle rules it would otherwise inherit.
partyPack.rules = { ...partyPack.rules, capture: undefined, winAt: undefined, bondMarch: undefined };
partyPack.art.backgroundUrl = '/party-ludo/party-lounge-v1.png';
partyPack.world = { name: 'Afterglow: Sip & Roll', tagline: 'Roll. Laugh. Keep it optional.',
  story: 'Move through a party of funny questions, quick challenges, and group surprises.', finish: 'Party Finale', startName: 'The Meet-Up' };
const zones = ['The Warm-Up', 'Laughing Lane', 'Spotlight Crossing', 'Afterparty Avenue', 'Finale Walk'];
partyPack.zones = partyPack.zones.map((z, i) => ({ ...z, name: zones[i], description: 'Roll into the next party challenge.' }));
partyPack.characters = partyPack.characters.map(({ squad: _squad, house: _house, ...c }, i) => ({ ...c, id: `party-${i}`, name: TOKEN_NAMES[i], title: 'Party guest', bio: 'Here for good company and a little friendly competition.' }));
partyPack.tiles = [
  { id: 'safe', name: 'Safe', description: 'Nothing happens. Take a breath.', base: 'sanctuary', category: 'structural', effects: [], weight: 0 },
  { id: 'drink', name: 'Drink', description: 'Take 1 sip of your own drink.', base: 'mystery', glyph: 'drop', category: 'neutral', effects: [], weight: 1 },
  { id: 'everyone', name: 'Everyone Drinks', description: 'Everyone: take 1 sip of your own drink.', base: 'mystery', glyph: 'heart', category: 'neutral', effects: [], weight: 1 },
  { id: 'lucky', name: 'Lucky', description: 'Move forward 2 steps! A secondary Lucky stop grants a penalty shield instead.', base: 'speed', glyph: 'star', category: 'helpful', effects: [], weight: 1 },
  { id: 'trap', name: 'Trap', description: 'Move back 2 steps or lose your next turn.', base: 'trap', glyph: 'skull', category: 'harmful', effects: [], weight: 1 },
  ...CATEGORIES.map((category, i) => ({ id: category, name: LABELS[category], description: `Draw a ${LABELS[category]} card. Answer or complete the task. Skipping draws a random penalty.`,
    base: bases[i], glyph: glyphs[i], category: 'neutral' as const, effects: [], weight: 1 })),
];
