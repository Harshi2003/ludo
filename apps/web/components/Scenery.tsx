"use client";
import type { CharacterDef, ThemePack } from "@ludo/engine";
import { useMemo } from "react";
import type { Scene } from "@/lib/visuals";
import { Emblem } from "./Emblem";

const CANDY = ["#ff4fa3", "#5ef0d0", "#ffd447", "#a78bfa", "#ff8a3d", "#7ee081"];

/** Deterministic pseudo-random list so server and client render the same scenery. */
function useSeeded<T>(n: number, f: (i: number, r: (k: number) => number) => T) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => Array.from({ length: n }, (_, i) => f(i, (k) => ((i * 9301 + k * 49297) % 233280) / 233280)), [n]);
}

// ─── Full-page backdrops ──────────────────────────────────────────────────

function Stars({ n, tint = "#ffffff", top = 100 }: { n: number; tint?: string; top?: number }) {
  const stars = useSeeded(n, (i) => ({ left: `${(i * 37.7) % 100}%`, top: `${((i * 61.3) % 100) * (top / 100)}%`, size: 1 + ((i * 7) % 3), delay: `${(i % 9) * 0.7}s` }));
  return (
    <>
      {stars.map((s, i) => (
        <span key={i} className="absolute rounded-full" style={{ left: s.left, top: s.top, width: s.size, height: s.size, background: tint, animation: `twinkle 3.5s ${s.delay} infinite` }} />
      ))}
    </>
  );
}

function CityBackdrop() {
  return (
    <>
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#081120 0%,#121a36 38%,#2a1f3f 62%,#5c2a35 82%,#8a3a2c 100%)" }} />
      <div className="absolute bottom-[8%] right-[12%] h-[38vmin] w-[38vmin] rounded-full opacity-60 blur-2xl" style={{ background: "radial-gradient(circle,#ff9a5a,#ff5a36 45%,transparent 70%)" }} />
      <Stars n={40} top={45} />
      {/* Skyline: Transamerica pyramid, Coit Tower and the downtown blocks. */}
      <svg className="absolute inset-x-0 bottom-0 h-[26vh] w-full opacity-70" viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden>
        <path fill="#0a0f1d" d="M0 200V150h40v-30h30v40h25v-70h35v60h20v-90l18-60 18 60v90h30v-50h40v-40h30v70h22v-110h30v120h40v-60h25v-30l12-20 12 20v30h25v80h35v-50h40v-40h30v90h28v-130h38v130h30v-70h30v-30h40v60h35v-90h25l10-30 10 30v90h30v-50h40v80h30v-60h50v-40h30v100h50v40z" />
        {Array.from({ length: 60 }, (_, i) => (
          <rect key={i} x={(i * 97) % 1180 + 10} y={130 + ((i * 53) % 60)} width="3" height="5" fill="#fde68a" opacity={0.25 + ((i * 7) % 5) / 10} />
        ))}
      </svg>
      {/* Fog banks rolling in off the bay. */}
      {[{ b: "4%", o: 0.22, d: "0s" }, { b: "16%", o: 0.14, d: "-12s" }, { b: "30%", o: 0.08, d: "-24s" }].map((f, i) => (
        <div key={i} className="animate-drift absolute -inset-x-1/4 h-[18vh] rounded-[50%] blur-3xl" style={{ bottom: f.b, background: "#cbd5e1", opacity: f.o, animationDelay: f.d }} />
      ))}
    </>
  );
}

function CandyBackdrop() {
  const sprinkles = useSeeded(46, (i, r) => ({
    left: `${r(1) * 100}%`, color: CANDY[i % CANDY.length], dur: `${14 + r(2) * 16}s`, delay: `${-r(3) * 30}s`, rot: r(4) * 180,
  }));
  return (
    <>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 75% 15%,#5a1d6b 0%,transparent 55%),radial-gradient(ellipse at 10% 85%,#0f4d4a 0%,transparent 50%),linear-gradient(180deg,#2c0f3a,#1c0a24 60%,#14061a)" }} />
      {[{ l: "62%", t: "4%", c: "#ff4fa3", s: 46 }, { l: "-8%", t: "50%", c: "#5ef0d0", s: 40 }, { l: "70%", t: "62%", c: "#ffd447", s: 34 }].map((b, i) => (
        <div key={i} className="absolute rounded-full blur-3xl" style={{ left: b.l, top: b.t, width: `${b.s}vmax`, height: `${b.s * 0.7}vmax`, background: b.c, opacity: 0.13 }} />
      ))}
      {sprinkles.map((s, i) => (
        <span key={i} className="absolute top-0 h-[10px] w-[3.5px] rounded-full" style={{ left: s.left, background: s.color, opacity: 0.75, animation: `fall ${s.dur} ${s.delay} linear infinite`, rotate: `${s.rot}deg` }} />
      ))}
    </>
  );
}

function FantasyBackdrop({ pack }: { pack: ThemePack }) {
  const { primary, accent, bg } = pack.art.palette;
  return (
    <>
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 70% 20%, color-mix(in srgb, ${primary} 45%, ${bg}) 0%, transparent 55%), radial-gradient(ellipse at 15% 80%, color-mix(in srgb, ${accent} 30%, ${bg}) 0%, transparent 50%), linear-gradient(180deg, color-mix(in srgb, ${primary} 12%, ${bg}), ${bg} 60%, #05030f)` }} />
      <Stars n={90} />
    </>
  );
}

export function Backdrop({ pack, scene }: { pack: ThemePack; scene: Scene }) {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {scene === "city" ? <CityBackdrop /> : scene === "candy" ? <CandyBackdrop /> : <FantasyBackdrop pack={pack} />}
    </div>
  );
}

// ─── Hero art ─────────────────────────────────────────────────────────────

function CrystalCastle() {
  return (
    <svg viewBox="0 0 200 200" className="animate-float-slow absolute inset-[24%]" aria-hidden>
      <defs>
        <linearGradient id="spire" x1="0" x2="1">
          <stop offset="0" stopColor="#fdf4ff" /><stop offset=".5" stopColor="#f0abfc" /><stop offset=".5" stopColor="#a855f7" /><stop offset="1" stopColor="#6b21a8" />
        </linearGradient>
      </defs>
      {[[-58, 70, 14], [-34, 110, 16], [-12, 90, 13], [0, 150, 20], [16, 100, 14], [38, 120, 16], [60, 76, 13]].map(([dx, h, w], i) => (
        <polygon key={i} fill="url(#spire)" points={`${100 + dx - w},170 ${100 + dx - w},${170 - h * 0.78} ${100 + dx},${170 - h} ${100 + dx + w},${170 - h * 0.78} ${100 + dx + w},170`} opacity=".95" />
      ))}
      <ellipse cx="100" cy="172" rx="86" ry="12" fill="#3b0764" />
      <path d="M86 18 L86 6 L93 12 L100 2 L107 12 L114 6 L114 18 Z" fill="#fcd34d" />
    </svg>
  );
}

/** Golden Gate at dusk, with a string of Chinatown lanterns overhead. */
function GoldenGate() {
  const cable = (x: number) => {
    // Main cable: low at the ends, up to the towers (x=110, 290), sagging between.
    if (x <= 110) return 205 - (x / 110) * 120 + Math.sin((x / 110) * Math.PI) * 18;
    if (x <= 290) { const u = (x - 110) / 180; return 85 + 4 * 150 * u * (1 - u) * 0.62; }
    return 85 + ((x - 290) / 110) * 120 - Math.sin(((x - 290) / 110) * Math.PI) * 18;
  };
  const pts = Array.from({ length: 81 }, (_, i) => i * 5);
  return (
    <svg viewBox="0 0 400 320" className="absolute inset-x-0 top-[14%] w-full" aria-hidden>
      <defs>
        <radialGradient id="sun"><stop offset="0" stopColor="#ffd08a" /><stop offset=".5" stopColor="#ff7a45" /><stop offset="1" stopColor="#ff5a36" stopOpacity="0" /></radialGradient>
        <linearGradient id="bay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d2a4a" /><stop offset="1" stopColor="#0a1220" /></linearGradient>
      </defs>
      <circle cx="300" cy="215" r="95" fill="url(#sun)" opacity=".85" />
      <rect y="232" width="400" height="88" fill="url(#bay)" />
      {Array.from({ length: 14 }, (_, i) => <rect key={i} x={250 + ((i * 37) % 100) - 30} y={240 + i * 5} width={30 - i * 1.6} height="1.6" rx="1" fill="#ff8a5a" opacity={0.6 - i * 0.035} />)}
      <path d="M0 210 Q40 196 70 214 L70 232 L0 232Z" fill="#132036" />
      <path d="M330 222 Q370 200 400 206 L400 232 L330 232Z" fill="#132036" />
      {pts.map((x) => x % 10 === 0 && x > 2 && x < 398 && <line key={x} x1={x} y1={cable(x)} x2={x} y2="214" stroke="#e8492a" strokeWidth=".8" opacity=".6" />)}
      <polyline points={pts.map((x) => `${x},${cable(x)}`).join(" ")} fill="none" stroke="#e8492a" strokeWidth="2.6" />
      <rect x="0" y="212" width="400" height="7" fill="#c93c22" />
      {[110, 290].map((x) => (
        <g key={x} fill="#e8492a">
          <rect x={x - 11} y="70" width="6" height="162" />
          <rect x={x + 5} y="70" width="6" height="162" />
          {[78, 112, 146, 180].map((y) => <rect key={y} x={x - 11} y={y} width="22" height="5" fill="#b8361e" />)}
          <rect x={x - 13} y="64" width="10" height="8" /><rect x={x + 3} y="64" width="10" height="8" />
        </g>
      ))}
      {[{ y: 222, o: 0.5, w: 260, x: 20 }, { y: 238, o: 0.35, w: 300, x: 140 }].map((f, i) => (
        <ellipse key={i} className="animate-drift" cx={f.x + f.w / 2} cy={f.y} rx={f.w / 2} ry="16" fill="#dbe4ef" opacity={f.o} style={{ animationDelay: `${-i * 9}s`, filter: "blur(6px)" }} />
      ))}
      <path d="M-10 18 Q200 78 410 18" fill="none" stroke="#2a1520" strokeWidth="1.4" />
      {[0.12, 0.26, 0.4, 0.54, 0.68, 0.82].map((u, i) => {
        const x = -10 + 420 * u;
        const y = (1 - u) ** 2 * 18 + 2 * (1 - u) * u * 78 + u * u * 18;
        return (
          <g key={i} className="animate-sway" style={{ animationDelay: `${-i * 0.6}s`, transformOrigin: `${x}px ${y}px` }}>
            <line x1={x} y1={y} x2={x} y2={y + 6} stroke="#2a1520" />
            <rect x={x - 6} y={y + 5} width="12" height="3" fill="#fbbf24" />
            <ellipse cx={x} cy={y + 16} rx="9" ry="11" fill="#e11d48" />
            <ellipse cx={x} cy={y + 16} rx="9" ry="11" fill="#ff6b6b" opacity=".35" style={{ filter: "blur(4px)" }} />
            <rect x={x - 6} y={y + 25} width="12" height="3" fill="#fbbf24" />
            <line x1={x} y1={y + 28} x2={x} y2={y + 36} stroke="#fbbf24" />
          </g>
        );
      })}
    </svg>
  );
}

/** The Sugar Palace on frosting hills, flanked by lollipops and candy canes. */
function SugarPalace() {
  const towers = [{ x: 140, h: 90, w: 18, c: CANDY[1] }, { x: 170, h: 135, w: 22, c: CANDY[3] }, { x: 200, h: 175, w: 28, c: CANDY[0] }, { x: 230, h: 135, w: 22, c: CANDY[2] }, { x: 260, h: 90, w: 18, c: CANDY[5] }];
  return (
    <svg viewBox="0 0 400 320" className="animate-float-slow absolute inset-x-0 top-[12%] w-full" aria-hidden>
      <ellipse cx="200" cy="262" rx="190" ry="40" fill="#ff7ac2" opacity=".55" />
      <ellipse cx="90" cy="268" rx="110" ry="30" fill="#5ef0d0" opacity=".45" />
      <ellipse cx="320" cy="270" rx="100" ry="28" fill="#ffd447" opacity=".45" />
      {towers.map((t, i) => (
        <g key={i}>
          <rect x={t.x - t.w} y={250 - t.h} width={t.w * 2} height={t.h} fill="#ffd1ea" />
          <rect x={t.x - t.w} y={250 - t.h} width={t.w * 2} height="9" fill="#fff" />
          {[0, 1, 2].map((k) => <circle key={k} cx={t.x - t.w + 5 + k * (t.w - 5)} cy={259 - t.h} r="4" fill="#fff" />)}
          <ellipse cx={t.x} cy={250 - t.h} rx={t.w + 4} ry={t.w * 0.95} fill={t.c} />
          <ellipse cx={t.x - t.w * 0.35} cy={250 - t.h - t.w * 0.4} rx={t.w * 0.25} ry={t.w * 0.15} fill="#fff" opacity=".5" />
          {Array.from({ length: Math.floor(t.h / 40) }, (_, k) => <rect key={k} x={t.x - 4} y={250 - t.h + 26 + k * 34} width="8" height="13" rx="4" fill="#fff1b8" />)}
        </g>
      ))}
      <path d="M186 250 v-26 a14 14 0 0 1 28 0 v26z" fill="#7a2a55" />
      <path d="M188 46 L188 36 L194 41 L200 32 L206 41 L212 36 L212 46Z" fill="#ffd447" transform="translate(0 -6)" />
      {[{ x: 70, c: CANDY[0] }, { x: 330, c: CANDY[2] }].map((l, i) => (
        <g key={i}>
          <rect x={l.x - 2.5} y="150" width="5" height="105" fill="#fff" />
          <circle cx={l.x} cy="146" r="26" fill={l.c} />
          {[1, 2, 3].map((k) => <circle key={k} cx={l.x} cy="146" r={26 * (k / 3.6)} fill="none" stroke="#fff" strokeWidth="3" strokeDasharray={`${26 * k * 0.9} 100`} opacity=".8" />)}
        </g>
      ))}
      {[105, 295].map((x, i) => (
        <path key={i} d={i ? `M${x} 258 V190 a12 12 0 0 0 -24 0` : `M${x} 258 V190 a12 12 0 0 1 24 0`} fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
      ))}
      {[105, 295].map((x, i) => (
        <path key={`s${i}`} d={i ? `M${x} 258 V190 a12 12 0 0 0 -24 0` : `M${x} 258 V190 a12 12 0 0 1 24 0`} fill="none" stroke="#ef4469" strokeWidth="9" strokeDasharray="8 8" />
      ))}
    </svg>
  );
}

/** Champions around the world's landmark: orbiting in fantasy, floating in place elsewhere. */
export function HeroArt({ pack, scene, chars }: { pack: ThemePack; scene: Scene; chars: CharacterDef[] }) {
  const spin = scene === "fantasy";
  const glow = pack.art.palette.primary;
  return (
    <div className="relative mx-auto aspect-square w-[min(84vw,440px)]">
      <div className="absolute inset-[16%] rounded-full" style={{ background: `radial-gradient(circle, color-mix(in srgb, ${glow} 45%, transparent), color-mix(in srgb, ${glow} 12%, transparent) 45%, transparent 70%)` }} />
      {scene === "city" ? <GoldenGate /> : scene === "candy" ? <SugarPalace /> : <CrystalCastle />}
      <div className={spin ? "animate-spin-slow absolute inset-0" : "absolute inset-0"}>
        {chars.map((c, i) => {
          // Fantasy: evenly around a circle. Elsewhere: the four corners, clear of the landmark.
          const a = spin ? (i / chars.length) * Math.PI * 2 - Math.PI / 2 : [-2.4, -0.75, 0.75, 2.4][i % 4];
          const r = spin ? 44 : 46;
          return (
            <div key={c.id} className="absolute" style={{ left: `${50 + Math.cos(a) * r}%`, top: `${(spin ? 50 : 54) + Math.sin(a) * r * (spin ? 1 : 0.92)}%`, transform: "translate(-50%,-50%)" }}>
              <div className={spin ? undefined : "animate-float-slow"} style={spin ? { animation: "spin-slow 24s linear infinite reverse" } : { animationDelay: `${-i * 1.5}s` }}>
                <Emblem c={c} size={72} glow portrait={pack.art.portraits?.[c.id]} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
