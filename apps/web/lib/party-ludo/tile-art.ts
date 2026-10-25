import { Graphics } from 'pixi.js';

export const PARTY_TILE_COLORS: Record<string, number> = {
  drink: 0x2dd4bf, everyone: 0xfb7185, truth: 0xa78bfa, dare: 0xfbbf24, likely: 0x60a5fa,
  never: 0xf472b6, rather: 0xc084fc, lucky: 0x4ade80, trap: 0xf87171, safe: 0x67e8f9,
};
/** Crisp local vector illustrations, drawn inside the existing hexagonal tile frame. */
export function drawPartyTileArt(g: Graphics, kind: string, size: number) {
  const k = size / 16, color = PARTY_TILE_COLORS[kind] ?? 0xffffff;
  const line = { width: 1.8, color: 0xfff7ed, cap: 'round' as const, join: 'round' as const };
  const glass = (x: number, y: number) => {
    g.poly([x - 8, y - 9, x + 8, y - 9, x, y + 1]).fill({ color, alpha: 0.45 }).stroke(line);
    g.moveTo(x, y + 1).lineTo(x, y + 11).moveTo(x - 5, y + 11).lineTo(x + 5, y + 11).stroke(line);
    g.circle(x + 7, y - 10, 3).fill(0xfde68a);
  };
  if (kind === 'drink') glass(0, 0);
  else if (kind === 'everyone') { glass(-6, 1); glass(6, -2); g.star(0, -14, 4, 3, 1).fill(0xfde68a); }
  else if (kind === 'truth') {
    g.roundRect(-13, -11, 26, 19, 5).fill({ color, alpha: 0.3 }).stroke(line);
    g.poly([-7, 8, -7, 14, -1, 8]).fill(color);
    g.moveTo(-3, -6).bezierCurveTo(4, -11, 9, -3, 1, 0).lineTo(1, 2).stroke(line); g.circle(1, 5, 1.1).fill(0xfff7ed);
  } else if (kind === 'dare') {
    g.roundRect(-5, -14, 10, 18, 5).fill({ color, alpha: 0.4 }).stroke(line);
    g.moveTo(-9, -1).bezierCurveTo(-9, 12, 9, 12, 9, -1).moveTo(0, 9).lineTo(0, 14).moveTo(-6, 14).lineTo(6, 14).stroke(line);
    g.moveTo(-3, -8).lineTo(3, -8).moveTo(-3, -3).lineTo(3, -3).stroke({ width: 1, color });
  } else if (kind === 'likely') {
    g.roundRect(-12, -1, 24, 15, 2).fill({ color, alpha: 0.3 }).stroke(line);
    g.moveTo(-7, 2).lineTo(7, 2).stroke(line);
    g.poly([-6, -14, 7, -10, 4, 0, -9, -4]).fill(color).stroke(line);
    g.moveTo(-4, -8).lineTo(-1, -5).lineTo(4, -10).stroke(line);
  } else if (kind === 'never') {
    g.moveTo(-8, 12).lineTo(-11, 2).bezierCurveTo(-12, -2, -7, -3, -5, 2).lineTo(-5, -9)
      .bezierCurveTo(-5, -13, -1, -13, -1, -9).lineTo(-1, -12).bezierCurveTo(-1, -16, 3, -16, 3, -12)
      .lineTo(3, -10).bezierCurveTo(3, -14, 7, -14, 7, -10).lineTo(7, -6)
      .bezierCurveTo(7, -10, 11, -10, 11, -6).lineTo(11, 7).lineTo(7, 13).closePath().fill({ color, alpha: 0.35 }).stroke(line);
  } else if (kind === 'rather') {
    g.moveTo(0, 14).lineTo(0, -11).stroke(line);
    g.poly([-14, -9, -3, -14, -3, -4]).fill(color).stroke(line);
    g.poly([14, 2, 3, -3, 3, 7]).fill(color).stroke(line);
    g.moveTo(-3, -9).lineTo(0, -9).moveTo(0, 2).lineTo(3, 2).stroke(line);
  } else if (kind === 'lucky') {
    for (const [x, y] of [[-5, -6], [5, -6], [-5, 3], [5, 3]]) g.circle(x, y, 6).fill(color).stroke({ width: 0.8, color: 0xd9f99d });
    g.moveTo(1, 6).bezierCurveTo(3, 10, 1, 13, -3, 14).stroke({ width: 2, color });
  } else if (kind === 'trap') {
    g.ellipse(0, 4, 14, 8).fill({ color, alpha: 0.3 }).stroke(line);
    for (let x = -10; x <= 10; x += 5) g.poly([x - 2, 2, x, -5, x + 2, 2]).fill(0xfff7ed);
    g.circle(0, 4, 3).fill(color); g.moveTo(13, 8).lineTo(18, 11).stroke(line);
  } else {
    g.roundRect(-12, -4, 24, 14, 4).fill({ color, alpha: 0.4 }).stroke(line);
    g.roundRect(-10, -12, 20, 12, 4).fill({ color, alpha: 0.3 }).stroke(line);
    g.moveTo(-13, 0).lineTo(-13, 8).moveTo(13, 0).lineTo(13, 8).moveTo(-8, 10).lineTo(-8, 14).moveTo(8, 10).lineTo(8, 14).stroke(line);
  }
  g.scale.set(k);
}
