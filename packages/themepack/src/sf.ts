import type { ThemePack } from '@ludo/engine';
import { PORTRAITS } from './portraits';

/** Hand-made San Francisco world, kept simple: one piece each, slopes and world events. */
export const sfPack: ThemePack = {
  id: 'fog-city',
  world: {
    name: 'Fog City: Race for the Golden Gate',
    tagline: 'Four hustlers. One bridge. Zero visibility.',
    story:
      'Whoever crosses the Golden Gate first owns the city. A startup founder, the fog itself, a cable car gripman and an open source hacker race from the Ferry Building, under the red lanterns of Chinatown, down Lombard and up Nob Hill, while the city throws fog, quakes and Muni meltdowns at all of them. Land on a rival and they ride all the way back to the Ferry Building.',
    finish: 'Golden Gate Summit',
    startName: 'Ferry Building',
  },
  zones: [
    { id: 'chinatown', name: 'Chinatown Lanterns', type: 'crossing', length: 10, danger: 'low', decor: 'chinatown', description: 'Grant Avenue under strings of red lanterns. Alleys cross and tangle past the Dragon Gate.' },
    { id: 'lombard', name: 'Lombard Switchbacks', type: 'branch', length: 9, danger: 'medium', decor: 'hills', slope: 'down', description: 'The crookedest street in the world. Downhill, so forward moves go 1 further.' },
    { id: 'nobhill', name: 'Nob Hill Climb', type: 'lane', length: 8, danger: 'medium', decor: 'hills', slope: 'up', description: 'Cable cars grind up brutal grades. Uphill, so forward moves go 1 shorter.' },
    { id: 'embarcadero', name: 'Embarcadero Crush', type: 'merge', length: 9, danger: 'high', decor: 'city', description: 'Every route squeezes onto the waterfront piers. Nobody gets through clean.' },
    { id: 'gate', name: 'Golden Gate Bridge', type: 'funnel', length: 6, danger: 'high', decor: 'bridge', description: 'One road through the fog. The leader is always exposed.' },
  ],
  tiles: [
    { id: 'street', base: 'normal', name: 'City Street', description: 'Just asphalt and ambition.', category: 'structural', effects: [], weight: 0 },
    { id: 'dolores', base: 'sanctuary', name: 'Dolores Park', description: 'Everyone chills. Nobody gets taken out here.', category: 'structural', effects: [], weight: 0 },
    { id: 'bart', base: 'portal', name: 'BART Tunnel', description: 'Ride under the bay to the paired station.', category: 'structural', effects: [{ op: 'teleport', to: 'portal_pair' }], weight: 0 },
    { id: 'cablecar', base: 'speed', name: 'Cable Car', glyph: 'cablecar', description: 'Grab the rail and ride 3 tiles.', category: 'helpful', effects: [{ op: 'dash', n: 3 }], weight: 3 },
    { id: 'sourdough', base: 'shield', name: 'Sourdough Stash', description: 'Carb armour. Blocks the next attack.', category: 'helpful', effects: [{ op: 'shield', target: { who: 'self' }, charges: 1, turns: 3 }], weight: 2 },
    { id: 'seed', base: 'mystery', name: 'Seed Round', glyph: 'gem', description: 'Fresh funding: +3 charge.', category: 'helpful', effects: [{ op: 'charge_ultimate', target: { who: 'self' }, n: 3 }], weight: 2 },
    { id: 'pothole', base: 'lightning', name: 'Pothole', description: 'Axle deep. Back 3.', category: 'harmful', effects: [{ op: 'move', target: { who: 'self' }, n: -3 }], weight: 3 },
    { id: 'ticket', base: 'curse', name: 'Parking Ticket', description: 'Street sweeping day. You get towed to your last checkpoint.', category: 'harmful', effects: [{ op: 'send_to_checkpoint', target: { who: 'self' } }], weight: 1 },
    { id: 'fogbank', base: 'frost', name: 'Fog Bank', glyph: 'cloud', description: "You can't see your own feet. Skip your next turn.", category: 'harmful', effects: [{ op: 'skip_turn', target: { who: 'self' }, n: 1 }], weight: 2 },
    { id: 'scooter', base: 'speed', glyph: 'star', name: 'Scooter Share', description: 'Grab a scooter. Your next roll is a 6.', category: 'helpful', effects: [{ op: 'modify_dice', target: { who: 'self' }, mode: 'six', turns: 1 }], weight: 2 },
    { id: 'crabshack', base: 'shield', glyph: 'heart', name: 'Crab Shack', description: 'Fresh crab, full tank. +1 on every roll for 2 turns.', category: 'helpful', effects: [{ op: 'modify_dice', target: { who: 'self' }, mode: 'plus1', turns: 2 }], weight: 2 },
    { id: 'tourists', base: 'frost', glyph: 'snowflake', name: 'Tourist Jam', description: 'Everyone stops for a photo. Your next roll is halved.', category: 'harmful', effects: [{ op: 'modify_dice', target: { who: 'self' }, mode: 'halve', turns: 1 }], weight: 2 },
    { id: 'sealions', base: 'lightning', glyph: 'anchor', name: 'Sea Lion Pier', description: 'The sea lions bark. Rivals within 3 scramble back 2.', category: 'neutral', effects: [{ op: 'move', target: { who: 'all', range: 3 }, n: -2 }], weight: 2 },
    { id: 'shuttle', base: 'swap', name: 'Tech Shuttle', glyph: 'chevrons', description: 'Free ride on the company bus. Roll again.', category: 'neutral', effects: [{ op: 'extra_roll' }], weight: 2 },
    {
      id: 'pitch', base: 'mystery', name: 'Startup Pitch', description: 'Pitch the VCs. Anything can happen.', category: 'neutral', weight: 3,
      effects: [{ op: 'random', options: [
        [{ op: 'dash', n: 5 }], // unicorn
        [{ op: 'swap', target: { who: 'random' } }], // pivot
        [{ op: 'move', target: { who: 'self' }, n: -4 }], // rejected
        [{ op: 'charge_ultimate', target: { who: 'self' }, n: 4 }], // acquired
        [{ op: 'steal_charge', target: { who: 'leader' }, n: 3 }], // poach the leader's team
        [{ op: 'send_to_checkpoint', target: { who: 'self' } }], // down round
      ] }],
    },
    ...([
      ['code', 'garage', 'The Garage', 'chip'],
      ['fog', 'oceanbeach', 'Ocean Beach', 'cloud'],
      ['rail', 'turnaround', 'Powell Turnaround', 'cablecar'],
      ['open', 'hackerspace', 'Hackerspace', 'eye'],
    ] as const).map(([el, id, name, glyph]) => ({
      id,
      base: 'elemental' as const,
      element: el,
      glyph,
      name,
      description: 'Home turf: its local gets +3 charge and rolls again. Outsiders are shooed back 2.',
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
      id: 'byte', name: 'Byte', title: 'The Founder', element: 'code', role: 'attacker', color: '#ff4f9a', glyph: 'chip',
      bio: 'Moves fast, breaks things, pivots mid sentence. Byte treats every rival as a company to acquire.',
      passive: { id: 'blitzscale', name: 'Blitzscale', description: 'Every rival Byte takes out earns another roll.', triggers: [{ on: 'capture', effects: [{ op: 'extra_roll' }] }] },
      active: { id: 'ctrlz', name: 'Ctrl+Z', description: 'Undo the leading rival within 8. They snap back to where their turn began.', cooldown: 2, requires: { who: 'leader', range: 8, side: 'ahead' }, effects: [{ op: 'rewind', target: { who: 'leader', range: 8, side: 'ahead' } }] },
      ultimate: { id: 'takeover', name: 'Hostile Takeover', description: 'Swap places with the leading rival within 8.', cost: 8, requires: { who: 'leader', range: 8, side: 'ahead' }, effects: [{ op: 'swap', target: { who: 'leader', range: 8, side: 'ahead' } }] },
    },
    {
      id: 'karl', name: 'Karl', title: 'The Fog', element: 'fog', role: 'controller', color: '#9fb4d0', glyph: 'cloud',
      bio: "San Francisco's most famous resident. Karl doesn't race. He simply arrives, and nobody can see a thing.",
      passive: { id: 'thick-air', name: 'Thick Air', description: 'Whoever takes Karl out gets lost in the fog and loses a turn.', triggers: [{ on: 'captured', effects: [{ op: 'skip_turn', target: { who: 'captor' }, n: 1 }] }] },
      active: { id: 'rollin', name: 'Roll In', description: 'Rivals within 6 get lost in the fog. Their rolls are halved for 2 turns.', cooldown: 4, requires: { who: 'all', range: 6 }, effects: [{ op: 'modify_dice', target: { who: 'all', range: 6 }, mode: 'halve', turns: 2 }] },
      ultimate: { id: 'whiteout', name: 'Whiteout', description: 'Karl vanishes into the fog and reappears at the furthest safe spot within 8.', cost: 9, effects: [{ op: 'teleport', to: 'safe_ahead', range: 8 }] },
    },
    {
      id: 'muni', name: 'Muni', title: 'The Gripman', element: 'rail', role: 'mover', color: '#f5b631', glyph: 'cablecar',
      bio: 'Thirty years on the Powell line. Muni knows every grade, every rail and every rival worth hitching onto.',
      passive: { id: 'grip', name: 'Grip', description: 'Uphill zones never slow Muni. The cable does the climbing.', slopeImmune: true },
      active: { id: 'hopon', name: 'Hop On', description: 'Jump to the tile right behind the nearest rival ahead within 6.', cooldown: 6, requires: { who: 'nearest', range: 6, side: 'ahead' }, effects: [{ op: 'hitch', target: { who: 'nearest', range: 6, side: 'ahead' } }] },
      ultimate: { id: 'express', name: 'Express Line', description: 'No stops: dash 4 forward, then roll again.', cost: 12, effects: [{ op: 'dash', n: 4 }, { op: 'extra_roll' }] },
    },
    {
      id: 'ada', name: 'Ada', title: 'The Forker', element: 'open', role: 'defender', color: '#3ee089', glyph: 'eye',
      bio: 'Never writes code she can fork. Ada copies her rivals’ best moves and ships them back.',
      passive: { id: 'backups', name: 'Backups', description: 'Every time Ada is taken out, her backups restore 5 charge.', triggers: [{ on: 'captured', effects: [{ op: 'charge_ultimate', target: { who: 'self' }, n: 5 }] }] },
      active: { id: 'fork', name: 'Fork', description: "Copy the nearest rival within 10 and use their power as your own.", cooldown: 2, requires: { who: 'nearest', range: 10 }, effects: [{ op: 'mimic', target: { who: 'nearest', range: 10 }, slot: 'active' }] },
      ultimate: { id: 'merge', name: 'Merge Conflict', description: "Fork the leading rival's ultimate and unleash it yourself.", cost: 10, requires: { who: 'leader' }, effects: [{ op: 'mimic', target: { who: 'leader' }, slot: 'ultimate' }] },
    },
  ],
  rules: {
    stormRound: { 2: 22, 3: 24, 4: 26 },
    stormName: 'Rush Hour Gridlock',
    extraRollOnSix: false,
    ultimateCharge: { turn: 1, capture: 2, captured: 3 },
    eventEvery: 4,
    powerTiles: 0.3,
    movement: 'forward',
    capture: { mode: 'start', steal: 2 },
  },
  events: [
    { id: 'karl-rolls-in', name: 'Karl Rolls In', description: 'Fog swallows the city. Everyone rolls at most 3 this round.', effects: [{ op: 'modify_dice', target: { who: 'everyone' }, mode: 'max3', turns: 1 }] },
    { id: 'big-one', name: 'The Big One', description: 'The ground lurches! The front of the pack is shaken back 3.', effects: [{ op: 'move', target: { who: 'ahead' }, n: -3 }] },
    { id: 'meltdown', name: 'Muni Meltdown', description: 'Delays on every line. The leader loses a turn.', effects: [{ op: 'skip_turn', target: { who: 'leader' }, n: 1 }] },
    { id: 'bus-rush', name: 'Tech Shuttle Rush', description: 'The back of the pack catches a shuttle forward 3.', effects: [{ op: 'move', target: { who: 'behind' }, n: 3 }] },
    { id: 'giveaway', name: 'Sourdough Giveaway', description: 'Free bread for all. Everyone gains a shield that blocks one attack.', effects: [{ op: 'shield', target: { who: 'everyone' }, charges: 1, turns: 2 }] },
  ],
  art: {
    portraits: PORTRAITS['fog-city'],
    style: 'neon noir San Francisco at dusk, rolling fog over painted hills, Golden Gate glowing International Orange, painterly',
    palette: { bg: '#0a1220', surface: '#15233a', primary: '#ff5a36', accent: '#8ad4ff', text: '#f2f5fb' },
    scene: 'city',
    zoneColors: { chinatown: '#f43f5e', lombard: '#fb923c', nobhill: '#facc15', embarcadero: '#38bdf8', gate: '#ff5a1f' },
  },
};
