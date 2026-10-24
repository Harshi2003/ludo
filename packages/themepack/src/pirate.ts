import type { ThemePack } from '@ludo/engine';

/**
 * A complete generated-style world. Used as the mock AI response (FORGE_MOCK=1)
 * so the creation pipeline can be exercised without an API key, and in tests.
 */
export const pirateFixture: ThemePack = {
  id: 'pirate-treasure-war',
  world: {
    name: 'Pirate Ludo: The Sunken Crown',
    tagline: 'Four captains. One treasure.',
    story:
      'The Sunken Crown has surfaced in the vault of Skull Rock. Four rival captains race their crews across coral reefs, cannon-swept straits and haunted shipwrecks. Steal, sink and outsail your rivals — the sea remembers only the one who claims the gold.',
    finish: 'Skull Rock Vault',
    startName: 'Harbor Docks',
  },
  zones: [
    { id: 'reef', name: 'Coral Reef', type: 'crossing', length: 10, danger: 'low', description: 'Shallow channels cross between bright coral.', decor: 'forest' },
    { id: 'strait', name: 'Cannon Strait', type: 'merge', length: 9, danger: 'high', description: 'Every ship squeezes through the narrow strait under fort cannons.', decor: 'falls' },
    { id: 'wrecks', name: 'Shipwreck Shoals', type: 'branch', length: 9, danger: 'high', description: 'Two routes through the rotting hulls — both haunted.', decor: 'peaks' },
    { id: 'isles', name: 'Lantern Isles', type: 'lane', length: 8, danger: 'medium', description: 'Rope bridges link the lantern-lit islands.', decor: 'sky' },
    { id: 'rock', name: 'Skull Rock', type: 'funnel', length: 6, danger: 'high', description: 'One narrow passage to the vault.', decor: 'crystal' },
  ],
  tiles: [
    { id: 'planks', base: 'normal', name: 'Deck Planks', description: 'Weathered timber.', category: 'structural', effects: [], weight: 0 },
    { id: 'cove', base: 'sanctuary', name: 'Hidden Cove', description: 'No fighting in the cove.', category: 'structural', effects: [], weight: 0, glyph: 'anchor' },
    { id: 'tunnel', base: 'portal', name: 'Smuggler Tunnel', description: 'Duck into the tunnel and pop out at its twin.', category: 'structural', effects: [{ op: 'teleport', to: 'portal_pair' }], weight: 0 },
    { id: 'wind', base: 'speed', name: 'Trade Wind', description: 'Full sails! Dash 3 forward.', category: 'helpful', effects: [{ op: 'dash', n: 3 }], weight: 3, glyph: 'wind' },
    { id: 'rum', base: 'mystery', name: 'Rum Barrel', description: 'A swig of courage: roll again.', category: 'helpful', effects: [{ op: 'extra_roll' }], weight: 2, glyph: 'heart' },
    { id: 'hull', base: 'shield', name: 'Iron Hull', description: 'Armour plating blocks the next attack.', category: 'helpful', effects: [{ op: 'shield', target: { who: 'self' }, charges: 1, turns: 3 }], weight: 2 },
    { id: 'cannon', base: 'lightning', name: 'Fort Cannon', description: 'Cannon fire! Blown back 3.', category: 'harmful', effects: [{ op: 'move', target: { who: 'self' }, n: -3 }], weight: 3, glyph: 'bolt' },
    { id: 'kraken', base: 'trap', name: 'Kraken Grip', description: 'Tentacles hold you fast: lose a turn.', category: 'harmful', effects: [{ op: 'skip_turn', target: { who: 'self' }, n: 1 }], weight: 2, glyph: 'skull' },
    { id: 'curse', base: 'curse', name: 'Cursed Doubloon', description: 'Your rolls are halved for 2 turns.', category: 'harmful', effects: [{ op: 'modify_dice', target: { who: 'self' }, mode: 'halve', turns: 2 }], weight: 2 },
    { id: 'mutiny', base: 'swap', name: 'Mutiny', description: 'Crews swap ships with the nearest captain within 8.', category: 'neutral', effects: [{ op: 'swap', target: { who: 'nearest', range: 8 } }], weight: 2 },
    {
      id: 'map', base: 'mystery', name: 'Treasure Map', description: 'X marks… something.', category: 'neutral', weight: 3,
      effects: [{ op: 'random', options: [
        [{ op: 'dash', n: 4 }],
        [{ op: 'move', target: { who: 'self' }, n: -3 }],
        [{ op: 'charge_ultimate', target: { who: 'self' }, n: 3 }],
        [{ op: 'skip_turn', target: { who: 'leader' }, n: 1 }],
      ] }],
    },
    {
      id: 'gold', base: 'elemental', name: 'Gold Hoard', description: 'Plunder favours the bold (+3 charge, roll again for Redbeard). Others trip over coins: back 2.', category: 'neutral', weight: 1, element: 'gunpowder', glyph: 'gem',
      effects: [{ op: 'if_element', element: 'gunpowder', then: [{ op: 'charge_ultimate', target: { who: 'self' }, n: 3 }, { op: 'extra_roll' }], else: [{ op: 'move', target: { who: 'self' }, n: -2 }] }],
    },
  ],
  characters: [
    {
      id: 'redbeard', name: 'Redbeard', title: 'Captain of the Inferno Gale', element: 'gunpowder', role: 'attacker', color: '#f97316', glyph: 'flame',
      bio: 'Loud, reckless and never out of powder. Redbeard settles every argument with a broadside.',
      passive: { id: 'plunder', name: 'Plunder', description: 'Every ship you sink stokes your Broadside (+2 charge).', triggers: [{ on: 'capture', effects: [{ op: 'charge_ultimate', target: { who: 'self' }, n: 2 }] }] },
      active: { id: 'chain-shot', name: 'Chain Shot', description: 'Fire on the nearest ship ahead within 5: it limps back 4.', cooldown: 3, requires: { who: 'nearest', range: 5, side: 'ahead' }, effects: [{ op: 'move', target: { who: 'nearest', range: 5, side: 'ahead' }, n: -4 }] },
      ultimate: { id: 'broadside', name: 'Broadside', description: 'Every ship ahead within 7 is blasted back 4, and you surge 2 through the smoke.', cost: 8, requires: { who: 'all', range: 7, side: 'ahead' }, effects: [{ op: 'move', target: { who: 'all', range: 7, side: 'ahead' }, n: -4 }, { op: 'dash', n: 2 }] },
    },
    {
      id: 'marina', name: 'Marina', title: 'Siren of the Deep', element: 'tide', role: 'controller', color: '#22d3ee', glyph: 'drop',
      bio: 'She sings, the sea listens, and rival crews steer straight into the rocks.',
      passive: { id: 'siren-song', name: 'Siren Song', description: 'Starts each voyage protected by a bubble that blocks the first attack.', startShield: 1 },
      active: { id: 'undertow', name: 'Undertow', description: 'Drag the leading ship within 8 back 3.', cooldown: 4, requires: { who: 'leader', range: 8, side: 'ahead' }, effects: [{ op: 'move', target: { who: 'leader', range: 8, side: 'ahead' }, n: -3 }] },
      ultimate: { id: 'whirlpool', name: 'Maelstrom', description: 'Every ship within 5 is spun around and loses its next turn.', cost: 10, requires: { who: 'all', range: 5 }, effects: [{ op: 'skip_turn', target: { who: 'all', range: 5 }, n: 1 }] },
    },
    {
      id: 'ironhook', name: 'Ironhook', title: 'Warden of the Iron Fleet', element: 'iron', role: 'defender', color: '#a3a3a3', glyph: 'anchor',
      bio: 'Slow to anger, impossible to sink. Ironhook drops anchor and dares you to try.',
      passive: { id: 'anchored', name: 'Anchored', description: 'Cannot be pushed or pulled by other captains.', pushImmune: true },
      active: { id: 'boarding-net', name: 'Boarding Net', description: 'Throw a net across the lead ship’s bow: its way forward is sealed for a turn.', cooldown: 5, requires: { who: 'leader', range: 8, side: 'ahead' }, effects: [{ op: 'block_tile', target: { who: 'leader', range: 8, side: 'ahead' }, turns: 1 }] },
      ultimate: { id: 'dreadnought', name: 'Dreadnought', description: 'Raise the iron plates: shield for 3 turns and charge 3 forward.', cost: 9, effects: [{ op: 'shield', target: { who: 'self' }, charges: 2, turns: 3 }, { op: 'dash', n: 3 }] },
    },
    {
      id: 'wisp', name: 'Wisp', title: 'Ghost of the Black Sails', element: 'mist', role: 'mover', color: '#c084fc', glyph: 'eye',
      bio: 'Nobody has seen Wisp’s ship arrive. Only leave.',
      passive: { id: 'phantom-wake', name: 'Phantom Wake', description: 'A roll of 1 counts as 2.', diceFloor: 2 },
      active: { id: 'fog-sail', name: 'Fog Sail', description: 'Glide 2 tiles forward through nets and rival ships.', cooldown: 4, effects: [{ op: 'dash', n: 2 }] },
      ultimate: { id: 'ghost-ship', name: 'Ghost Ship', description: 'Vanish into the mist and reappear at the farthest safe water within 7, shielded.', cost: 10, effects: [{ op: 'teleport', to: 'safe_ahead', range: 7 }, { op: 'shield', target: { who: 'self' }, charges: 1, turns: 2 }] },
    },
  ],
  rules: {
    stormRound: { 2: 22, 3: 24, 4: 26 },
    stormName: 'The Hurricane Hits',
    extraRollOnSix: true,
    ultimateCharge: { turn: 1, capture: 2, captured: 3 },
  },
  art: {
    style: 'golden-age pirate adventure, moonlit Caribbean, lantern glow, painterly',
    palette: { bg: '#06141f', surface: '#0d2333', primary: '#f59e0b', accent: '#2dd4bf', text: '#f5f0e6' },
    zoneColors: { reef: '#2dd4bf', strait: '#f97316', wrecks: '#a78bfa', isles: '#fbbf24', rock: '#e2e8f0' },
  },
};
