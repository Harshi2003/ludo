import { Container, Graphics, Sprite } from "pixi.js";
import { COL_W, wave } from "./layout";
import { glowTexture, mix } from "./util";

export type DecorKind = "shrine" | "forest" | "falls" | "peaks" | "sky" | "crystal";

/** A zone's own decor wins; then Magic Ludo zone ids; then a default per zone type. */
export function decorFor(zoneId: string | undefined, zoneType: string | undefined, decor?: DecorKind): DecorKind {
  if (decor) return decor;
  const byId: Record<string, DecorKind> = { forest: "forest", falls: "falls", ridge: "peaks", ladders: "sky", gate: "crystal" };
  if (zoneId && byId[zoneId]) return byId[zoneId];
  const byType: Record<string, DecorKind> = { crossing: "forest", merge: "falls", branch: "peaks", lane: "sky", funnel: "crystal" };
  return (zoneType && byType[zoneType]) || "peaks";
}

interface IslandSpec {
  x0: number;
  x1: number;
  top: number; // raw y (before wave) of surface top edge
  bottom: number;
  color: string;
  bg: string;
  kind: DecorKind;
  seed: number;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const waveAt = (x: number) => wave(x / COL_W);

/**
 * A floating island per zone: lit surface the tiles sit on, a rocky
 * underside, and themed props (trees, waterfalls, peaks, crystals).
 */
export function buildIsland(spec: IslandSpec): { back: Container; front: Container; glows: Sprite[] } {
  const r = rng(spec.seed);
  const back = new Container();
  const front = new Container();
  const glows: Sprite[] = [];
  const col = spec.color;
  // Stadium-shaped plate: semicircular ends, wavy top and bottom.
  const capR = Math.min((spec.bottom - spec.top) / 2, (spec.x1 - spec.x0) / 2);
  const inset = (x: number) => {
    const d = Math.min(x - spec.x0, spec.x1 - x);
    return d >= capR ? 0 : capR - Math.sqrt(Math.max(0, capR * capR - (capR - d) ** 2));
  };
  const xs: number[] = [];
  for (let x = spec.x0; x < spec.x1; x += Math.min(x - spec.x0, spec.x1 - x) < capR ? 6 : 24) xs.push(x);
  xs.push(spec.x1);
  const topY = (x: number) => spec.top + waveAt(x) + inset(x);
  const botY = (x: number) => spec.bottom + waveAt(x) - inset(x);

  // Aura behind the island.
  const aura = new Sprite(glowTexture());
  aura.anchor.set(0.5);
  aura.tint = col;
  aura.alpha = 0.22;
  aura.blendMode = "add";
  aura.position.set((spec.x0 + spec.x1) / 2, (spec.top + spec.bottom) / 2 + waveAt((spec.x0 + spec.x1) / 2));
  aura.width = spec.x1 - spec.x0 + 500;
  aura.height = spec.bottom - spec.top + 520;
  back.addChild(aura);

  // Props behind the surface (above its top edge).
  const props = new Graphics();
  back.addChild(props);
  const dark = mix(spec.bg, col, 0.22);
  const darker = mix(spec.bg, col, 0.1);

  if (spec.kind === "forest") {
    for (let x = spec.x0 + 20; x < spec.x1 - 10; x += 26 + r() * 22) {
      const h = 60 + r() * 90;
      const w = 22 + r() * 16;
      const base = topY(x) + 18;
      const c = mix(dark, col, 0.15 + r() * 0.2);
      for (let k = 0; k < 3; k++) {
        const y = base - (h * k) / 3.2;
        const ww = w * (1 - k * 0.22);
        props.poly([x - ww, y, x, y - h * 0.5, x + ww, y]).fill({ color: c, alpha: 0.95 });
      }
      props.rect(x - 2.5, base - 4, 5, 14).fill({ color: darker });
      if (r() < 0.35) glows.push(addGlow(back, x + (r() - 0.5) * 40, base - h * 0.6, "#a7f3d0", 0.6, 0.35));
    }
  } else if (spec.kind === "peaks") {
    const pts: number[] = [spec.x0, topY(spec.x0) + 20];
    for (let x = spec.x0; x <= spec.x1; x += 30 + r() * 40) {
      pts.push(x, topY(x) - 50 - r() * 160, x + 12 + r() * 10, topY(x) - 20 - r() * 40);
    }
    pts.push(spec.x1, topY(spec.x1) + 20);
    props.poly(pts).fill({ color: dark });
    for (let i = 0; i < (spec.x1 - spec.x0) / 120; i++) {
      const x = spec.x0 + r() * (spec.x1 - spec.x0);
      glows.push(addGlow(back, x, topY(x) - 30 - r() * 90, "#fb923c", 0.9 + r(), 0.4));
    }
  } else if (spec.kind === "crystal") {
    for (let x = spec.x0 + 30; x < spec.x1; x += 40 + r() * 50) {
      const h = 50 + r() * 140;
      const w = 10 + r() * 14;
      const b = topY(x) + 20;
      const lean = (r() - 0.5) * 0.4;
      props.poly([x - w, b, x - w * 0.6 + lean * h, b - h * 0.85, x + lean * h, b - h, x + w * 0.6 + lean * h, b - h * 0.85, x + w, b])
        .fill({ color: mix(dark, col, 0.35), alpha: 0.95 });
      props.poly([x, b, x + lean * h, b - h, x + w * 0.6 + lean * h, b - h * 0.85, x + w, b]).fill({ color: mix(dark, "#ffffff", 0.08), alpha: 0.6 });
      if (r() < 0.6) glows.push(addGlow(back, x + lean * h, b - h, col, 0.8, 0.45));
    }
  } else if (spec.kind === "sky") {
    const mx = spec.x0 + (spec.x1 - spec.x0) * (0.3 + r() * 0.4);
    const my = spec.top - 210;
    glows.push(addGlow(back, mx, my, "#e9d5ff", 6, 0.35));
    props.circle(mx, my, 62).fill({ color: 0xf5f0ff, alpha: 0.9 });
    props.circle(mx + 24, my - 12, 54).fill({ color: mix(spec.bg, col, 0.05) });
    for (let i = 0; i < (spec.x1 - spec.x0) / 160; i++) {
      const x = spec.x0 + r() * (spec.x1 - spec.x0);
      const y = spec.top - 60 - r() * 120;
      props.ellipse(x, y, 26 + r() * 20, 7).fill({ color: dark });
      props.poly([x - 22, y, x, y + 26 + r() * 20, x + 22, y]).fill({ color: darker });
    }
  } else if (spec.kind === "shrine") {
    for (let x = spec.x0 + 40; x < spec.x1 - 20; x += 90) {
      const b = topY(x) + 16;
      props.rect(x - 7, b - 90, 14, 90).fill({ color: dark });
      props.rect(x - 12, b - 96, 24, 8).fill({ color: mix(dark, col, 0.3) });
      glows.push(addGlow(back, x, b - 104, col, 0.7, 0.55));
    }
  }

  // Rocky underside, deepest in the middle.
  const under: number[] = [];
  for (const x of xs) under.push(x, botY(x) - 10);
  for (let i = xs.length - 1; i >= 0; i--) {
    const x = xs[i];
    const u = (x - spec.x0) / (spec.x1 - spec.x0);
    const depth = (40 + r() * 70) * Math.sin(Math.PI * u) + (i % 2 ? r() * 60 : 0) * Math.sin(Math.PI * u);
    under.push(x, botY(x) + depth);
  }
  const rock = new Graphics();
  rock.poly(under).fill({ color: darker });
  // Strata lines catch a little of the zone light.
  for (let k = 1; k <= 3; k++) {
    rock.moveTo(xs[0] + 30, botY(xs[0]) + k * 14);
    for (const x of xs.slice(1, -1)) rock.lineTo(x, botY(x) + k * 14 + Math.sin(x * 0.03 + k) * 4);
    rock.stroke({ width: 1.5, color: col, alpha: 0.08 });
  }
  if (spec.kind === "falls") {
    for (let x = spec.x0 + 60; x < spec.x1 - 40; x += 70 + r() * 60) {
      const y = botY(x) + 10;
      const len = 120 + r() * 160;
      rock.rect(x - 6, y, 12, len).fill({ color: 0x7dd3fc, alpha: 0.28 });
      rock.rect(x - 2, y, 4, len).fill({ color: 0xe0f2fe, alpha: 0.45 });
      glows.push(addGlow(back, x, y + len, "#7dd3fc", 1.4, 0.35));
    }
  }
  back.addChild(rock);

  // Surface plate the tiles sit on.
  const surface = new Graphics();
  const plate: number[] = [];
  for (const x of xs) plate.push(x, topY(x));
  for (let i = xs.length - 1; i >= 0; i--) plate.push(xs[i], botY(xs[i]));
  surface.poly(plate).fill({ color: mix(spec.bg, col, 0.14), alpha: 0.88 });
  // Inner sheen and lit rim give the plate some depth.
  const inner: number[] = [];
  for (const x of xs) if (inset(x) < capR * 0.8) inner.push(x, topY(x) + 14 + inset(x) * 0.2);
  for (let i = xs.length - 1; i >= 0; i--) if (inset(xs[i]) < capR * 0.8) inner.push(xs[i], botY(xs[i]) - 14 - inset(xs[i]) * 0.2);
  if (inner.length > 6) surface.poly(inner).fill({ color: mix(spec.bg, col, 0.2), alpha: 0.5 });
  surface.poly(plate).stroke({ width: 2, color: col, alpha: 0.35 });
  surface.moveTo(xs[0], topY(xs[0]));
  for (const x of xs.slice(1)) surface.lineTo(x, topY(x));
  surface.stroke({ width: 3, color: mix(col, "#ffffff", 0.4), alpha: 0.45 });
  back.addChild(surface);

  // Hanging crystals beneath glow softly.
  for (let i = 0; i < (spec.x1 - spec.x0) / 220; i++) {
    const x = spec.x0 + 60 + r() * (spec.x1 - spec.x0 - 120);
    const y = botY(x) + 30 + r() * 40;
    const g = new Graphics();
    g.poly([x - 7, y, x, y + 26 + r() * 20, x + 7, y]).fill({ color: mix(col, "#ffffff", 0.3), alpha: 0.75 });
    front.addChild(g);
    glows.push(addGlow(back, x, y + 16, col, 0.6, 0.5));
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
