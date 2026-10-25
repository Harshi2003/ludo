import type { ThemePack } from '@ludo/engine';
import { PORTRAITS } from './portraits';

/**
 * Aetherfall: the deep world. Three pieces per house, bonds that cast together,
 * and a power set where no two pieces do the same job.
 */
export const magicPack: ThemePack = {
  id: 'magic-elements',
  world: {
    name: 'Aetherfall: War of the Four Elements',
    tagline: 'Twelve legends. Four bloodlines. One crystal throne.',
    story:
      'The sky cracked open and the Crystal Throne fell to earth, still burning with starlight. Four elemental houses march on it at once: the Embers who set the road on fire, the Tides who drag their enemies under, the Stone who freeze the world in place and the Gales who never fight alone. Stand together and your powers multiply. Stand alone and you fall.',
    finish: 'Crystal Throne',
    startName: 'House Gates',
  },
  zones: [
    { id: 'forest', name: 'Whisperwood', type: 'crossing', length: 10, danger: 'low', description: 'Ancient trails cross beneath trees that remember every war. Easy ground to gather your house.' },
    { id: 'falls', name: 'Thundering Falls', type: 'merge', length: 9, danger: 'high', description: 'Every road pours onto the narrow bridges. Somebody always goes over the edge.' },
    { id: 'ridge', name: 'Dragonspine Ridge', type: 'branch', length: 9, danger: 'high', description: 'High pass or low pass. Both are scorched black, and both are hunted.' },
    { id: 'ladders', name: 'Moonrung Ladders', type: 'lane', length: 8, danger: 'medium', description: 'Starlight rungs let legends leap between lanes. Watch who climbs beside you.' },
    { id: 'gate', name: 'Throne Approach', type: 'funnel', length: 6, danger: 'high', description: 'One road and no cover. Whoever leads stands alone in the open.' },
  ],
  tiles: [
    { id: 'path', base: 'normal', name: 'Starlit Path', description: 'Old stone, still warm with starlight.', category: 'structural', effects: [], weight: 0 },
    { id: 'sanctuary', base: 'sanctuary', name: 'Moonwell', description: 'Sacred water. No blade falls here.', category: 'structural', effects: [], weight: 0 },
    { id: 'portal', base: 'portal', name: 'Arcane Gate', description: 'Step in here, step out at its twin.', category: 'structural', effects: [{ op: 'teleport', to: 'portal_pair' }], weight: 0 },
    { id: 'rally', base: 'speed', glyph: 'crown', name: 'Rally Banner', description: 'Your banner rises: a squadmate within 6 is summoned to your side.', category: 'helpful', effects: [{ op: 'recall', range: 6 }], weight: 3 },
    { id: 'aegis', base: 'shield', name: 'Aegis Rune', description: 'A ward settles over your whole house. Each piece blocks one attack.', category: 'helpful', effects: [{ op: 'shield', target: { who: 'squad' }, charges: 1, turns: 3 }], weight: 2 },
    { id: 'starfall', base: 'mystery', glyph: 'star', name: 'Starfall', description: 'A falling star feeds your crown power: +4 charge.', category: 'helpful', effects: [{ op: 'charge_ultimate', target: { who: 'self' }, n: 4 }], weight: 2 },
    { id: 'vent', base: 'lightning', glyph: 'flame', name: 'Dragonfire Vent', description: 'The ground erupts under you. Burn back to the start unless a shield saves you.', category: 'harmful', effects: [{ op: 'kill', target: { who: 'self' } }], weight: 1 },
    { id: 'hex', base: 'curse', name: 'Mirror Hex', description: 'Your reflection grabs the reins. Your next roll can only move you backward.', category: 'harmful', effects: [{ op: 'modify_dice', target: { who: 'self' }, mode: 'reverse', turns: 1 }], weight: 3 },
    { id: 'wail', base: 'frost', glyph: 'skull', name: 'Banshee Wail', description: 'A scream that freezes the blood. Every shield in your house shatters.', category: 'harmful', effects: [{ op: 'strip', target: { who: 'squad' } }], weight: 2 },
    {
      id: 'rift', base: 'mystery', name: 'Chaos Rift', description: 'Reality tears open. Something wonderful or terrible spills out.', category: 'neutral', weight: 3,
      effects: [{ op: 'random', options: [
        [{ op: 'dash', n: 4 }],
        [{ op: 'send_to_checkpoint', target: { who: 'self' } }],
        [{ op: 'recall', range: 6 }],
        [{ op: 'charge_ultimate', target: { who: 'self' }, n: 3 }],
        [{ op: 'modify_dice', target: { who: 'self' }, mode: 'double', turns: 1 }],
        [{ op: 'skip_turn', target: { who: 'leader' }, n: 1 }],
      ] }],
    },
    ...([
      ['fire', 'Ember Well', 'Embers drink the fire here', 'burned'],
      ['water', 'Tide Pool', 'Tides drink deep here', 'swept'],
      ['earth', 'Stone Heart', 'Stone hears the mountain here', 'shaken'],
      ['air', 'Sky Vent', 'Gales catch the updraft here', 'blown'],
    ] as const).map(([el, name, gift, push]) => ({
      id: `${el}-well`,
      base: 'elemental' as const,
      element: el,
      glyph: ({ fire: 'flame', water: 'drop', earth: 'leaf', air: 'wind' } as const)[el],
      name,
      description: `${gift}: +3 charge and roll again. Any other house is ${push} back 2.`,
      category: 'neutral' as const,
      weight: 1,
      effects: [{
        op: 'if_element' as const, element: el,
        then: [{ op: 'charge_ultimate' as const, target: { who: 'self' as const }, n: 3 }, { op: 'extra_roll' as const }],
        else: [{ op: 'move' as const, target: { who: 'self' as const }, n: -2 }],
      }],
    })),
  ],
  characters: [
    {
      id: 'inferno', name: 'Pyra', title: 'The Dragon Queen', house: 'House of Embers', element: 'fire', role: 'attacker', color: '#ff5a36', glyph: 'flame',
      bio: 'Hatched inside a volcano and never once told no. Pyra burns her enemies from across the field.',
      passive: {
        id: 'phoenix-blood', name: 'Phoenix Blood', description: 'Every kill feeds the fire: the Ember dashes 2 more. And an Ember never dies quietly: whoever takes one out is burned back to their checkpoint and loses a turn.',
        triggers: [
          { on: 'capture', effects: [{ op: 'dash', n: 2 }] },
          { on: 'captured', effects: [{ op: 'send_to_checkpoint', target: { who: 'captor' } }, { op: 'skip_turn', target: { who: 'captor' }, n: 1 }] },
        ],
      },
      active: { id: 'dragonbreath', name: 'Dragonbreath', description: 'Torch the nearest rival ahead within 4. They burn all the way back to the start.', cooldown: 5, requires: { who: 'nearest', range: 4, side: 'ahead' }, effects: [{ op: 'kill', target: { who: 'nearest', range: 4, side: 'ahead' } }] },
      squad: [
        {
          id: 'cinder', name: 'Cinder', title: 'The Phoenix', glyph: 'star',
          bio: 'Cinder has died a hundred times and enjoyed every one. Wherever it flies, the road behind it catches fire.',
          active: { id: 'ashwalk', name: 'Ashwalk', description: 'Cinder blazes 3 tiles forward and the 2 tiles behind it burst into flame for 3 turns. Any rival who lands there burns back to the start.', cooldown: 4, effects: [{ op: 'dash', n: 3 }, { op: 'scorch', n: 2, turns: 3, effects: [{ op: 'kill', target: { who: 'self' } }] }] },
        },
        {
          id: 'vex', name: 'Vex', title: 'The Salamander', glyph: 'gem',
          bio: 'Small, quick and absolutely furious. Vex swims through fire and melts anything that tries to protect you.',
          active: { id: 'meltdown', name: 'Meltdown', description: 'Melt every rival shield within 5, then dart 3 tiles forward.', cooldown: 3, effects: [{ op: 'strip', target: { who: 'all', range: 5 } }, { op: 'dash', n: 3 }] },
        },
      ],
      ultimate: { id: 'meteor-rain', name: 'Meteor Rain', description: 'Stars crash down around every Ember on the field. Each rival within 1 tile of them burns back to the start.', cost: 11, effects: [{ op: 'blast', radius: 1, from: 'squad' }] },
    },
    {
      id: 'aqua', name: 'Nerys', title: 'The Tidecaller', house: 'House of Tides', element: 'water', role: 'defender', color: '#2fb8ff', glyph: 'drop',
      bio: 'The sea answers when Nerys sings, and it always brings her something to drown.',
      passive: { id: 'healing-waters', name: 'Healing Waters', description: 'The first time each Tide is taken out, it washes up at its last checkpoint instead of the start.', secondLife: true },
      active: { id: 'riptide', name: 'Riptide', description: 'Drag the leading rival within 8 back through the water to the tile right in front of Nerys.', cooldown: 3, requires: { who: 'leader', range: 8, side: 'ahead' }, effects: [{ op: 'pull', target: { who: 'leader', range: 8, side: 'ahead' } }] },
      squad: [
        {
          id: 'morrow', name: 'Morrow', title: 'The Leviathan', glyph: 'anchor',
          bio: 'Older than the oceans and twice as moody. When Morrow rolls over, the whole world gets seasick.',
          active: { id: 'whirlpool', name: 'Whirlpool', description: 'Spin every rival within 4. Their next roll can only carry them backward.', cooldown: 4, requires: { who: 'all', range: 4 }, effects: [{ op: 'modify_dice', target: { who: 'all', range: 4 }, mode: 'reverse', turns: 1 }] },
        },
        {
          id: 'coral', name: 'Coral', title: 'The Pearl Healer', glyph: 'heart',
          bio: 'Gentle, patient and impossible to lose. Coral has never let a friend stay drowned for long.',
          active: { id: 'second-tide', name: 'Second Tide', description: 'Every fallen Tide waiting at the start rises again at its last checkpoint.', cooldown: 4, effects: [{ op: 'revive' }] },
        },
      ],
      ultimate: { id: 'tsunami', name: 'Tsunami', description: 'A wall of water sweeps every rival ahead within 10 back to their last checkpoint.', cost: 12, requires: { who: 'ahead', range: 10 }, effects: [{ op: 'send_to_checkpoint', target: { who: 'ahead', range: 10 } }] },
    },
    {
      id: 'terra', name: 'Grom', title: 'The Mountain Golem', house: 'House of Stone', element: 'earth', role: 'controller', color: '#7fd45a', glyph: 'leaf',
      bio: 'Grom does not hurry. Grom does not need to. Anything Grom stares at long enough turns to rock.',
      passive: { id: 'bedrock', name: 'Bedrock', description: 'Stone does not budge. No rival can push, pull, swap or scatter your pieces.', pushImmune: true },
      active: { id: 'stone-gaze', name: 'Stone Gaze', description: 'Turn the nearest rival within 5 to stone for 2 turns. Stone cannot move, and nobody can land on it.', cooldown: 3, requires: { who: 'nearest', range: 5 }, effects: [{ op: 'petrify', target: { who: 'nearest', range: 5 }, turns: 2 }] },
      squad: [
        {
          id: 'thessaly', name: 'Thessaly', title: 'The Root Druid', glyph: 'moon',
          bio: 'She talks to the trees and the trees talk back. Mostly they talk about grabbing your ankles.',
          active: { id: 'rootsnare', name: 'Rootsnare', description: 'Roots wrap around the leading rival within 8. They can only move again with a 5 or a 6.', cooldown: 3, requires: { who: 'leader', range: 8 }, effects: [{ op: 'snare', target: { who: 'leader', range: 8 }, need: 5, turns: 3 }] },
        },
        {
          id: 'basalt', name: 'Basalt', title: 'The Gargoyle', glyph: 'shield',
          bio: 'Basalt guarded one cathedral roof for nine hundred years. It is very ready for a change of scenery.',
          active: { id: 'gargoyle-leap', name: 'Gargoyle Leap', description: 'Basalt spreads its stone wings and lands on your nearest squadmate ahead within 8, forming a bond.', cooldown: 4, effects: [{ op: 'join', range: 8 }] },
        },
      ],
      ultimate: { id: 'avalanche', name: 'Avalanche', description: 'Your lead piece rolls 5 tiles forward and crushes every rival in its path back to the start.', cost: 9, effects: [{ op: 'trample', n: 5 }] },
    },
    {
      id: 'zephyr', name: 'Aeris', title: 'The Griffin Rider', house: 'House of Gales', element: 'air', role: 'mover', color: '#c9a7ff', glyph: 'wind',
      bio: 'Aeris never leaves anyone behind. She flies back, grabs them and drops them right where the fighting is.',
      passive: { id: 'eye-of-the-storm', name: 'Eye of the Storm', description: 'Whenever a Gale lands beside a squadmate, a gust wraps around it: a shield that blocks one attack.', triggers: [{ on: 'bond', effects: [{ op: 'shield', target: { who: 'self' }, charges: 1, turns: 2 }] }] },
      active: { id: 'updraft', name: 'Sky Ferry', description: 'Aeris swoops back for a Gale within 8 and drops it on the tile right behind her. One small step and they bond.', cooldown: 4, effects: [{ op: 'recall', range: 8, behind: true }] },
      squad: [
        {
          id: 'tempest', name: 'Tempest', title: 'The Storm Sprite', glyph: 'bolt',
          bio: 'A tiny thunderstorm with a big laugh. Tempest has no plan and has never needed one.',
          active: { id: 'scatterwind', name: 'Scatterwind', description: 'Tempest and every rival within 3 are thrown into the sky and land in each other\'s places at random.', cooldown: 4, requires: { who: 'all', range: 3 }, effects: [{ op: 'scramble', range: 3 }] },
        },
        {
          id: 'kestrel', name: 'Kestrel', title: 'The Sky Monk', glyph: 'eye',
          bio: 'Kestrel meditated on a cloud for forty years and came down knowing exactly how every die will land.',
          active: { id: 'featherfall', name: 'Featherfall', description: 'Kestrel reads the wind. Your next roll is a six.', cooldown: 6, effects: [{ op: 'modify_dice', target: { who: 'self' }, mode: 'six', turns: 1 }] },
        },
      ],
      ultimate: { id: 'jetstream', name: 'Jetstream', description: 'The storm gets behind you. Your next 2 rolls count double.', cost: 13, effects: [{ op: 'modify_dice', target: { who: 'self' }, mode: 'double', turns: 2 }] },
    },
  ],
  rules: {
    stormRound: { 2: 16, 3: 16, 4: 16 },
    stormName: 'The Sky Breaks',
    extraRollOnSix: true,
    ultimateCharge: { turn: 1, capture: 2, captured: 3 },
    capture: { mode: 'start' },
    winAt: 2,
    bondMarch: true,
    tides: { every: 3, elements: ['earth', 'fire', 'air', 'water'], bonus: 1, name: 'Elemental Tide' },
  },
  art: {
    portraits: PORTRAITS['magic-elements'],
    style: 'luminous high fantasy, floating islands, crystal and starlight, painterly',
    palette: { bg: '#0b0820', surface: '#171236', primary: '#8b5cf6', accent: '#22d3ee', text: '#f1edff' },
    zoneColors: { forest: '#34d399', falls: '#38bdf8', ridge: '#f97316', ladders: '#a78bfa', gate: '#f0abfc' },
  },
};
