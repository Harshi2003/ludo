import type { Glyph } from "@ludo/engine";
import type { Graphics } from "pixi.js";

const PI = Math.PI;

/**
 * Draws a glyph centred at 0,0 with half-size s. `cut` is the background
 * color, used to carve details (moon crescent, skull eyes, leaf vein).
 */
export function drawGlyph(g: Graphics, glyph: Glyph, s: number, color: number, cut: number) {
  const line = { width: Math.max(2, s * 0.2), color, cap: "round", join: "round" } as const;
  switch (glyph) {
    case "moon":
      g.circle(0, 0, s * 0.85).fill(color);
      g.circle(s * 0.38, -s * 0.22, s * 0.72).fill(cut);
      g.star(s * 0.35, s * 0.35, 4, s * 0.22, s * 0.07).fill(color);
      break;

    case "portal":
      g.circle(0, 0, s * 0.95).stroke({ ...line, width: s * 0.14 });
      g.arc(0, 0, s * 0.62, 0, PI * 1.4).stroke({ ...line, width: s * 0.16 });
      g.arc(0, 0, s * 0.3, PI, PI * 2.6).stroke({ ...line, width: s * 0.16 });
      g.circle(0, 0, s * 0.1).fill(color);
      break;

    case "bolt":
      g.poly([-0.15, -1, 0.5, -1, 0.1, -0.18, 0.55, -0.18, -0.3, 1, -0.05, 0.12, -0.5, 0.12].map((v) => v * s)).fill(color);
      break;

    case "shield":
      g.moveTo(0, -s)
        .lineTo(s * 0.82, -s * 0.62)
        .bezierCurveTo(s * 0.82, s * 0.3, s * 0.42, s * 0.75, 0, s)
        .bezierCurveTo(-s * 0.42, s * 0.75, -s * 0.82, s * 0.3, -s * 0.82, -s * 0.62)
        .closePath()
        .fill(color);
      g.moveTo(0, -s * 0.6).lineTo(0, s * 0.62).stroke({ width: s * 0.12, color: cut, cap: "round" });
      g.moveTo(-s * 0.45, -s * 0.15).lineTo(s * 0.45, -s * 0.15).stroke({ width: s * 0.12, color: cut, cap: "round" });
      break;

    case "eye":
      g.moveTo(-s, 0).quadraticCurveTo(0, -s * 0.95, s, 0).quadraticCurveTo(0, s * 0.95, -s, 0).closePath().fill(color);
      g.circle(0, 0, s * 0.42).fill(cut);
      g.ellipse(0, 0, s * 0.11, s * 0.34).fill(color);
      break;

    case "snowflake":
      for (let i = 0; i < 3; i++) {
        const a = (i * PI) / 3 + PI / 2;
        const [cx, cy] = [Math.cos(a), Math.sin(a)];
        g.moveTo(-cx * s, -cy * s).lineTo(cx * s, cy * s).stroke({ ...line, width: s * 0.14 });
        for (const dir of [1, -1]) {
          const bx = cx * s * 0.58 * dir;
          const by = cy * s * 0.58 * dir;
          for (const side of [1, -1]) {
            const b = a + (side * PI) / 4 + (dir < 0 ? PI : 0);
            g.moveTo(bx, by).lineTo(bx + Math.cos(b) * s * 0.32, by + Math.sin(b) * s * 0.32).stroke({ ...line, width: s * 0.12 });
          }
        }
      }
      break;

    case "chevrons":
      for (const dx of [-0.42, 0.28]) {
        g.moveTo((dx - 0.25) * s, -s * 0.7).lineTo((dx + 0.3) * s, 0).lineTo((dx - 0.25) * s, s * 0.7).stroke({ ...line, width: s * 0.26 });
      }
      break;

    case "question":
      g.arc(0, -s * 0.38, s * 0.42, PI, PI * 2.35).lineTo(0, s * 0.22).stroke({ ...line, width: s * 0.22 });
      g.circle(0, s * 0.68, s * 0.14).fill(color);
      break;

    case "swap":
      g.moveTo(-s * 0.8, -s * 0.35).lineTo(s * 0.55, -s * 0.35).stroke({ ...line, width: s * 0.18 });
      g.poly([s * 0.35, -s * 0.72, s * 0.95, -s * 0.35, s * 0.35, s * 0.02]).fill(color);
      g.moveTo(s * 0.8, s * 0.38).lineTo(-s * 0.55, s * 0.38).stroke({ ...line, width: s * 0.18 });
      g.poly([-s * 0.35, s * 0.01, -s * 0.95, s * 0.38, -s * 0.35, s * 0.75]).fill(color);
      break;

    case "star":
      g.star(0, 0, 5, s, s * 0.45, 0).fill(color);
      g.star(s * 0.78, -s * 0.72, 4, s * 0.26, s * 0.07).fill(color);
      break;

    case "flame":
      g.moveTo(0, -s)
        .bezierCurveTo(s * 0.55, -s * 0.35, s * 0.85, s * 0.2, s * 0.6, s * 0.65)
        .bezierCurveTo(s * 0.42, s * 0.95, -s * 0.42, s * 0.95, -s * 0.6, s * 0.65)
        .bezierCurveTo(-s * 0.85, s * 0.2, -s * 0.5, -s * 0.2, -s * 0.25, -s * 0.38)
        .bezierCurveTo(-s * 0.15, -s * 0.1, 0, -s * 0.05, 0.05 * s, -s * 0.2)
        .bezierCurveTo(s * 0.1, -s * 0.5, -s * 0.05, -s * 0.8, 0, -s)
        .closePath()
        .fill(color);
      g.moveTo(0, s * 0.05)
        .bezierCurveTo(s * 0.35, s * 0.35, s * 0.35, s * 0.8, 0, s * 0.8)
        .bezierCurveTo(-s * 0.35, s * 0.8, -s * 0.3, s * 0.4, 0, s * 0.05)
        .closePath()
        .fill(cut);
      break;

    case "drop":
      g.moveTo(0, -s)
        .bezierCurveTo(s * 0.15, -s * 0.55, s * 0.72, -s * 0.05, s * 0.72, s * 0.33)
        .bezierCurveTo(s * 0.72, s * 0.75, s * 0.38, s, 0, s)
        .bezierCurveTo(-s * 0.38, s, -s * 0.72, s * 0.75, -s * 0.72, s * 0.33)
        .bezierCurveTo(-s * 0.72, -s * 0.05, -s * 0.15, -s * 0.55, 0, -s)
        .closePath()
        .fill(color);
      g.arc(0, s * 0.33, s * 0.42, PI * 0.6, PI * 0.95).stroke({ width: s * 0.12, color: cut, cap: "round" });
      break;

    case "leaf":
      g.moveTo(-s * 0.8, s * 0.8)
        .bezierCurveTo(-s * 0.95, -s * 0.35, s * 0.15, -s * 0.95, s * 0.9, -s * 0.9)
        .bezierCurveTo(s * 0.95, -s * 0.1, s * 0.4, s * 0.92, -s * 0.8, s * 0.8)
        .closePath()
        .fill(color);
      g.moveTo(-s * 0.7, s * 0.7).quadraticCurveTo(0, 0, s * 0.55, -s * 0.55).stroke({ width: s * 0.1, color: cut, cap: "round" });
      break;

    case "wind":
      g.moveTo(-s, -s * 0.38).lineTo(s * 0.3, -s * 0.38).arc(s * 0.3, -s * 0.66, s * 0.28, PI / 2, -PI * 0.9, true).stroke(line);
      g.moveTo(-s, s * 0.05).lineTo(s * 0.55, s * 0.05).arc(s * 0.55, s * 0.33, s * 0.28, -PI / 2, PI * 0.9).stroke(line);
      g.moveTo(-s * 0.7, s * 0.5).lineTo(0, s * 0.5).stroke(line);
      break;

    case "skull":
      g.circle(0, -s * 0.18, s * 0.72).fill(color);
      g.roundRect(-s * 0.42, s * 0.25, s * 0.84, s * 0.55, s * 0.12).fill(color);
      g.circle(-s * 0.27, -s * 0.15, s * 0.2).fill(cut);
      g.circle(s * 0.27, -s * 0.15, s * 0.2).fill(cut);
      g.poly([0, s * 0.05, -s * 0.1, s * 0.25, s * 0.1, s * 0.25]).fill(cut);
      for (const x of [-0.2, 0, 0.2]) g.rect((x - 0.04) * s, s * 0.52, s * 0.08, s * 0.28).fill(cut);
      break;

    case "gem":
      g.poly([0, -s, s * 0.8, -s * 0.25, 0, s, -s * 0.8, -s * 0.25]).fill(color);
      g.poly([0, -s, s * 0.32, -s * 0.25, 0, s, -s * 0.32, -s * 0.25]).fill({ color: 0xffffff, alpha: 0.35 });
      g.moveTo(-s * 0.8, -s * 0.25).lineTo(s * 0.8, -s * 0.25).stroke({ width: s * 0.07, color: cut });
      break;

    case "crown":
      g.poly([-s, s * 0.6, -s, -s * 0.35, -s * 0.5, s * 0.05, 0, -s * 0.8, s * 0.5, s * 0.05, s, -s * 0.35, s, s * 0.6]).fill(color);
      for (const x of [-1, 0, 1]) g.circle(x * s * (x === 0 ? 0 : 1), x === 0 ? -s * 0.85 : -s * 0.4, s * 0.13).fill(color);
      break;

    case "anchor":
      g.circle(0, -s * 0.72, s * 0.2).stroke({ ...line, width: s * 0.14 });
      g.moveTo(0, -s * 0.5).lineTo(0, s * 0.9).stroke(line);
      g.moveTo(-s * 0.45, -s * 0.2).lineTo(s * 0.45, -s * 0.2).stroke(line);
      g.arc(0, s * 0.15, s * 0.75, PI * 0.1, PI * 0.9).stroke(line);
      break;

    case "heart":
      g.moveTo(0, s * 0.9)
        .bezierCurveTo(-s * 1.1, s * 0.1, -s * 0.7, -s * 0.95, 0, -s * 0.4)
        .bezierCurveTo(s * 0.7, -s * 0.95, s * 1.1, s * 0.1, 0, s * 0.9)
        .closePath()
        .fill(color);
      break;

    case "cablecar":
      g.moveTo(-s, -s * 0.85).lineTo(s, -s * 0.85).stroke({ ...line, width: s * 0.1 });
      g.moveTo(0, -s * 0.85).lineTo(0, -s * 0.55).stroke({ ...line, width: s * 0.12 });
      g.roundRect(-s * 0.85, -s * 0.55, s * 1.7, s * 1.15, s * 0.18).fill(color);
      for (const x of [-0.55, -0.1, 0.35]) g.rect(x * s, -s * 0.38, s * 0.3, s * 0.36).fill(cut);
      g.circle(-s * 0.48, s * 0.78, s * 0.17).fill(color);
      g.circle(s * 0.48, s * 0.78, s * 0.17).fill(color);
      break;

    case "bridge":
      for (const x of [-0.5, 0.5]) g.rect((x - 0.08) * s, -s, s * 0.16, s * 1.75).fill(color);
      g.moveTo(-s, -s * 0.15).quadraticCurveTo(-s * 0.5, -s * 1.1, -s * 0.5, -s * 0.95)
        .moveTo(-s * 0.5, -s * 0.95).quadraticCurveTo(0, s * 0.1, s * 0.5, -s * 0.95)
        .moveTo(s * 0.5, -s * 0.95).quadraticCurveTo(s * 0.5, -s * 1.1, s, -s * 0.15)
        .stroke({ ...line, width: s * 0.1 });
      g.rect(-s, s * 0.25, s * 2, s * 0.16).fill(color);
      break;

    case "cloud":
      g.circle(-s * 0.42, s * 0.12, s * 0.4).fill(color);
      g.circle(s * 0.05, -s * 0.18, s * 0.52).fill(color);
      g.circle(s * 0.5, s * 0.15, s * 0.36).fill(color);
      g.roundRect(-s * 0.82, s * 0.1, s * 1.68, s * 0.42, s * 0.2).fill(color);
      g.moveTo(-s * 0.7, s * 0.8).lineTo(s * 0.5, s * 0.8).stroke({ ...line, width: s * 0.12 });
      break;

    case "chip":
      g.roundRect(-s * 0.6, -s * 0.6, s * 1.2, s * 1.2, s * 0.15).fill(color);
      g.roundRect(-s * 0.3, -s * 0.3, s * 0.6, s * 0.6, s * 0.08).fill(cut);
      for (const k of [-0.32, 0, 0.32]) {
        g.moveTo(k * s, -s * 0.6).lineTo(k * s, -s * 0.95).moveTo(k * s, s * 0.6).lineTo(k * s, s * 0.95)
          .moveTo(-s * 0.6, k * s).lineTo(-s * 0.95, k * s).moveTo(s * 0.6, k * s).lineTo(s * 0.95, k * s)
          .stroke({ ...line, width: s * 0.11 });
      }
      break;

    case "none":
      break;
  }
}
