import type { ThemePack } from '@ludo/engine';

/** Hand-made San Francisco world; shows off slopes, world events, and the steal/rewind/hitch/mimic powers. */
export const sfPack: ThemePack = {
  id: 'fog-city',
  world: {
    name: 'Fog City Ludo: Race for the Golden Gate',
    tagline: 'Four hustlers. One bridge. Zero visibility.',
    story:
      'Whoever crosses the Golden Gate first owns the city. A founder, the fog itself, a cable-car gripman and an open-source hacker race from the Ferry Building under the lanterns of Chinatown, down Lombard and up Nob Hill, while the city throws fog, quakes and Muni meltdowns at all of them.',
    finish: 'Golden Gate Summit',
    startName: 'Ferry Building',
  },
  zones: [
    { id: 'chinatown', name: 'Chinatown Lanterns', type: 'crossing', length: 10, danger: 'low', decor: 'chinatown', description: 'Grant Avenue under strings of red lanterns. Alleys cross and tangle past the Dragon Gate.' },
    { id: 'lombard', name: 'Lombard Switchbacks', type: 'branch', length: 9, danger: 'medium', decor: 'hills', slope: 'down', description: 'The crookedest street in the world. Downhill: forward moves go 1 further.' },
    { id: 'nobhill', name: 'Nob Hill Climb', type: 'lane', length: 8, danger: 'medium', decor: 'hills', slope: 'up', description: 'Cable cars grind up brutal grades. Uphill: forward moves go 1 shorter.' },
    { id: 'embarcadero', name: 'Embarcadero Crush', type: 'merge', length: 9, danger: 'high', decor: 'city', description: 'Every route squeezes onto the waterfront piers. Tow-truck alley.' },
    { id: 'gate', name: 'Golden Gate Bridge', type: 'funnel', length: 6, danger: 'high', decor: 'bridge', description: 'One road through the fog. The leader is always exposed.' },
  ],
  tiles: [
    { id: 'street', base: 'normal', name: 'City Street', description: 'Just asphalt and ambition.', category: 'structural', effects: [], weight: 0 },
    { id: 'dolores', base: 'sanctuary', name: 'Dolores Park', description: 'Everyone chills. No attacks or captures here.', category: 'structural', effects: [], weight: 0 },
    { id: 'bart', base: 'portal', name: 'BART Tunnel', description: 'Ride under the bay to the paired station.', category: 'structural', effects: [{ op: 'teleport', to: 'portal_pair' }], weight: 0 },
    { id: 'cablecar', base: 'speed', name: 'Cable Car', glyph: 'cablecar', description: 'Grab the rail: dash 3 forward.', category: 'helpful', effects: [{ op: 'dash', n: 3 }], weight: 3 },
    { id: 'sourdough', base: 'shield', name: 'Sourdough Stash', description: 'Carb armour: a shield that blocks the next attack.', category: 'helpful', effects: [{ op: 'shield', target: { who: 'self' }, charges: 1, turns: 3 }], weight: 2 },
    { id: 'seed', base: 'mystery', name: 'Seed Round', glyph: 'gem', description: 'Fresh funding: +3 ultimate charge.', category: 'helpful', effects: [{ op: 'charge_ultimate', target: { who: 'self' }, n: 3 }], weight: 2 },
    { id: 'pothole', base: 'lightning', name: 'Pothole', description: 'Axle-deep. Pushed back 3.', category: 'harmful', effects: [{ op: 'move', target: { who: 'self' }, n: -3 }], weight: 3 },
    { id: 'ticket', base: 'curse', name: 'Parking Ticket', description: 'Street sweeping day. Rolls halved for 2 turns.', category: 'harmful', effects: [{ op: 'modify_dice', target: { who: 'self' }, mode: 'halve', turns: 2 }], weight: 2 },
    { id: 'fogbank', base: 'frost', name: 'Fog Bank', glyph: 'cloud', description: "Can't see your own feet. Skip your next turn.", category: 'harmful', effects: [{ op: 'skip_turn', target: { who: 'self' }, n: 1 }], weight: 2 },
    { id: 'shuttle', base: 'swap', name: 'Tech Shuttle', description: 'Wrong bus! Swap places with the nearest rival within 8.', category: 'neutral', effects: [{ op: 'swap', target: { who: 'nearest', range: 8 } }], weight: 2 },
    {
      id: 'pitch', base: 'mystery', name: 'Startup Pitch', description: 'Pitch the VCs. Anything can happen…', category: 'neutral', weight: 3,
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
      bio: 'Moves fast, breaks things, pivots mid-sentence. Byte treats every rival as a competitor to acquire.',
      passive: { id: 'blitzscale', name: 'Blitzscale', description: 'Move fast and break things: after every tow, Byte dashes 3 and rolls again.', triggers: [{ on: 'capture', effects: [{ op: 'dash', n: 3 }, { op: 'extra_roll' }] }] },
      active: { id: 'ctrlz', name: 'Ctrl+Z', description: 'Undo the nearest rival ahead within 6: they snap back to where their last turn began.', cooldown: 3, requires: { who: 'nearest', range: 6, side: 'ahead' }, effects: [{ op: 'rewind', target: { who: 'nearest', range: 6, side: 'ahead' } }] },
      ultimate: { id: 'takeover', name: 'Hostile Takeover', description: 'Drain 4 charge from the leader ahead within 8 — then swap places with them.', cost: 10, requires: { who: 'leader', range: 8, side: 'ahead' }, effects: [{ op: 'steal_charge', target: { who: 'leader', range: 8, side: 'ahead' }, n: 4 }, { op: 'swap', target: { who: 'leader', range: 8, side: 'ahead' } }] },
    },
    {
      id: 'karl', name: 'Karl', title: 'The Fog', element: 'fog', role: 'controller', color: '#9fb4d0', glyph: 'cloud',
      bio: "San Francisco's most famous resident. Karl doesn't race — he simply arrives, and nobody can see a thing.",
      passive: { id: 'marine', name: 'Marine Layer', description: 'At the start of each of Karl’s turns, rivals within 3 can roll at most 3 on their next turn.', triggers: [{ on: 'turn_start', effects: [{ op: 'modify_dice', target: { who: 'all', range: 3 }, mode: 'max3', turns: 1 }] }] },
      active: { id: 'rollin', name: 'Roll In', description: 'Rivals within 6 are lost in the fog for 2 turns (rolls halved) while Karl drifts 3 forward.', cooldown: 4, requires: { who: 'all', range: 6 }, effects: [{ op: 'modify_dice', target: { who: 'all', range: 6 }, mode: 'halve', turns: 2 }, { op: 'dash', n: 3 }] },
      ultimate: { id: 'blanket', name: 'Blanket the Bay', description: 'Every rival ahead rolls at most 3 for 2 turns, and Karl hides inside a shield.', cost: 8, requires: { who: 'ahead' }, effects: [{ op: 'modify_dice', target: { who: 'ahead' }, mode: 'max3', turns: 2 }, { op: 'shield', target: { who: 'self' }, charges: 1, turns: 3 }] },
    },
    {
      id: 'muni', name: 'Muni', title: 'The Gripman', element: 'rail', role: 'mover', color: '#f5b631', glyph: 'cablecar',
      bio: 'Thirty years on the Powell line. Muni knows every grade, every rail and every rival worth hitching onto.',
      passive: { id: 'grip', name: 'Grip', description: 'Uphill zones never slow Muni — the cable does the climbing.', slopeImmune: true },
      active: { id: 'hopon', name: 'Hop On', description: 'Hitch a ride: jump to the tile right behind the nearest rival ahead within 6.', cooldown: 4, requires: { who: 'nearest', range: 6, side: 'ahead' }, effects: [{ op: 'hitch', target: { who: 'nearest', range: 6, side: 'ahead' } }] },
      ultimate: { id: 'express', name: 'Express Line', description: 'No stops: dash 4 forward, then roll again.', cost: 10, effects: [{ op: 'dash', n: 4 }, { op: 'extra_roll' }] },
    },
    {
      id: 'ada', name: 'Ada', title: 'The Forker', element: 'open', role: 'defender', color: '#3ee089', glyph: 'eye',
      bio: 'Never writes code she can fork. Ada copies her rivals’ best moves and ships them back twice as hard.',
      passive: { id: 'backups', name: 'Backups', description: 'Starts with a shield, and every time Ada is towed her backups restore +3 charge.', startShield: 1, triggers: [{ on: 'captured', effects: [{ op: 'charge_ultimate', target: { who: 'self' }, n: 3 }] }] },
      active: { id: 'fork', name: 'Fork', description: "Copy the nearest rival within 10 and run their active power as your own.", cooldown: 3, requires: { who: 'nearest', range: 10 }, effects: [{ op: 'mimic', target: { who: 'nearest', range: 10 }, slot: 'active' }] },
      ultimate: { id: 'merge', name: 'Merge Conflict', description: "Fork the leading rival's ultimate and unleash it yourself.", cost: 10, requires: { who: 'leader' }, effects: [{ op: 'mimic', target: { who: 'leader' }, slot: 'ultimate' }] },
    },
  ],
  rules: {
    stormRound: { 2: 22, 3: 24, 4: 26 },
    stormName: 'Rush Hour Gridlock',
    extraRollOnSix: false,
    ultimateCharge: { turn: 1, capture: 2, captured: 3 },
    eventEvery: 4,
    movement: 'forward',
    capture: { mode: 'tow', back: 6, steal: 2 },
  },
  events: [
    { id: 'karl-rolls-in', name: 'Karl Rolls In', description: 'Fog swallows the city. Everyone rolls at most 3 this round.', effects: [{ op: 'modify_dice', target: { who: 'everyone' }, mode: 'max3', turns: 1 }] },
    { id: 'big-one', name: 'The Big One', description: 'The ground lurches! The front of the pack is shaken back 3.', effects: [{ op: 'move', target: { who: 'ahead' }, n: -3 }] },
    { id: 'meltdown', name: 'Muni Meltdown', description: 'Delays on every line. The leader loses a turn.', effects: [{ op: 'skip_turn', target: { who: 'leader' }, n: 1 }] },
    { id: 'bus-rush', name: 'Tech Shuttle Rush', description: 'The back of the pack catches a shuttle forward 3.', effects: [{ op: 'move', target: { who: 'behind' }, n: 3 }] },
    { id: 'giveaway', name: 'Sourdough Giveaway', description: 'Free bread for all. Everyone gains a one-hit shield.', effects: [{ op: 'shield', target: { who: 'everyone' }, charges: 1, turns: 2 }] },
  ],
  art: {
    style: 'neon-noir San Francisco at dusk, rolling fog over painted hills, Golden Gate glowing International Orange, painterly',
    palette: { bg: '#0a1220', surface: '#15233a', primary: '#ff5a36', accent: '#8ad4ff', text: '#f2f5fb' },
    scene: 'city',
    zoneColors: { chinatown: '#f43f5e', lombard: '#fb923c', nobhill: '#facc15', embarcadero: '#38bdf8', gate: '#ff5a1f' },
  },
};
