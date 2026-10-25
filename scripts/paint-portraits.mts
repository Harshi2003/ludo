/**
 * Paints a portrait for every character and squad member of the hand-made worlds and the saved
 * Candy world, then wires them in. Bitdeer Seedream first, fal flux if that fails.
 *
 *   npx tsx scripts/paint-portraits.mts            paint whatever is missing
 *   npx tsx scripts/paint-portraits.mts --dry      print the prompts, paint nothing
 *   npx tsx scripts/paint-portraits.mts --force    repaint everything
 *   npx tsx scripts/paint-portraits.mts --only=fog-city
 *
 * Keys come from apps/web/.env.local (BITDEER_API_KEY and/or FAL_KEY).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { members, type ThemePack } from '@ludo/engine';
import { magicPack, sfPack, PORTRAITS } from '@ludo/themepack';

const root = path.resolve(import.meta.dirname, '..');
for (const line of readFileSync(path.join(root, 'apps/web/.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { bitdeerImage } = await import('../apps/web/lib/ai/bitdeer');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const force = args.includes('--force');
const only = args.find((a) => a.startsWith('--only='))?.slice(7);

const worldsDir = path.join(root, 'apps/web/data/worlds');
const candyFile = readdirSync(worldsDir).find((f) => f.startsWith('candy-kingdom-war'));
const candy = candyFile ? (JSON.parse(readFileSync(path.join(worldsDir, candyFile), 'utf8')) as { pack: ThemePack }) : undefined;

/** Each world's painting style, kept to its own palette. */
const STYLE: Record<string, string> = {
  'magic-elements': 'luminous high fantasy character portrait, painterly digital painting, dramatic rim light, deep indigo night background with drifting crystal motes',
  'fog-city': 'neon noir character portrait set in San Francisco at dusk, painterly, rolling fog behind, warm streetlight rim light',
  [candy?.pack.id ?? 'candy']: 'glossy storybook candy character portrait, soft painterly 3D, cute but bold, chocolate night background with tiny sprinkles',
};

/** What each one looks like. Written by hand so every portrait is its own creature. */
const LOOK: Record<string, string> = {
  // Aetherfall
  inferno: 'a fierce dragon queen with obsidian horns and a crown of molten gold, ember red scales along her cheekbones, eyes like glowing coals, a small dragon coiled on her shoulder',
  cinder: 'a phoenix made of living flame and ash, wings spread and trailing embers, proud golden eyes',
  vex: 'a small furious salamander warrior standing upright, glossy black skin split by glowing lava cracks, holding a curved obsidian dagger',
  aqua: 'a tidecaller sorceress with flowing sea green hair threaded with pearls, a coral circlet, a spiral of water rising from her raised hand',
  morrow: 'an ancient colossal leviathan rising from a dark ocean, barnacled blue scales, one huge wise eye, waves breaking around it',
  coral: 'a gentle merfolk healer in pearl white and soft pink coral armour, cradling a glowing pearl, kind smile',
  terra: 'a towering mountain golem of mossy granite with glowing green crystal eyes, small trees growing on its shoulders',
  thessaly: 'a root druid with bark patterned skin and an antler crown woven with vines, roots curling from her fingertips',
  basalt: 'a gothic gargoyle of cracked dark basalt with folded stone wings, crouched on a cathedral spire, faint green glow in its eyes',
  zephyr: 'a griffin rider in a silver feathered cloak astride a white griffin, wind swept hair, lavender storm clouds',
  tempest: 'a tiny mischievous storm sprite made of swirling cloud and crackling violet lightning, huge grin',
  kestrel: 'a serene sky monk sitting cross legged on a cloud in lavender robes, eyes closed, a falcon perched on his arm',
  // Fog City
  byte: 'a startup founder in a black hoodie with a confident smirk, laptop under one arm, hot pink neon glow',
  karl: 'the San Francisco fog as a calm ghostly figure of drifting mist with soft blue grey eyes, Golden Gate towers fading behind',
  muni: 'a veteran cable car gripman in a vintage uniform and cap, both hands on the brass grip lever, warm amber light',
  ada: 'an open source hacker with green tinted glasses reflecting lines of code, braided hair, mechanical keyboard, mint green glow',
  // Sugar Riot
  fizz: 'a fizzy sour candy girl made of lime green sour gummy dusted with sugar crystals, pop rocks crackling in her palm, mischievous grin',
  tang: 'a tiny lemon drop imp wearing a lemon slice hat, pointed ears, cheeks puffed as it sucks in air, sour yellow glow',
  mallow: 'a marshmallow knight with toasted golden edges, pink marshmallow armour and a candy cane lance, brave smile',
  puff: 'a little cocoa bear cub hugging a steaming mug of hot cocoa topped with marshmallows',
  minty: 'a cool peppermint girl with red and white swirl hair, frosty breath, teal mint glow, tiny sunglasses',
  glacia: 'an ice pop girl of translucent turquoise ice covered in frost crystals, a popsicle stick crown',
  jelly: 'a chubby glossy orange gummy bear caught mid bounce, joyful',
  wobble: 'a long stretchy orange and yellow gummy worm coiled like a spring, cheeky face',
};

const outDir = (packId: string) => path.join(root, 'apps/web/public/art/portraits', packId);
const manifest: Record<string, Record<string, string>> = structuredClone(PORTRAITS);

async function fal(prompt: string): Promise<string> {
  if (!process.env.FAL_KEY) throw new Error('no FAL_KEY');
  const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_size: 'square_hd', num_images: 1, enable_safety_checker: true }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`fal returned ${res.status}`);
  const url = ((await res.json()) as { images?: { url: string }[] }).images?.[0]?.url;
  if (!url) throw new Error('fal returned no image');
  return url;
}

async function paint(prompt: string): Promise<{ url: string; by: string }> {
  if (process.env.BITDEER_API_KEY) {
    try {
      return { url: await bitdeerImage(prompt), by: 'seedream' };
    } catch (err) {
      console.warn(`   seedream failed (${(err as Error).message}), trying fal`);
    }
  }
  return { url: await fal(prompt), by: 'fal' };
}

const worlds = [magicPack, sfPack, ...(candy ? [candy.pack] : [])].filter((p) => !only || p.id === only);
let painted = 0;
for (const pack of worlds) {
  console.log(`\n${pack.world.name}`);
  for (const c of pack.characters) {
    for (const m of members(c)) {
      const file = path.join(outDir(pack.id), `${m.id}.png`);
      const url = `/art/portraits/${pack.id}/${m.id}.png`;
      const prompt = `${STYLE[pack.id]}. ${m.name}, ${m.title}: ${LOOK[m.id] ?? m.bio}. Colour accents in ${c.color}. Centered head and shoulders, square portrait, no text, no letters, no border, no watermark.`;
      if (dry) {
        console.log(` ${m.id}: ${prompt}`);
        continue;
      }
      if (existsSync(file) && !force) {
        (manifest[pack.id] ??= {})[m.id] = url;
        console.log(` ${m.name}: already painted`);
        continue;
      }
      try {
        const art = await paint(prompt);
        const res = await fetch(art.url, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`download returned ${res.status}`);
        mkdirSync(outDir(pack.id), { recursive: true });
        writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        (manifest[pack.id] ??= {})[m.id] = url;
        painted++;
        console.log(` ${m.name}: painted by ${art.by}`);
      } catch (err) {
        console.warn(` ${m.name}: FAILED, keeps its emblem (${(err as Error).message})`);
      }
    }
  }
}

if (!dry) {
  const hand = Object.fromEntries(Object.entries(manifest).filter(([id]) => id === magicPack.id || id === sfPack.id));
  writeFileSync(path.join(root, 'packages/themepack/src/portraits.ts'), `/**
 * Painted character portraits for the hand-made worlds, by world id then character or squad member id.
 * Written by scripts/paint-portraits.mts; anything missing falls back to the code-drawn emblem.
 */
export const PORTRAITS: Record<string, Record<string, string>> = ${JSON.stringify(hand, null, 2)};
`);
  if (candy && candyFile && manifest[candy.pack.id]) {
    candy.pack.art.portraits = manifest[candy.pack.id];
    writeFileSync(path.join(worldsDir, candyFile), `${JSON.stringify(candy, null, 2)}\n`);
  }
  console.log(`\nPainted ${painted} portrait${painted === 1 ? '' : 's'}.`);
}
