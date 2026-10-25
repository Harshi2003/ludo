// ─── Theme Pack: everything the AI generates ────────────────────────────────

/** Who an effect hits. Everything except `self` targets opponents. */
export type Who =
  | 'self'
  | 'nearest' // closest opponent by path distance
  | 'leader' // opponent closest to the finish
  | 'all'
  | 'ahead' // opponents closer to the finish than you
  | 'behind'
  | 'random'
  | 'captured'; // the opponent you just captured (passive triggers only)

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
  | { op: 'dash'; n: number } // self forward, ignores blocks, can capture
  | { op: 'send_to_checkpoint'; target: TargetSpec }
  | { op: 'skip_turn'; target: TargetSpec; n: number }
  | { op: 'extra_roll' }
  | { op: 'shield'; target: TargetSpec; charges: number; turns: number }
  | { op: 'swap'; target: TargetSpec }
  | { op: 'teleport'; to: 'portal_pair' | 'safe_ahead'; range?: number }
  | { op: 'place_trap'; turns: number; effects: Effect[] } // on your current tile
  | { op: 'block_tile'; target: TargetSpec; turns: number } // blocks the tiles in front of target
  | { op: 'modify_dice'; target: TargetSpec; mode: DiceMode; turns: number }
  | { op: 'charge_ultimate'; target: TargetSpec; n: number }
  | { op: 'if_element'; element: string; then: Effect[]; else: Effect[] }
  | { op: 'random'; options: Effect[][] };

export type EffectOp = Effect['op'];
export type DiceMode = 'halve' | 'max3' | 'plus1';

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
  | 'swap' | 'star' | 'flame' | 'drop' | 'leaf' | 'wind' | 'skull' | 'gem' | 'crown' | 'anchor' | 'heart' | 'none';

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
  triggers?: { on: 'capture' | 'captured' | 'turn_start'; effects: Effect[] }[];
}

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  element: string;
  role: 'attacker' | 'controller' | 'defender' | 'mover';
  color: string;
  bio: string;
  /** Icon for tokens and emblems; generated themes set this, Magic Ludo derives it from element. */
  glyph?: Glyph;
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
  decor?: 'forest' | 'falls' | 'peaks' | 'sky' | 'crystal' | 'shrine';
}

export interface ThemeRules {
  /** Round after which backward moves are disabled (keeps games finite). */
  stormRound: { 2: number; 3: number; 4: number };
  stormName: string;
  extraRollOnSix: boolean;
  ultimateCharge: { turn: number; capture: number; captured: number };
}

export interface ThemePack {
  id: string;
  world: { name: string; tagline: string; story: string; finish: string; startName: string };
  zones: ZoneDef[];
  tiles: TileTypeDef[];
  characters: CharacterDef[];
  rules: ThemeRules;
  art: {
    style: string;
    palette: { bg: string; surface: string; primary: string; accent: string; text: string };
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

export interface PlayerState {
  seat: number;
  character: string;
  bot: boolean;
  tile: number;
  checkpoint: number;
  ult: number;
  cooldown: number;
  shield: { charges: number; turns: number } | null;
  skip: number;
  dice: { mode: DiceMode; turns: number } | null;
  captures: number;
  timesCaptured: number;
}

export interface Trap {
  tile: number;
  owner: number;
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
  dir: 'fwd' | 'back';
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
    | 'checkpoint'
    | 'win';
  seat: number;
  msg: string;
  /** Tile/ability id that caused it, for stats and FX. */
  source?: string;
  targets?: number[];
  tile?: number;
  path?: number[];
  value?: number;
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
  moves: MoveOption[];
  usedAbility: boolean;
  extraRolls: number;
  traps: Trap[];
  blocks: Block[];
  portalCd: Record<number, number>;
  rng: number;
  events: GameEvent[];
  winner: number | null;
  storm: boolean;
  bonusRoll: boolean;
}

export type Action =
  | { type: 'roll' }
  | { type: 'move'; index: number }
  | { type: 'ability'; which: 'active' | 'ultimate' };
