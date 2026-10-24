import { Texture, type Ticker } from "pixi.js";

// ─── Color ────────────────────────────────────────────────────────────────

export const hex = (c: string) => parseInt(c.replace("#", ""), 16);

export function mix(a: string | number, b: string | number, t: number): number {
  const A = typeof a === "string" ? hex(a) : a;
  const B = typeof b === "string" ? hex(b) : b;
  const ch = (s: number) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// ─── Procedural textures (generated once, shared) ─────────────────────────

const cache = new Map<string, Texture>();

function canvasTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = Texture.from(c);
  cache.set(key, t);
  return t;
}

/** White radial falloff; tint it and use additive blending for glows and particles. */
export const glowTexture = () =>
  canvasTexture("glow", 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.55)");
    g.addColorStop(0.6, "rgba(255,255,255,0.12)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });

/** Hard-centered spark for crisp particles. */
export const sparkTexture = () =>
  canvasTexture("spark", 32, 32, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,0.8)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  });

/** Sphere shading for token orbs: light top-left, dark rim. Tint with the guardian color. */
export const orbTexture = () =>
  canvasTexture("orb", 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(46, 40, 4, 64, 64, 64);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, "#e6e6e6");
    g.addColorStop(0.8, "#8a8a8a");
    g.addColorStop(1, "#3a3a3a");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(64, 64, 62, 0, Math.PI * 2);
    ctx.fill();
  });

export const skyTexture = (top: string, mid: string, bottom: string) =>
  canvasTexture(`sky${top}${mid}${bottom}`, 4, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, top);
    g.addColorStop(0.55, mid);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
  });

// ─── Tweens on the Pixi ticker ────────────────────────────────────────────

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
};

export class Tweener {
  private items = new Set<{ t: number; d: number; fn: (k: number) => void; e: (t: number) => number; done: () => void }>();
  speed = 1;

  constructor(ticker: Ticker) {
    ticker.add((tk) => this.update(tk.deltaMS));
  }

  to(durationMs: number, fn: (k: number) => void, e: (t: number) => number = ease.outCubic): Promise<void> {
    return new Promise((done) => {
      if (durationMs <= 0) {
        fn(1);
        return done();
      }
      this.items.add({ t: 0, d: durationMs, fn, e, done });
    });
  }

  wait(ms: number) {
    return this.to(ms, () => {});
  }

  private update(dt: number) {
    for (const it of this.items) {
      it.t += dt * this.speed;
      const k = Math.min(1, it.t / it.d);
      it.fn(it.e(k));
      if (k >= 1) {
        this.items.delete(it);
        it.done();
      }
    }
  }
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
