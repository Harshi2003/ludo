import { SELF_OPS, type Effect, type ThemePack } from '@ludo/engine';
import { z } from 'zod';

// Bounds keep AI-invented powers inside what the engine (and the fun) can handle.
const slug = z.string().regex(/^[a-z][a-z0-9-]{1,30}$/, 'lowercase-kebab id');
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, '#rrggbb colour');
const glyph = z.enum([
  'moon', 'portal', 'bolt', 'shield', 'eye', 'snowflake', 'chevrons', 'question', 'swap', 'star', 'flame',
  'drop', 'leaf', 'wind', 'skull', 'gem', 'crown', 'anchor', 'heart', 'cablecar', 'bridge', 'cloud', 'chip',
]);
const range = z.number().int().min(1).max(12);
const target = z.object({
  who: z.enum(['self', 'nearest', 'leader', 'all', 'ahead', 'behind', 'random', 'captured', 'everyone']),
  range: range.optional(),
  side: z.enum(['ahead', 'behind']).optional(),
}).strict();

export const effectSchema: z.ZodType<Effect> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.object({ op: z.literal('move'), target, n: z.number().int().min(-8).max(8).refine((n) => n !== 0, 'n must not be 0') }).strict(),
    z.object({ op: z.literal('dash'), n: z.number().int().min(1).max(6) }).strict(),
    z.object({ op: z.literal('send_to_checkpoint'), target }).strict(),
    z.object({ op: z.literal('skip_turn'), target, n: z.number().int().min(1).max(2) }).strict(),
    z.object({ op: z.literal('extra_roll') }).strict(),
    z.object({ op: z.literal('shield'), target, charges: z.number().int().min(1).max(2), turns: z.number().int().min(1).max(4) }).strict(),
    z.object({ op: z.literal('swap'), target }).strict(),
    z.object({ op: z.literal('teleport'), to: z.enum(['portal_pair', 'safe_ahead']), range: z.number().int().min(3).max(12).optional() }).strict(),
    z.object({ op: z.literal('place_trap'), turns: z.number().int().min(1).max(4), effects: z.array(effectSchema).min(1).max(3) }).strict(),
    z.object({ op: z.literal('block_tile'), target, turns: z.number().int().min(1).max(2) }).strict(),
    z.object({ op: z.literal('modify_dice'), target, mode: z.enum(['halve', 'max3', 'plus1']), turns: z.number().int().min(1).max(3) }).strict(),
    z.object({ op: z.literal('charge_ultimate'), target, n: z.number().int().min(1).max(5) }).strict(),
    z.object({ op: z.literal('steal_charge'), target, n: z.number().int().min(1).max(5) }).strict(),
    z.object({ op: z.literal('rewind'), target }).strict(),
    z.object({ op: z.literal('hitch'), target }).strict(),
    z.object({ op: z.literal('mimic'), target, slot: z.enum(['active', 'ultimate']) }).strict(),
    z.object({ op: z.literal('if_element'), element: z.string(), then: z.array(effectSchema).max(3), else: z.array(effectSchema).max(3) }).strict(),
    z.object({ op: z.literal('random'), options: z.array(z.array(effectSchema).min(1).max(3)).min(2).max(8) }).strict(),
  ]),
);
const effects = z.array(effectSchema).max(4);

const ability = z.object({
  id: slug,
  name: z.string().min(2).max(32),
  description: z.string().min(8).max(200),
  effects: effects.min(1),
  cooldown: z.number().int().min(1).max(8).optional(),
  cost: z.number().int().min(4).max(14).optional(),
  requires: target.optional(),
}).strict();

const passive = z.object({
  id: slug,
  name: z.string().min(2).max(32),
  description: z.string().min(8).max(200),
  pushImmune: z.boolean().optional(),
  startShield: z.number().int().min(0).max(2).optional(),
  diceFloor: z.number().int().min(1).max(3).optional(),
  slopeImmune: z.boolean().optional(),
  triggers: z.array(z.object({ on: z.enum(['capture', 'captured', 'turn_start']), effects: effects.min(1) }).strict()).max(2).optional(),
}).strict();

const character = z.object({
  id: slug,
  name: z.string().min(2).max(24),
  title: z.string().min(2).max(48),
  element: slug,
  role: z.enum(['attacker', 'controller', 'defender', 'mover']),
  color: hex,
  bio: z.string().min(10).max(240),
  glyph: glyph.optional(),
  passive,
  active: ability.extend({ cooldown: z.number().int().min(1).max(8) }),
  ultimate: ability.extend({ cost: z.number().int().min(4).max(14) }),
}).strict();

const tile = z.object({
  id: slug,
  base: z.enum(['normal', 'sanctuary', 'portal', 'lightning', 'shield', 'curse', 'trap', 'swap', 'mystery', 'speed', 'frost', 'elemental']),
  name: z.string().min(2).max(32),
  description: z.string().min(4).max(160),
  category: z.enum(['structural', 'helpful', 'harmful', 'neutral']),
  effects,
  weight: z.number().min(0).max(5),
  element: z.string().optional(),
  glyph: glyph.optional(),
}).strict();

const zone = z.object({
  id: slug,
  name: z.string().min(2).max(32),
  type: z.enum(['lane', 'crossing', 'merge', 'branch', 'funnel']),
  length: z.number().int().min(4).max(14),
  danger: z.enum(['low', 'medium', 'high']),
  description: z.string().min(4).max(200),
  decor: z.enum(['forest', 'falls', 'peaks', 'sky', 'crystal', 'shrine', 'city', 'bridge', 'hills', 'chinatown', 'lollipop', 'gumdrop', 'cupcake']).optional(),
  slope: z.enum(['up', 'down']).optional(),
}).strict();

const worldEvent = z.object({
  id: slug,
  name: z.string().min(2).max(32),
  description: z.string().min(8).max(160),
  effects: effects.min(1),
}).strict();

export const themePackSchema = z.object({
  id: slug,
  world: z.object({
    name: z.string().min(3).max(80),
    tagline: z.string().min(3).max(80),
    story: z.string().min(20).max(600),
    finish: z.string().min(2).max(40),
    startName: z.string().min(2).max(40),
  }).strict(),
  zones: z.array(zone).min(4).max(6),
  tiles: z.array(tile).min(8).max(18),
  characters: z.array(character).length(4),
  rules: z.object({
    stormRound: z.object({ 2: z.number().int().min(10).max(40), 3: z.number().int().min(10).max(40), 4: z.number().int().min(10).max(40) }).strict(),
    stormName: z.string().min(2).max(40),
    extraRollOnSix: z.boolean(),
    ultimateCharge: z.object({ turn: z.number().int().min(0).max(3), capture: z.number().int().min(0).max(5), captured: z.number().int().min(0).max(6) }).strict(),
    eventEvery: z.number().int().min(3).max(10).optional(),
    dice: z.enum(['one', 'pick2']).optional(),
    movement: z.enum(['both', 'forward']).optional(),
    capture: z.object({
      mode: z.enum(['checkpoint', 'tow', 'stun']),
      back: z.number().int().min(2).max(10).optional(),
      steal: z.number().int().min(0).max(4).optional(),
    }).strict().optional(),
    tides: z.object({
      every: z.number().int().min(2).max(6),
      elements: z.array(z.string().min(1).max(24)).min(2).max(4),
      bonus: z.number().int().min(1).max(2),
      name: z.string().min(2).max(40),
    }).strict().optional(),
  }).strict(),
  events: z.array(worldEvent).min(1).max(6).optional(),
  art: z.object({
    style: z.string().min(3).max(300),
    palette: z.object({ bg: hex, surface: hex, primary: hex, accent: hex, text: hex }).strict(),
    scene: z.enum(['fantasy', 'city', 'candy']).optional(),
    zoneColors: z.record(hex),
    backgroundUrl: z.string().optional(),
    portraits: z.record(z.string()).optional(),
  }).strict(),
}).strict();

export type ValidationResult = { ok: true; pack: ThemePack; warnings: string[] } | { ok: false; errors: string[] };

/** Schema plus the cross-field rules a schema can't express. */
export function validatePack(input: unknown): ValidationResult {
  const parsed = themePackSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 25).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  }
  const p = parsed.data as ThemePack;
  const errors: string[] = [];
  const warnings: string[] = [];

  const dup = (ids: string[], what: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`duplicate ${what} id "${id}"`);
      seen.add(id);
    }
  };
  dup(p.zones.map((z) => z.id), 'zone');
  dup(p.tiles.map((t) => t.id), 'tile');
  dup(p.characters.map((c) => c.id), 'character');
  dup(p.characters.map((c) => c.element), 'character element');
  dup(p.characters.flatMap((c) => [c.passive.id, c.active.id, c.ultimate.id]), 'ability/passive');

  const funnels = p.zones.filter((z) => z.type === 'funnel');
  if (funnels.length !== 1 || p.zones[p.zones.length - 1].type !== 'funnel') errors.push('zones: exactly one "funnel" zone, and it must be last');
  if (!p.zones.some((z) => z.type === 'merge')) warnings.push('no merge zone: fewer forced collisions');

  for (const base of ['normal', 'sanctuary', 'portal'] as const) {
    const n = p.tiles.filter((t) => t.base === base).length;
    if (n !== 1) errors.push(`tiles: need exactly one tile with base "${base}" (found ${n})`);
  }
  for (const t of p.tiles) {
    const structural = ['normal', 'sanctuary', 'portal'].includes(t.base);
    if (structural && t.category !== 'structural') errors.push(`tiles.${t.id}: base "${t.base}" must have category "structural"`);
    if (!structural && t.category === 'structural') errors.push(`tiles.${t.id}: only normal/sanctuary/portal can be "structural"`);
    if (!structural && !t.effects.length) errors.push(`tiles.${t.id}: special tiles need at least one effect`);
    if (!structural && t.weight <= 0) errors.push(`tiles.${t.id}: weight must be > 0`);
    if ((t.base === 'normal' || t.base === 'sanctuary') && t.effects.length) errors.push(`tiles.${t.id}: ${t.base} tiles have no effects`);
    if (t.base === 'portal' && !(t.effects.length === 1 && t.effects[0].op === 'teleport' && t.effects[0].to === 'portal_pair')) {
      errors.push(`tiles.${t.id}: the portal tile's effects must be exactly [{"op":"teleport","to":"portal_pair"}]`);
    }
  }
  for (const cat of ['helpful', 'harmful'] as const) {
    if (!p.tiles.some((t) => t.category === cat)) errors.push(`tiles: need at least one "${cat}" tile`);
  }

  const elements = new Set(p.characters.map((c) => c.element));
  const walk = (es: Effect[], where: string) => {
    for (const e of es) {
      if (e.op === 'if_element') {
        if (!elements.has(e.element)) errors.push(`${where}: if_element "${e.element}" is not any character's element (${[...elements].join(', ')})`);
        walk(e.then, where);
        walk(e.else, where);
      }
      if (e.op === 'random') e.options.forEach((o) => walk(o, where));
      if (e.op === 'place_trap') walk(e.effects, where);
      if (e.op === 'teleport' && e.to === 'portal_pair' && !where.startsWith('tiles.')) errors.push(`${where}: portal_pair teleport only works on portal tiles`);
    }
  };
  p.tiles.forEach((t) => walk(t.effects, `tiles.${t.id}`));
  for (const c of p.characters) {
    walk(c.active.effects, `characters.${c.id}.active`);
    walk(c.ultimate.effects, `characters.${c.id}.ultimate`);
    c.passive.triggers?.forEach((tr) => walk(tr.effects, `characters.${c.id}.passive`));
    if (c.passive.triggers?.some((tr) => tr.on !== 'capture' && JSON.stringify(tr.effects).includes('"captured"'))) {
      errors.push(`characters.${c.id}.passive: target "captured" only works in an on:"capture" trigger`);
    }
  }
  for (const ev of p.events ?? []) {
    walk(ev.effects, `events.${ev.id}`);
    const flat = JSON.stringify(ev.effects);
    for (const op of SELF_OPS) if (flat.includes(`"op":"${op}"`)) errors.push(`events.${ev.id}: world events can't use "${op}" (there is no caster); target players instead`);
    if (flat.includes('"who":"self"') || flat.includes('"who":"captured"')) errors.push(`events.${ev.id}: world events have no "self"; use "everyone", "leader", "ahead", "behind" or "random"`);
  }
  dup((p.events ?? []).map((e) => e.id), 'event');
  if (p.events?.length && !p.rules.eventEvery) warnings.push('events defined but rules.eventEvery is missing: they will never fire');
  for (const el of p.rules.tides?.elements ?? []) if (!elements.has(el)) errors.push(`rules.tides: "${el}" is not any character's element`);
  const slopes = p.zones.filter((z) => z.slope);
  if (slopes.some((z) => z.type === 'funnel')) errors.push('zones: the funnel zone cannot have a slope');
  if (new Set(p.characters.map((c) => c.role)).size < 4) warnings.push('roles repeat: guardians may feel samey');

  return errors.length ? { ok: false, errors } : { ok: true, pack: normalize(p), warnings };
}

/** Fill gaps that don't need the AI: zone colours, glyph defaults. */
function normalize(p: ThemePack): ThemePack {
  for (const z of p.zones) p.art.zoneColors[z.id] ??= p.art.palette.primary;
  return p;
}
