// ─── Theme Pack: everything the AI generates ────────────────────────────────

/** Who an effect hits. Everything except `self` and `squad` targets opponents' pieces. */
export type Who =
  | 'self'
  | 'squad' // every piece of your own squad
  | 'nearest' // closest opponent by path distance
  | 'leader' // opponent closest to the finish
  | 'all'
  | 'ahead' // opponents closer to the finish than you
  | 'behind'
  | 'random'
  | 'captured' // the opponent you just captured (passive triggers only)
  | 'captor' // whoever just took you out ("captured" triggers only)
  | 'everyone'; // every player, yourself included

export interface TargetSpec {
  who: Who;
  /** Max path distance (in tiles, any direction). Omitted = unlimited. */
  range?: number;
  /** Only opponents closer to (ahead) or farther from (behind) the finish than you. */
  side?: 'ahead' | 'behind';
}

/** The fixed effect primitives the engine knows how to run. AI powers are compositions of these. */
export type Effect =
  | { op: 'move'; target: TargetSpec; n: number } // forced move, +forward / -backward
  | { op: 'dash'; n: number; squad?: boolean } // self (or whole squad) forward, ignores blocks, can capture
  | { op: 'send_to_checkpoint'; target: TargetSpec }
  | { op: 'kill'; target: TargetSpec } // a ranged takedown: counts as a capture
  | { op: 'skip_turn'; target: TargetSpec; n: number }
  | { op: 'extra_roll' }
  | { op: 'shield'; target: TargetSpec; charges: number; turns: number; reflect?: boolean } // reflect: a capture bounces back onto the attacker
  | { op: 'strip'; target: TargetSpec } // removes shields
  | { op: 'pull'; target: TargetSpec } // drag them onto the tile right in front of you
  | { op: 'magnet'; range: number; n: number } // rivals in range slide up to n toward you
  | { op: 'scramble'; range: number } // you and every rival in range trade tiles at random
  | { op: 'leapfrog'; target: TargetSpec; n: number } // land just past them; they are knocked back n
  | { op: 'trample'; n: number } // dash that takes out everyone on the path
  | { op: 'blast'; radius: number; from: 'self' | 'squad' } // takes out every rival within radius
  | { op: 'scorch'; n: number; turns: number; effects: Effect[] } // traps on the n tiles behind you
  | { op: 'petrify'; target: TargetSpec; turns: number } // stone: can't move, can't be hurt, nobody can land there
  | { op: 'snare'; target: TargetSpec; need: number; turns: number } // can only move with a roll of `need` or more
  | { op: 'ward'; turns: number } // your tile becomes a sanctuary
  | { op: 'revive' } // fallen squadmates rise at their last checkpoint
  | { op: 'recall'; range?: number; behind?: boolean } // your rearmost squadmate (within range) joins you, or lands just behind you
  | { op: 'swap_ally' } // trade places with your most advanced squadmate
  | { op: 'join'; range: number } // leap forward onto your nearest squadmate ahead within range
  | { op: 'gather'; range: number } // squadmates within range of your lead fly with it to the farthest safe tile within range
  | { op: 'swap'; target: TargetSpec }
  | { op: 'teleport'; to: 'portal_pair' | 'safe_ahead'; range?: number }
  | { op: 'place_trap'; turns: number; effects: Effect[] } // on your current tile
  | { op: 'block_tile'; target: TargetSpec; turns: number } // blocks the tiles in front of target
  | { op: 'modify_dice'; target: TargetSpec; mode: DiceMode; turns: number }
  | { op: 'charge_ultimate'; target: TargetSpec; n: number }
  | { op: 'steal_charge'; target: TargetSpec; n: number } // drain their ultimate into yours
  | { op: 'rewind'; target: TargetSpec } // back to where their last turn started
  | { op: 'hitch'; target: TargetSpec } // jump to the tile just behind them (never captures)
  | { op: 'mimic'; target: TargetSpec; slot: 'active' | 'ultimate' } // run their ability as your own
  | { op: 'if_element'; element: string; then: Effect[]; else: Effect[] }
  | { op: 'random'; options: Effect[][] };

export type EffectOp = Effect['op'];
/** six: the next roll is a 6. double: it counts twice. reverse: it can only be moved backward. */
export type DiceMode = 'halve' | 'max3' | 'plus1' | 'six' | 'double' | 'reverse';

export type TileBase =
  | 'normal'
  | 'sanctuary'
  | 'portal'
  | 'lightning'
  | 'shield'
  | 'curse'
  | 'trap'
  | 'swap'
  | 'mystery'
  | 'speed'
  | 'frost'
  | 'elemental';

/** structural tiles are placed by the generator by rule; the rest are scattered by weight. */
export type TileCategory = 'structural' | 'helpful' | 'harmful' | 'neutral';

export interface TileTypeDef {
  id: string;
  base: TileBase;
  name: string;
  description: string;
  category: TileCategory;
  effects: Effect[];
  /** Relative frequency within its category. */
  weight: number;
  element?: string;
  /** Icon drawn on the tile; defaults by base. */
  glyph?: Glyph;
}

export type Glyph =
  | 'moon' | 'portal' | 'bolt' | 'shield' | 'eye' | 'snowflake' | 'chevrons' | 'question'
  | 'swap' | 'star' | 'flame' | 'drop' | 'leaf' | 'wind' | 'skull' | 'gem' | 'crown' | 'anchor' | 'heart'
  | 'cablecar' | 'bridge' | 'cloud' | 'chip' | 'none';

export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  effects: Effect[];
  /** Active abilities: turns between uses. */
  cooldown?: number;
  /** Ultimates: charge needed. */
  cost?: number;
  /** If set, the ability is only usable when this finds at least one opponent. */
  requires?: TargetSpec;
}

export interface PassiveDef {
  id: string;
  name: string;
  description: string;
  pushImmune?: boolean; // ignores forced movement from opponents
  startShield?: number; // shield charges at game start (never expire)
  diceFloor?: number; // rolls below this count as this
  slopeImmune?: boolean; // uphill zones don't slow you
  secondLife?: boolean; // each piece's first takedown sends it to its checkpoint instead
  diceImmune?: boolean; // rivals can't curse your dice
  /** bond: one of your pieces just joined another on the same tile. */
  triggers?: { on: 'capture' | 'captured' | 'turn_start' | 'bond'; effects: Effect[] }[];
}

/** An extra piece in a squad: same colour and house passive/ultimate, its own name and active. */
export interface SquadMemberDef {
  id: string;
  name: string;
  title: string;
  bio: string;
  glyph?: Glyph;
  active: AbilityDef;
}

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  element: string;
  role: 'attacker' | 'controller' | 'defender' | 'mover';
  color: string;
  bio: string;
  /** Icon for tokens and emblems; generated themes set this, the elemental world derives it from element. */
  glyph?: Glyph;
  /** Name of the whole squad when it has more than one piece, e.g. "House of Embers". */
  house?: string;
  /** More pieces besides this leader. Piece 0 is always the leader. */
  squad?: SquadMemberDef[];
  passive: PassiveDef;
  active: AbilityDef;
  ultimate: AbilityDef;
}

export type ZoneType = 'lane' | 'crossing' | 'merge' | 'branch' | 'funnel';

export interface ZoneDef {
  id: string;
  name: string;
  type: ZoneType;
  /** Relative section size; the generator allocates nodes to hit the tile target. */
  length: number;
  danger: 'low' | 'medium' | 'high';
  description: string;
  /** Scenery style for the zone's island. */
  decor?: 'forest' | 'falls' | 'peaks' | 'sky' | 'crystal' | 'shrine' | 'city' | 'bridge' | 'hills' | 'chinatown' | 'lollipop' | 'gumdrop' | 'cupcake';
  /** Forward moves starting here are 1 shorter (up) or longer (down). */
  slope?: 'up' | 'down';
}

export interface ThemeRules {
  /** Round after which backward moves are disabled (keeps games finite). */
  stormRound: { 2: number; 3: number; 4: number };
  stormName: string;
  extraRollOnSix: boolean;
  ultimateCharge: { turn: number; capture: number; captured: number };
  /** A world event fires every N rounds (needs pack.events). */
  eventEvery?: number;
  /** 'pick2': roll two dice and move by either one; doubles grant an extra roll. Default one die. */
  dice?: 'one' | 'pick2';
  /** 'forward': one-way board, no backward moves at all. Default 'both' until the storm. */
  movement?: 'both' | 'forward';
  /**
   * What a capture does to the victim. 'checkpoint' (default) sends them to their last checkpoint;
   * 'start' sends them all the way home; 'tow' knocks them back `back` tiles; 'stun' leaves them
   * in place but costs them their next turn. `steal` moves that much ultimate charge from victim to attacker.
   */
  capture?: { mode: 'checkpoint' | 'start' | 'tow' | 'stun'; back?: number; steal?: number };
  /** Pieces a squad must bring to the finish to win (default 1). */
  winAt?: number;
  /** Share of path tiles that carry a power (default 0.15 to 0.2 by player count). */
  powerTiles?: number;
  /** Bonded pieces travel together when one of them moves. */
  bondMarch?: boolean;
  /** Rotating reign: every `every` rounds the next element in `elements` reigns; its champions get +`bonus` on forward moves. */
  tides?: { every: number; elements: string[]; bonus: number; name: string };
}

/** Table-wide happening. Effects run from the world's point of view: no "self", and "behind"/"ahead" are relative to the pack's median. */
export interface WorldEventDef {
  id: string;
  name: string;
  description: string;
  effects: Effect[];
}

export interface ThemePack {
  id: string;
  world: { name: string; tagline: string; story: string; finish: string; startName: string };
  zones: ZoneDef[];
  tiles: TileTypeDef[];
  characters: CharacterDef[];
  rules: ThemeRules;
  events?: WorldEventDef[];
  art: {
    style: string;
    palette: { bg: string; surface: string; primary: string; accent: string; text: string };
    /** Overall look of the board and menus. Defaults to 'fantasy'. */
    scene?: 'fantasy' | 'city' | 'candy';
    zoneColors: Record<string, string>;
    /** Optional AI-painted art (URLs or data URIs). */
    backgroundUrl?: string;
    portraits?: Record<string, string>;
  };
}

// ─── Board ─────────────────────────────────────────────────────────────────

export interface Tile {
  id: number;
  col: number;
  /** Layout units; paths may wander asymmetrically around the board center. */
  x: number;
  y: number;
  /** Index into pack.zones; -1 for start lanes. */
  zone: number;
  /** Position within this column's frontier, not a permanent player lane. */
  lane: number;
  next: number[];
  prev: number[];
  type: string;
  checkpoint: boolean;
  shared: boolean;
  start?: number; // seat whose start lane this is (one-way)
  finish?: boolean;
  pair?: number; // portal partner
}

export interface Board {
  seed: number;
  players: number;
  /** Maximum number of simultaneous paths after the starting area. */
  lanes: number;
  cols: number;
  tiles: Tile[];
  starts: number[];
  finish: number;
  distToFinish: number[];
  zoneCols: { zone: number; from: number; to: number }[];
}

// ─── Game state ────────────────────────────────────────────────────────────

export interface PieceState {
  /** Leader's character id for piece 0, squad member id otherwise. */
  member: string;
  tile: number;
  checkpoint: number;
  cooldown: number;
  shield: { charges: number; turns: number; reflect?: boolean } | null;
  /** Tile this piece's owner's current/last turn started on (for rewind). */
  turnStart: number;
  /** Turns left as stone (0 = flesh). */
  stone: number;
  snare: { need: number; turns: number } | null;
  /** secondLife already spent. */
  saved: boolean;
}

export interface PlayerState {
  seat: number;
  character: string;
  bot: boolean;
  pieces: PieceState[];
  ult: number;
  skip: number;
  /** spent: a one-roll mode (six, reverse) was already used this turn. */
  dice: { mode: DiceMode; turns: number; spent?: boolean } | null;
  captures: number;
  timesCaptured: number;
}

/** One piece on the board. */
export interface PieceRef {
  seat: number;
  piece: number;
}

export interface Ward {
  tile: number;
  owner: number;
  turns: number;
}

export interface Trap {
  tile: number;
  owner: number;
  /** The owner's piece that set it, credited with any takedown. */
  piece?: number;
  turns: number;
  effects: Effect[];
  source: string;
}

export interface Block {
  tiles: number[];
  owner: number;
  turns: number;
}

export interface MoveOption {
  /** Which of the mover's pieces travels. */
  piece: number;
  dir: 'fwd' | 'back';
  /** Which die this move uses (pick2 dice). */
  die?: number;
  path: number[]; // excludes the starting tile
  to: number;
  captures: number[]; // seats
}

export type GameEvent = {
  kind:
    | 'turn'
    | 'roll'
    | 'move'
    | 'capture'
    | 'blocked_capture'
    | 'tile'
    | 'trap'
    | 'ability'
    | 'ultimate'
    | 'passive'
    | 'effect'
    | 'skip'
    | 'no_moves'
    | 'storm'
    | 'world_event'
    | 'event_warning'
    | 'tide'
    | 'checkpoint'
    | 'bond'
    | 'home'
    | 'win';
  seat: number;
  /** The acting piece of `seat` (0 when omitted). */
  piece?: number;
  msg: string;
  /** Tile/ability id that caused it, for stats and FX. */
  source?: string;
  targets?: number[];
  /** Piece of each seat in `targets`, same order. */
  hits?: number[];
  tile?: number;
  path?: number[];
  value?: number;
  /** Raw die faces of a roll (two for pick2 worlds). */
  dice?: number[];
  /** Where a captured/displaced token ends up. */
  to?: number;
};

export type Phase = 'roll' | 'move' | 'over';

export interface GameState {
  packId: string;
  board: Board;
  players: PlayerState[];
  turn: number;
  round: number;
  phase: Phase;
  roll: number | null;
  rawRoll: number | null;
  /** Both dice for pick2 worlds, after modifiers (raw values in `rawDice`). */
  dice?: number[] | null;
  rawDice?: number[] | null;
  /** The last roll was a loaded six, so it earns no lucky throw. */
  loaded?: boolean;
  moves: MoveOption[];
  usedAbility: boolean;
  extraRolls: number;
  traps: Trap[];
  blocks: Block[];
  wards: Ward[];
  portalCd: Record<number, number>;
  rng: number;
  events: GameEvent[];
  winner: number | null;
  storm: boolean;
  bonusRoll: boolean;
  /** The next scheduled world event (index into pack.events). */
  nextEvent: { round: number; index: number } | null;
}

export type Action =
  | { type: 'roll' }
  | { type: 'move'; index: number }
  | { type: 'ability'; which: 'active' | 'ultimate'; /** Whose active; defaults to piece 0. */ piece?: number };
