import { Container, Graphics, Sprite } from "pixi.js";
import { COL_W, wave } from "./layout";
import { glowTexture, mix } from "./util";
import type { Scene } from "../visuals";

export type DecorKind =
  | "shrine" | "forest" | "falls" | "peaks" | "sky" | "crystal" | "city" | "bridge" | "hills"
  | "chinatown" | "lollipop" | "gumdrop" | "cupcake";

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
  /** Floating rock (fantasy), piers over the bay (city) or chocolate with frosting drips (candy). */
  scene: Scene;
}

export const CANDY = ["#ff4fa3", "#5ef0d0", "#ffd447", "#a78bfa", "#ff8a3d", "#7ee081"];

/** A striped candy cane standing at x with its foot on baseline b. */
/** Lollipop swirl: separate arcs, each starting its own path so they never join up. */
export function swirl(g: Graphics, x: number, y: number, rad: number) {
  for (let k = 1; k <= 3; k++) {
    const rr = rad * (k / 3.6);
    g.moveTo(x + Math.cos(k) * rr, y + Math.sin(k) * rr).arc(x, y, rr, k, k + Math.PI * 1.3).stroke({ width: 3, color: 0xffffff, alpha: 0.75 });
  }
}

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
  } else if (spec.kind === "shrine" && spec.scene === "city") {
    // The Ferry Building: a long arcaded hall with its clock tower in the middle.
    const mid = (spec.x0 + spec.x1) / 2;
    const b = topY(mid) + 18;
    const hallW = (spec.x1 - spec.x0) * 0.8;
    const stone = mix(spec.bg, "#e7dcc8", 0.32);
    props.rect(mid - hallW / 2, b - 46, hallW, 46).fill({ color: stone });
    props.rect(mid - hallW / 2 - 4, b - 50, hallW + 8, 6).fill({ color: mix(stone, "#ffffff", 0.2) });
    for (let x = mid - hallW / 2 + 12; x < mid + hallW / 2 - 10; x += 16) props.roundRect(x, b - 36, 8, 22, 4).fill({ color: "#fde68a", alpha: 0.55 });
    props.rect(mid - 14, b - 190, 28, 150).fill({ color: stone });
    props.rect(mid - 18, b - 196, 36, 8).fill({ color: mix(stone, "#ffffff", 0.2) });
    props.poly([mid - 12, b - 196, mid, b - 236, mid + 12, b - 196]).fill({ color: mix(stone, "#000000", 0.2) });
    props.circle(mid, b - 160, 10).fill({ color: 0xfff7d6 });
    props.circle(mid, b - 160, 10).stroke({ width: 2, color: 0x7c5a2a });
    props.moveTo(mid, b - 160).lineTo(mid, b - 167).stroke({ width: 1.5, color: 0x3b2a12 });
    props.moveTo(mid, b - 160).lineTo(mid + 5, b - 160).stroke({ width: 1.5, color: 0x3b2a12 });
    glows.push(addGlow(back, mid, b - 160, "#fde68a", 1.2, 0.5));
  } else if (spec.kind === "shrine" && spec.scene === "candy") {
    // Gingerbread war camp: iced cottages and candy-cane posts.
    for (let x = spec.x0 + 50; x < spec.x1 - 30; x += 70) {
      const b = topY(x) + 18;
      const w = 34;
      const ginger = 0xb5652b;
      props.rect(x - w / 2, b - 34, w, 34).fill({ color: ginger });
      props.poly([x - w / 2 - 6, b - 32, x, b - 62, x + w / 2 + 6, b - 32]).fill({ color: 0x8a4a1e });
      props.moveTo(x - w / 2 - 6, b - 32).lineTo(x, b - 62).lineTo(x + w / 2 + 6, b - 32).stroke({ width: 4, color: 0xfff7fb, join: "round" });
      props.roundRect(x - 5, b - 18, 10, 18, 5).fill({ color: 0xfff7fb });
      props.circle(x - 10, b - 26, 3).fill({ color: CANDY[(x | 0) % CANDY.length] });
      props.circle(x + 10, b - 26, 3).fill({ color: CANDY[((x | 0) + 2) % CANDY.length] });
      candyCane(props, x + 30, b, 70, false);
    }
  } else if (spec.kind === "shrine") {
    for (let x = spec.x0 + 40; x < spec.x1 - 20; x += 90) {
      const b = topY(x) + 16;
      props.rect(x - 7, b - 90, 14, 90).fill({ color: dark });
      props.rect(x - 12, b - 96, 24, 8).fill({ color: mix(dark, col, 0.3) });
      glows.push(addGlow(back, x, b - 104, col, 0.7, 0.55));
    }
  } else if (spec.kind === "city") {
    // Skyline with a few lit windows; an occasional spire.
    for (let x = spec.x0 + 24; x < spec.x1 - 24; x += 22 + r() * 18) {
      const w = 16 + r() * 18;
      const h = 50 + r() * 120 + (r() < 0.08 ? 90 : 0);
      const b = topY(x) + 18;
      props.rect(x - w / 2, b - h, w, h).fill({ color: mix(dark, col, 0.08 + r() * 0.12), alpha: 0.95 });
      if (h > 150) props.poly([x - w / 2, b - h, x, b - h - 46, x + w / 2, b - h]).fill({ color: mix(dark, col, 0.15) });
      for (let wy = b - h + 10; wy < b - 14; wy += 13) {
        for (let wx = x - w / 2 + 4; wx < x + w / 2 - 5; wx += 7) {
          if (r() < 0.22) props.rect(wx, wy, 3, 5).fill({ color: r() < 0.7 ? "#fde68a" : col, alpha: 0.75 });
        }
      }
      if (r() < 0.15) glows.push(addGlow(back, x, b - h, col, 0.5, 0.4));
    }
  } else if (spec.kind === "bridge") {
    // Suspension bridge: two towers, sagging main cables, hanger lines.
    const towers = [spec.x0 + (spec.x1 - spec.x0) * 0.25, spec.x0 + (spec.x1 - spec.x0) * 0.75];
    const deck = (x: number) => topY(x) + 6;
    const red = mix(col, "#ff3b10", 0.5);
    const tH = 230;
    for (const tx of towers) {
      props.rect(tx - 9, deck(tx) - tH, 18, tH).fill({ color: red });
      for (const k of [0.25, 0.55, 0.82]) props.rect(tx - 13, deck(tx) - tH * k, 26, 6).fill({ color: mix(red, "#000000", 0.25) });
      glows.push(addGlow(back, tx, deck(tx) - tH, "#ff6b35", 1.1, 0.55));
    }
    const top = (tx: number) => deck(tx) - tH + 8;
    const spans: [number, number, number][] = [
      [spec.x0, towers[0], 0.15], [towers[0], towers[1], 0.85], [towers[1], spec.x1, 0.15],
    ];
    for (const [a, c, sag] of spans) {
      const ya = a === spec.x0 ? deck(a) - 10 : top(a);
      const yc = c === spec.x1 ? deck(c) - 10 : top(c);
      const mid = (a + c) / 2;
      const cy = Math.max(ya, yc) + (deck(mid) - Math.max(ya, yc)) * sag * 1.6;
      props.moveTo(a, ya).quadraticCurveTo(mid, cy, c, yc).stroke({ width: 3, color: red, alpha: 0.95 });
      for (let x = a + 14; x < c - 6; x += 16) {
        const u = (x - a) / (c - a);
        const yy = (1 - u) ** 2 * ya + 2 * (1 - u) * u * cy + u * u * yc;
        props.moveTo(x, yy).lineTo(x, deck(x)).stroke({ width: 1, color: red, alpha: 0.5 });
      }
    }
  } else if (spec.kind === "hills") {
    // Stepped streets climbing a hill, with Victorian rooftops.
    const peak = spec.x0 + (spec.x1 - spec.x0) * (0.3 + r() * 0.4);
    const span = (spec.x1 - spec.x0) / 2;
    const hill = (x: number) => topY(x) + 20 - 150 * Math.max(0, 1 - Math.abs(x - peak) / span);
    const pts: number[] = [spec.x0, topY(spec.x0) + 20];
    for (let x = spec.x0; x <= spec.x1; x += 12) pts.push(x, hill(x));
    pts.push(spec.x1, topY(spec.x1) + 20);
    props.poly(pts).fill({ color: dark });
    for (let x = spec.x0 + 20; x < spec.x1 - 20; x += 20 + r() * 8) {
      const b = hill(x) + 4;
      const w = 14 + r() * 4;
      const h = 22 + r() * 18;
      const c = mix(dark, col, 0.2 + r() * 0.25);
      props.rect(x - w / 2, b - h, w, h).fill({ color: c });
      props.poly([x - w / 2 - 2, b - h, x, b - h - 10, x + w / 2 + 2, b - h]).fill({ color: mix(c, "#000000", 0.2) });
      if (r() < 0.5) props.rect(x - 3, b - h + 6, 6, 7).fill({ color: "#fde68a", alpha: 0.7 });
    }
    glows.push(addGlow(back, peak, hill(peak) - 40, col, 1.4, 0.3));
    // A cable car mid-climb.
    const cx = peak - span * 0.4;
    const cb = hill(cx) - 2;
    const car = mix("#f5b631", "#c2410c", 0.2);
    props.roundRect(cx - 20, cb - 22, 40, 20, 4).fill({ color: car });
    props.rect(cx - 22, cb - 25, 44, 5).fill({ color: 0x7c2d12 });
    for (let k = -14; k <= 10; k += 8) props.rect(cx + k, cb - 18, 5, 7).fill({ color: 0xfef3c7, alpha: 0.85 });
    props.moveTo(cx, cb - 25).lineTo(cx, cb - 34).stroke({ width: 1.5, color: 0x1f2937 });
    glows.push(addGlow(back, cx, cb - 12, "#fde68a", 0.6, 0.4));
  } else if (spec.kind === "chinatown") {
    // Grant Avenue: shophouses with upturned eaves, a Dragon Gate and strings of red lanterns.
    const red = "#e11d48";
    const jade = "#0f9f78";
    for (let x = spec.x0 + 34; x < spec.x1 - 30; x += 44 + r() * 18) {
      const w = 34 + r() * 10;
      const h = 60 + r() * 70;
      const b = topY(x) + 18;
      const c = mix(dark, r() < 0.55 ? red : jade, 0.22);
      props.rect(x - w / 2, b - h, w, h).fill({ color: c });
      props.poly([x - w / 2 - 9, b - h + 5, x - w / 2 - 2, b - h - 7, x + w / 2 + 2, b - h - 7, x + w / 2 + 9, b - h + 5, x + w / 2, b - h, x - w / 2, b - h])
        .fill({ color: mix(jade, "#000000", 0.35) });
      for (let wy = b - h + 14; wy < b - 12; wy += 18) props.rect(x - w / 2 + 5, wy, w - 10, 6).fill({ color: "#fde68a", alpha: r() < 0.6 ? 0.55 : 0.15 });
    }
    const gx = spec.x0 + Math.min(150, (spec.x1 - spec.x0) * 0.2);
    const gb = topY(gx) + 18;
    for (const dx of [-62, 52]) props.rect(gx + dx, gb - 124, 10, 124).fill({ color: red });
    for (const dx of [-28, 20]) props.rect(gx + dx, gb - 96, 8, 96).fill({ color: mix(red, "#000000", 0.15) });
    props.poly([gx - 84, gb - 120, gx - 72, gb - 138, gx + 72, gb - 138, gx + 84, gb - 120]).fill({ color: jade });
    props.poly([gx - 50, gb - 146, gx - 40, gb - 162, gx + 40, gb - 162, gx + 50, gb - 146]).fill({ color: jade });
    props.rect(gx - 66, gb - 120, 132, 6).fill({ color: "#fbbf24" });
    props.rect(gx - 42, gb - 146, 84, 8).fill({ color: red });
    glows.push(addGlow(back, gx, gb - 140, "#fbbf24", 1.2, 0.4));
    for (let x = spec.x0 + 30; x < spec.x1 - 90; x += 130 + r() * 50) {
      const x2 = Math.min(spec.x1 - 20, x + 110 + r() * 40);
      const y1 = topY(x) - 70 - r() * 50;
      const y2 = topY(x2) - 70 - r() * 50;
      const cy = Math.max(y1, y2) + 36;
      props.moveTo(x, y1).quadraticCurveTo((x + x2) / 2, cy, x2, y2).stroke({ width: 1.5, color: 0x1f1520, alpha: 0.9 });
      for (let u = 0.14; u < 0.9; u += 0.18) {
        const px = (1 - u) ** 2 * x + 2 * (1 - u) * u * ((x + x2) / 2) + u * u * x2;
        const py = (1 - u) ** 2 * y1 + 2 * (1 - u) * u * cy + u * u * y2;
        props.rect(px - 1, py, 2, 4).fill({ color: 0x1f1520 });
        props.ellipse(px, py + 11, 7, 9).fill({ color: red });
        props.rect(px - 4, py + 2, 8, 3).fill({ color: 0xfbbf24 });
        props.rect(px - 4, py + 18, 8, 3).fill({ color: 0xfbbf24 });
        glows.push(addGlow(back, px, py + 11, "#ff3b3b", 0.45, 0.6));
      }
    }
  } else if (spec.kind === "lollipop") {
    // Giant swirl lollipops over a carpet of gumdrops.
    for (let x = spec.x0 + 30; x < spec.x1 - 20; x += 46 + r() * 34) {
      const b = topY(x) + 18;
      const h = 60 + r() * 100;
      const rad = 16 + r() * 12;
      const c = CANDY[Math.floor(r() * CANDY.length)];
      props.rect(x - 2.5, b - h, 5, h).fill({ color: 0xfff7fb, alpha: 0.9 });
      props.circle(x, b - h, rad).fill({ color: c });
      swirl(props, x, b - h, rad);
      if (r() < 0.4) glows.push(addGlow(back, x, b - h, c, 0.7, 0.35));
    }
    for (let x = spec.x0 + 16; x < spec.x1 - 10; x += 18 + r() * 14) {
      const b = topY(x) + 20;
      const c = CANDY[Math.floor(r() * CANDY.length)];
      props.ellipse(x, b - 8, 11, 12).fill({ color: mix(c, dark, 0.25) });
      props.circle(x - 3, b - 12, 2).fill({ color: 0xffffff, alpha: 0.5 });
    }
  } else if (spec.kind === "gumdrop") {
    // Gumdrop hills sparkling with sugar, candy canes between them.
    for (let x = spec.x0 + 40; x < spec.x1 - 30; x += 60 + r() * 40) {
      const b = topY(x) + 20;
      const w = 30 + r() * 26;
      const h = 40 + r() * 60;
      const c = CANDY[Math.floor(r() * CANDY.length)];
      props.ellipse(x, b, w, h).fill({ color: mix(c, dark, 0.3) });
      props.ellipse(x - w * 0.3, b - h * 0.55, w * 0.18, h * 0.12).fill({ color: 0xffffff, alpha: 0.35 });
      for (let k = 0; k < 6; k++) props.circle(x + (r() - 0.5) * w * 1.4, b - r() * h * 0.9, 1.5).fill({ color: 0xffffff, alpha: 0.7 });
      if (r() < 0.5) candyCane(props, x + w + 8, b, 50 + r() * 40, r() < 0.5);
    }
  } else if (spec.kind === "cupcake") {
    // Frosting towers: stacked swirls topped with a cherry.
    for (let x = spec.x0 + 40; x < spec.x1 - 30; x += 70 + r() * 40) {
      const b = topY(x) + 20;
      const w = 26 + r() * 10;
      const tiers = 3 + Math.floor(r() * 3);
      const icing = r() < 0.5 ? "#ffd1ea" : "#fff7fb";
      props.poly([x - w, b - 30, x - w * 0.8, b, x + w * 0.8, b, x + w, b - 30]).fill({ color: mix(col, dark, 0.35) });
      for (let k = 0; k < tiers; k++) props.ellipse(x, b - 34 - k * 16, w * (1.1 - k * 0.2), 12).fill({ color: mix(icing, col, k * 0.08) });
      props.circle(x, b - 40 - tiers * 16, 7).fill({ color: 0xef4469 });
      glows.push(addGlow(back, x, b - 40 - tiers * 16, "#ff7ac2", 0.5, 0.45));
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
  if (spec.scene === "city") {
    // Piers: a shallow deck on pilings standing in the bay.
    under.length = 0;
    for (const x of xs) under.push(x, botY(x) - 10);
    for (let i = xs.length - 1; i >= 0; i--) under.push(xs[i], botY(xs[i]) + 16);
    for (let x = spec.x0 + 40; x < spec.x1 - 30; x += 64) {
      rock.rect(x - 5, botY(x) + 10, 10, 34 + r() * 18).fill({ color: mix(darker, "#000000", 0.3) });
      rock.rect(x - 7, botY(x) + 10, 14, 4).fill({ color: mix(darker, col, 0.2) });
    }
    for (let k = 0; k < 4; k++) {
      const y = spec.bottom + 60 + k * 16;
      for (let x = spec.x0; x < spec.x1; x += 40 + r() * 50) rock.rect(x, y + waveAt(x), 16 + r() * 30, 2).fill({ color: col, alpha: 0.12 - k * 0.02 });
    }
  } else if (spec.scene === "candy") {
    // Chocolate base, shallower than rock.
    under.length = 0;
    for (const x of xs) under.push(x, botY(x) - 10);
    for (let i = xs.length - 1; i >= 0; i--) {
      const u = (xs[i] - spec.x0) / (spec.x1 - spec.x0);
      under.push(xs[i], botY(xs[i]) + 24 + 40 * Math.sin(Math.PI * u));
    }
  }
  rock.poly(under).fill({ color: spec.scene === "candy" ? mix(spec.bg, "#5b2a1a", 0.7) : darker });
  // Strata lines catch a little of the zone light.
  for (let k = 1; k <= 3; k++) {
    rock.moveTo(xs[0] + 30, botY(xs[0]) + k * 14);
    for (const x of xs.slice(1, -1)) rock.lineTo(x, botY(x) + k * 14 + Math.sin(x * 0.03 + k) * 4);
    rock.stroke({ width: 1.5, color: col, alpha: 0.08 });
  }
  if (spec.kind === "falls") {
    const water = spec.scene === "candy" ? 0xffab40 : 0x7dd3fc;
    const foam = spec.scene === "candy" ? 0xffe0b2 : 0xe0f2fe;
    for (let x = spec.x0 + 60; x < spec.x1 - 40; x += 70 + r() * 60) {
      const y = botY(x) + 10;
      const len = 120 + r() * 160;
      rock.rect(x - 6, y, 12, len).fill({ color: water, alpha: spec.scene === "candy" ? 0.5 : 0.28 });
      rock.rect(x - 2, y, 4, len).fill({ color: foam, alpha: 0.45 });
      glows.push(addGlow(back, x, y + len, water, 1.4, 0.35));
    }
  }
  back.addChild(rock);

  // Surface plate the tiles sit on.
  const surface = new Graphics();
  const plate: number[] = [];
  for (const x of xs) plate.push(x, topY(x));
  for (let i = xs.length - 1; i >= 0; i--) plate.push(xs[i], botY(xs[i]));
  surface.poly(plate).fill({ color: mix(spec.bg, col, spec.scene === "candy" ? 0.24 : 0.14), alpha: 0.88 });
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

  if (spec.scene === "candy") {
    // A band of frosting along the chocolate edge, dripping here and there.
    const icing = mix(col, "#ffffff", 0.78);
    const g = new Graphics();
    const band: number[] = [];
    for (const x of xs) band.push(x, botY(x) - 14);
    for (let i = xs.length - 1; i >= 0; i--) band.push(xs[i], botY(xs[i]) + 4 + Math.sin(xs[i] * 0.07) * 3);
    g.poly(band).fill({ color: icing });
    for (let x = spec.x0 + 40; x < spec.x1 - 30; x += 30 + r() * 40) {
      const y = botY(x);
      const w = 12 + r() * 10;
      const len = 10 + r() * 30;
      g.roundRect(x - w / 2, y - 4, w, len, w / 2).fill({ color: icing });
      g.circle(x, y + len - w / 2 - 2, w / 2 + 1.5).fill({ color: icing });
    }
    for (let i = 0; i < (spec.x1 - spec.x0) / 14; i++) {
      const x = spec.x0 + 30 + r() * (spec.x1 - spec.x0 - 60);
      g.roundRect(x, botY(x) - 10 + r() * 10, 5, 2, 1).fill({ color: CANDY[i % CANDY.length] });
    }
    front.addChild(g);
    return { back, front, glows };
  }
  if (spec.scene === "city") return { back, front, glows };

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
