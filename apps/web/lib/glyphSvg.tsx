import type { Glyph } from "@ludo/engine";
import type { Graphics } from "pixi.js";
import { drawGlyph } from "./board/glyphs";

type Paint = number | { color: number | string; alpha?: number };
type StrokeStyle = { width?: number; color?: number | string; alpha?: number; cap?: string; join?: string };
interface El { d: string; fill?: string; fillOpacity?: number; stroke?: string; strokeWidth?: number; strokeOpacity?: number; cap?: string; join?: string }

const css = (c: number | string) => (typeof c === "number" ? `#${c.toString(16).padStart(6, "0")}` : c);

/**
 * Records the subset of the Pixi Graphics API that drawGlyph uses and emits
 * SVG paths, so tiles and emblems in the DOM share the exact board icons.
 */
class SvgPen {
  els: El[] = [];
  private d = "";
  private cur: [number, number] | null = null;

  private add(s: string, end?: [number, number]) {
    this.d += s;
    if (end) this.cur = end;
    return this;
  }
  moveTo(x: number, y: number) { return this.add(`M${x} ${y}`, [x, y]); }
  lineTo(x: number, y: number) { return this.add(`L${x} ${y}`, [x, y]); }
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number) { return this.add(`C${a} ${b} ${c} ${d} ${x} ${y}`, [x, y]); }
  quadraticCurveTo(a: number, b: number, x: number, y: number) { return this.add(`Q${a} ${b} ${x} ${y}`, [x, y]); }
  closePath() { return this.add("Z"); }
  arc(cx: number, cy: number, r: number, start: number, end: number, ccw = false) {
    let delta = end - start;
    if (!ccw) while (delta < 0) delta += Math.PI * 2;
    else while (delta > 0) delta -= Math.PI * 2;
    const p = (a: number): [number, number] => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    const [sx, sy] = p(start);
    this.add(this.cur ? `L${sx} ${sy}` : `M${sx} ${sy}`, [sx, sy]);
    const steps = Math.abs(delta) > Math.PI * 1.5 ? 2 : 1;
    for (let i = 1; i <= steps; i++) {
      const a = start + (delta * i) / steps;
      const [x, y] = p(a);
      this.add(`A${r} ${r} 0 ${Math.abs(delta / steps) > Math.PI ? 1 : 0} ${ccw ? 0 : 1} ${x} ${y}`, [x, y]);
    }
    return this;
  }
  circle(x: number, y: number, r: number) { return this.ellipse(x, y, r, r); }
  ellipse(x: number, y: number, rx: number, ry: number) {
    return this.add(`M${x - rx} ${y}A${rx} ${ry} 0 1 0 ${x + rx} ${y}A${rx} ${ry} 0 1 0 ${x - rx} ${y}Z`, [x - rx, y]);
  }
  rect(x: number, y: number, w: number, h: number) { return this.add(`M${x} ${y}h${w}v${h}h${-w}Z`, [x, y]); }
  roundRect(x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2);
    return this.add(`M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`, [x, y]);
  }
  poly(pts: number[]) {
    let s = `M${pts[0]} ${pts[1]}`;
    for (let i = 2; i < pts.length; i += 2) s += `L${pts[i]} ${pts[i + 1]}`;
    return this.add(s + "Z", [pts[0], pts[1]]);
  }
  star(x: number, y: number, n: number, r: number, inner: number, rot = 0) {
    const pts: number[] = [];
    for (let i = 0; i < n * 2; i++) {
      const a = rot - Math.PI / 2 + (i * Math.PI) / n;
      const rr = i % 2 ? inner : r;
      pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    return this.poly(pts);
  }
  fill(p: Paint) {
    const c = typeof p === "number" ? { color: p } : p;
    this.els.push({ d: this.d, fill: css(c.color), fillOpacity: c.alpha });
    return this.reset();
  }
  stroke(s: StrokeStyle) {
    this.els.push({ d: this.d, fill: "none", stroke: css(s.color ?? 0xffffff), strokeWidth: s.width ?? 1, strokeOpacity: s.alpha, cap: s.cap, join: s.join });
    return this.reset();
  }
  private reset() {
    this.d = "";
    this.cur = null;
    return this;
  }
}

const cache = new Map<string, El[]>();

export function GlyphSvg({ glyph, color, cut, size = 24 }: { glyph: Glyph; color: string; cut: string; size?: number }) {
  const key = `${glyph}${color}${cut}`;
  let els = cache.get(key);
  if (!els) {
    const pen = new SvgPen();
    drawGlyph(pen as unknown as Graphics, glyph, 10, parseInt(color.slice(1), 16), parseInt(cut.slice(1), 16));
    els = pen.els;
    cache.set(key, els);
  }
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden>
      {els.map((e, i) => (
        <path key={i} d={e.d} fill={e.fill} fillOpacity={e.fillOpacity} stroke={e.stroke} strokeWidth={e.strokeWidth}
          strokeOpacity={e.strokeOpacity} strokeLinecap={e.cap as "round"} strokeLinejoin={e.join as "round"} fillRule="evenodd" />
      ))}
    </svg>
  );
}
