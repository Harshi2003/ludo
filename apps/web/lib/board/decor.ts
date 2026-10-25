import { Container, Graphics, Sprite, TilingSprite } from "pixi.js";
import { terrainAt, type TerrainSlice } from "./layout";
import { glowTexture, groundTexture, mix } from "./util";
import type { Scene } from "../visuals";

export type DecorKind =
  | "shrine" | "forest" | "falls" | "peaks" | "sky" | "crystal" | "city" | "bridge" | "hills"
  | "chinatown" | "lollipop" | "gumdrop" | "cupcake";

export const CANDY = ["#ff4fa3", "#5ef0d0", "#ffd447", "#a78bfa", "#ff8a3d", "#7ee081"];

/** Lollipop swirl: separate arcs, each starting its own path so they never join up. */
export function swirl(g: Graphics, x: number, y: number, rad: number) {
  for (let k = 1; k <= 3; k++) {
    const rr = rad * (k / 3.6);
    g.moveTo(x + Math.cos(k) * rr, y + Math.sin(k) * rr).arc(x, y, rr, k, k + Math.PI * 1.3).stroke({ width: 3, color: 0xffffff, alpha: 0.75 });
  }
}

/** A striped candy cane standing at x with its foot on baseline b. */
export function candyCane(g: Graphics, x: number, b: number, h: number, flip: boolean) {
  const r = 9;
  const hookX = x + (flip ? -r : r);
  const pts: [number, number][] = [];
  for (let y = b; y > b - h; y -= 7) pts.push([x, y]);
  for (let a = 0; a <= Math.PI; a += Math.PI / 6) pts.push([hookX - Math.cos(a) * r * (flip ? -1 : 1), b - h - Math.sin(a) * r]);
  for (let i = 1; i < pts.length; i++) {
    g.moveTo(pts[i - 1][0], pts[i - 1][1]).lineTo(pts[i][0], pts[i][1])
      .stroke({ width: 6, color: i % 2 ? 0xfff7fb : 0xef4469, cap: "round" });
  }
}

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
  /** Mossy stone (fantasy), streets by the bay (city) or chocolate with frosting (candy). */
  scene?: Scene;
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
  const scene = spec.scene ?? "fantasy";
  const base: Record<DecorKind, string> = {
    forest: "#153b38", falls: "#163e4b", peaks: "#343747", sky: "#302d4b", crystal: "#233c48", shrine: "#303044",
    city: "#262b3a", bridge: "#2c2a36", hills: "#24382f", chinatown: "#3a2228",
    lollipop: "#5a2a4a", gumdrop: "#3f2a52", cupcake: "#5a3040",
  };
  // City streets are asphalt; candy ground is chocolate; fantasy keeps its mossy stone.
  const ground = scene === "city" ? mix(base[spec.kind], "#1b2030", 0.4)
    : scene === "candy" ? mix("#4a2418", spec.color, 0.16)
    : mix(base[spec.kind], spec.color, 0.13);
  const rim = scene === "candy" ? mix(spec.color, "#ffffff", 0.78) : scene === "city" ? mix(ground, "#fde68a", 0.3) : mix(ground, "#9ad4bc", 0.36);
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
  themedDetails(spec, scene, details, back, glows, { start, end, r, project, path, shore, ground });

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

type Shore = (along: number, side: number, inset?: number) => { x: number; y: number };

/** Each scene's own look, drawn top-down so it reads the same whether the board runs across or up the screen. */
function themedDetails(
  spec: IslandSpec, scene: Scene, g: Graphics, back: Container, glows: Sprite[],
  k: { start: number; end: number; r: () => number; project: (a: number, b: number) => { x: number; y: number }; path: { x: number; y: number }[]; shore: Shore; ground: number },
) {
  const { start, end, r, project, path, shore, ground } = k;
  const clear = (p: { x: number; y: number }, d: number) => !path.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < d);
  const spot = (pad: number) => {
    const along = start + pad + r() * (end - start - pad * 2);
    const t = terrainAt(spec.profile, along);
    return project(along, t.top + pad * 0.5 + r() * Math.max(1, t.bottom - t.top - pad));
  };
  const rail = (side: number, inset: number, step: number, color: number | string, width: number, alpha: number) => {
    const pts: { x: number; y: number }[] = [];
    for (let along = start + 30; along <= end - 30; along += step) pts.push(shore(along, side, inset));
    for (let i = 1; i < pts.length; i++) g.moveTo(pts[i - 1].x, pts[i - 1].y).lineTo(pts[i].x, pts[i].y).stroke({ width, color, alpha });
  };

  if (scene === "candy") {
    // Frosting along both shores, with sprinkles scattered over the chocolate.
    const icing = mix(spec.color, "#ffffff", 0.78);
    for (const side of [-1, 1]) {
      for (let along = start + 20; along < end - 20; along += 18) {
        const p = shore(along, side, 4);
        g.circle(p.x, p.y, 7 + Math.sin(along * 0.07) * 2).fill({ color: icing, alpha: 0.9 });
      }
    }
    for (let i = 0; i < (end - start) / 9; i++) {
      const p = spot(30);
      if (!clear(p, 40)) continue;
      const a = r() * Math.PI;
      g.moveTo(p.x - Math.cos(a) * 4, p.y - Math.sin(a) * 4).lineTo(p.x + Math.cos(a) * 4, p.y + Math.sin(a) * 4)
        .stroke({ width: 2.5, color: CANDY[i % CANDY.length], cap: "round" });
    }
    if (spec.kind === "lollipop" || spec.kind === "gumdrop" || spec.kind === "cupcake") {
      for (let along = start + 90; along < end - 60; along += 150 + r() * 90) {
        const p = spot(40);
        if (!clear(p, 60)) continue;
        const c = CANDY[Math.floor(r() * CANDY.length)];
        if (spec.kind === "lollipop") { g.circle(p.x, p.y, 15).fill(c); swirl(g, p.x, p.y, 15); }
        else if (spec.kind === "gumdrop") { g.circle(p.x, p.y, 12).fill(c); g.circle(p.x - 4, p.y - 4, 4).fill({ color: 0xffffff, alpha: 0.45 }); }
        else { g.circle(p.x, p.y, 14).fill(mix(c, "#ffffff", 0.5)); g.circle(p.x, p.y, 5).fill(0xef4469); }
      }
    }
    return;
  }

  if (scene === "city") {
    // Pilings along the bay side; rooftops with lit windows inland.
    for (let along = start + 40; along < end - 30; along += 64) {
      const p = shore(along, 1, -6);
      g.circle(p.x, p.y, 4).fill(mix(ground, "#000000", 0.4));
    }
    for (let i = 0; i < (end - start) / 60; i++) {
      const p = spot(40);
      if (!clear(p, 58)) continue;
      const w = 16 + r() * 18, h = 12 + r() * 14;
      g.roundRect(p.x - w / 2, p.y - h / 2, w, h, 2).fill(mix(ground, spec.color, 0.12 + r() * 0.1));
      for (let n = 0; n < 3; n++) if (r() < 0.6) g.rect(p.x - w / 2 + 3 + n * (w / 3), p.y - 2, 3, 4).fill({ color: "#fde68a", alpha: 0.75 });
    }
    // International Orange rails along the bridge; lanterns in Chinatown; contour lines on the hills.
    if (spec.kind === "bridge") for (const side of [-1, 1]) rail(side, 10, 16, 0xe8492a, 3, 0.8);
    if (spec.kind === "hills") for (const n of [1, 2]) rail(-1, 18 * n, 20, "#86efac", 1.5, 0.18);
    if (spec.kind === "chinatown") {
      for (let along = start + 60; along < end - 40; along += 70) {
        const p = shore(along, -1, 16);
        g.circle(p.x, p.y, 5).fill(0xe23b3b);
        glows.push(addGlow(back, p.x, p.y, "#ff6b4a", 0.45, 0.5));
      }
    }
  }
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
