import { Container, Graphics, Sprite, TilingSprite } from "pixi.js";
import { terrainAt, type TerrainSlice } from "./layout";
import { glowTexture, groundTexture, mix } from "./util";

export type DecorKind = "shrine" | "forest" | "falls" | "peaks" | "sky" | "crystal";

export function decorFor(zoneId: string | undefined, zoneType: string | undefined, decor?: DecorKind): DecorKind {
  if (decor) return decor;
  const byId: Record<string, DecorKind> = { forest: "forest", falls: "falls", ridge: "peaks", ladders: "sky", gate: "crystal" };
  const byType: Record<string, DecorKind> = { crossing: "forest", merge: "falls", branch: "peaks", lane: "sky", funnel: "crystal" };
  return (zoneId && byId[zoneId]) || (zoneType && byType[zoneType]) || "peaks";
}

interface IslandSpec {
  profile: TerrainSlice[];
  path: { x: number; y: number }[];
  color: string;
  bg: string;
  kind: DecorKind;
  seed: number;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Organic terrain in screen-facing axes, with clear space reserved for every tile. */
export function buildIsland(spec: IslandSpec, portrait = false): { back: Container; front: Container; glows: Sprite[] } {
  const r = rng(spec.seed);
  const back = new Container();
  const front = new Container();
  back.rotation = front.rotation = portrait ? -Math.PI / 2 : 0;
  const glows: Sprite[] = [];
  const start = spec.profile[0].x;
  const end = spec.profile[spec.profile.length - 1].x;
  const project = (along: number, across: number) => portrait ? { x: -across, y: along } : { x: along, y: across };
  const path = spec.path.map((p) => project(p.x, p.y));
  const base: Record<DecorKind, string> = {
    forest: "#153b38", falls: "#163e4b", peaks: "#343747", sky: "#302d4b", crystal: "#233c48", shrine: "#303044",
  };
  const ground = mix(base[spec.kind], spec.color, 0.13);
  const rim = mix(ground, "#9ad4bc", 0.36);
  const stone = mix(ground, "#080f20", 0.56);
  const middle = terrainAt(spec.profile, (start + end) / 2);
  const center = project((start + end) / 2, (middle.top + middle.bottom) / 2);
  const aura = addGlow(back, center.x, center.y, spec.color, 1, 0.09);
  aura.width = portrait ? middle.bottom - middle.top + 260 : end - start + 240;
  aura.height = portrait ? end - start + 240 : middle.bottom - middle.top + 260;

  const shore = (along: number, side: number, inset = 0) => {
    const sample = terrainAt(spec.profile, along);
    const distance = Math.min(along - start, end - along);
    const cap = distance < 58 ? Math.sqrt(Math.max(0.015, 1 - (1 - distance / 58) ** 2)) : 1;
    const wobble = Math.sin(along * 0.027 + spec.seed) * 7 + Math.sin(along * 0.063 + side) * 3;
    const across = (sample.top + sample.bottom) / 2 + side * ((sample.bottom - sample.top) / 2 - inset + wobble) * cap;
    return project(along, across);
  };
  const samples: number[] = [];
  for (let x = start; x < end; x += 16) samples.push(x);
  samples.push(end);
  const outline = (inset = 0) => [
    ...samples.flatMap((x) => { const p = shore(x, -1, inset); return [p.x, p.y]; }),
    ...[...samples].reverse().flatMap((x) => { const p = shore(x, 1, inset); return [p.x, p.y]; }),
  ];
  const border = outline();
  const rock = new Graphics();
  rock.poly(border.map((v, i) => i % 2 ? v + 20 : v)).fill(stone);
  rock.poly(border.map((v, i) => i % 2 ? v + 10 : v)).fill(mix(stone, ground, 0.3));
  back.addChild(rock);

  const surface = new Graphics();
  surface.poly(border).fill({ color: ground, alpha: 0.98 });
  surface.poly(border).stroke({ width: 2, color: rim, alpha: 0.24 });
  surface.poly(outline(14)).fill({ color: mix(ground, "#56826c", 0.13), alpha: 0.4 });
  back.addChild(surface);
  const xs = border.filter((_, i) => i % 2 === 0);
  const ys = border.filter((_, i) => i % 2 === 1);
  const texture = new TilingSprite({ texture: groundTexture(), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
  texture.position.set(Math.min(...xs), Math.min(...ys));
  const mask = new Graphics().poly(border).fill(0xffffff);
  back.addChild(texture, mask);
  texture.mask = mask;

  const details = new Graphics();
  for (let along = start + 55; along < end - 40; along += 27 + r() * 28) {
    const sample = terrainAt(spec.profile, along);
    const across = sample.top + 28 + r() * Math.max(1, sample.bottom - sample.top - 56);
    const p = project(along, across);
    if (path.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < 46)) continue;
    const size = 3 + r() * 6;
    details.ellipse(p.x, p.y, size * 1.6, size).fill({ color: mix(ground, r() > 0.3 ? "#83b9a2" : "#b8aecc", 0.24), alpha: 0.6 });
    if (r() < 0.28) {
      details.circle(p.x + 4, p.y - 3, 1.8).fill({ color: "#e2e4af", alpha: 0.65 });
      details.circle(p.x - 3, p.y, 1.5).fill({ color: "#b0e3cb", alpha: 0.6 });
    }
  }
  back.addChild(details);

  // Broken shoreline shelves replace the repeated spikes and straight rails.
  for (let along = start + 65; along < end - 35; along += 65 + r() * 70) {
    const p = shore(along, r() > 0.5 ? -1 : 1, 3);
    const w = 11 + r() * 17;
    const h = 6 + r() * 8;
    details.roundShape([
      { x: p.x - w, y: p.y }, { x: p.x - w * 0.6, y: p.y - h },
      { x: p.x + w * 0.55, y: p.y - h * 0.8 }, { x: p.x + w, y: p.y + h * 0.3 }, { x: p.x, y: p.y + h },
    ], 4)
      .fill(mix(ground, "#8198a4", 0.3));
    if (r() < 0.35) details.ellipse(p.x - 2, p.y - h + 2, w * 0.6, 3).fill({ color: rim, alpha: 0.4 });
  }

  if (spec.kind === "falls") {
    for (let along = start + 140; along < end - 80; along += 240 + r() * 150) {
      const p = shore(along, r() > 0.5 ? 1 : -1, -3);
      const water = new Graphics();
      water.moveTo(p.x - 9, p.y).bezierCurveTo(p.x - 12, p.y + 26, p.x + 7, p.y + 65, p.x + 3, p.y + 116)
        .stroke({ width: 16, color: "#58b9c5", alpha: 0.22 });
      water.moveTo(p.x - 5, p.y).bezierCurveTo(p.x - 7, p.y + 30, p.x + 6, p.y + 65, p.x + 2, p.y + 110)
        .stroke({ width: 3, color: "#cff5e5", alpha: 0.5 });
      back.addChildAt(water, back.getChildIndex(surface));
      glows.push(addGlow(back, p.x, p.y + 112, "#a4e9df", 0.8, 0.18));
    }
  }
  return { back, front, glows };
}

export function addGlow(parent: Container, x: number, y: number, color: string | number, scale: number, alpha: number) {
  const s = new Sprite(glowTexture());
  s.anchor.set(0.5);
  s.position.set(x, y);
  s.tint = color;
  s.alpha = alpha;
  s.scale.set(scale);
  s.blendMode = "add";
  parent.addChild(s);
  return s;
}
