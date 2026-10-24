"use client";
import type { CharacterDef, ThemePack, TileTypeDef } from "@ludo/engine";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "@/lib/sfx";
import { loadTuning } from "@/lib/tuning";
import { deleteWorld, exportWorld, importWorld, splitTitle, type WorldEntry } from "@/lib/worlds";
import { GlyphSvg } from "@/lib/glyphSvg";
import { tileColor, tileGlyph } from "@/lib/visuals";
import { Emblem } from "./Emblem";
import type { GameConfig } from "./game/Game";

type Seat = { character: string; bot: boolean };

function Stars() {
  const stars = useMemo(
    () => Array.from({ length: 90 }, (_, i) => ({
      left: `${(i * 37.7) % 100}%`, top: `${(i * 61.3) % 100}%`, size: 1 + ((i * 7) % 3), delay: `${(i % 9) * 0.7}s`,
    })),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 70% 20%, #3b1d7a 0%, transparent 55%), radial-gradient(ellipse at 15% 80%, #0e4a6b 0%, transparent 50%), linear-gradient(180deg,#140b33,#0b0820 60%,#05030f)" }} />
      {stars.map((s, i) => (
        <span key={i} className="absolute rounded-full bg-white" style={{ left: s.left, top: s.top, width: s.size, height: s.size, animation: `twinkle 3.5s ${s.delay} infinite` }} />
      ))}
    </div>
  );
}

function Orbit({ chars, pack }: { chars: CharacterDef[]; pack: ThemePack }) {
  return (
    <div className="relative mx-auto aspect-square w-[min(78vw,420px)]">
      <div className="absolute inset-[18%] rounded-full" style={{ background: "radial-gradient(circle, rgba(240,171,252,.45), rgba(139,92,246,.15) 45%, transparent 70%)" }} />
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
      <div className="animate-spin-slow absolute inset-0">
        {chars.map((c, i) => {
          const a = (i / chars.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <div key={c.id} className="absolute" style={{ left: `${50 + Math.cos(a) * 44}%`, top: `${50 + Math.sin(a) * 44}%`, transform: "translate(-50%,-50%)" }}>
              <div style={{ animation: "spin-slow 24s linear infinite reverse" }}><Emblem c={c} size={74} glow portrait={pack.art.portraits?.[c.id]} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorldShelf({ worlds, selected, onSelect, onChanged }: {
  worlds: WorldEntry[]; selected: string; onSelect: (id: string) => void; onChanged: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="mt-10" aria-label="Worlds">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Worlds</h2>
        <button onClick={() => file.current?.click()} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted hover:text-ink">Import</button>
        <input ref={file} type="file" accept=".json,application/json" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const p = await importWorld(f);
            setError(null);
            onChanged();
            onSelect(p.id);
          } catch (err) {
            setError((err as Error).message);
          }
        }} />
      </div>
      {error && <p className="mb-2 text-xs text-rose-300">{error}</p>}
      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {worlds.map((w) => {
          const on = w.pack.id === selected;
          const [t, sub] = splitTitle(w.pack.world.name);
          return (
            <div key={w.pack.id} className={`glass relative w-[250px] shrink-0 snap-start rounded-2xl p-4 transition ${on ? "" : "opacity-75 hover:opacity-100"}`}
              style={on ? { borderColor: w.pack.art.palette.primary, boxShadow: `0 0 0 1px ${w.pack.art.palette.primary}, 0 0 30px -8px ${w.pack.art.palette.primary}` } : undefined}>
              <button onClick={() => { sfx.click(); onSelect(w.pack.id); }} className="block w-full text-left" aria-pressed={on}>
                <div className="flex -space-x-2">{w.pack.characters.map((c) => <Emblem key={c.id} c={c} size={34} portrait={w.pack.art.portraits?.[c.id]} />)}</div>
                <div className="font-display mt-3 truncate text-lg font-bold">{t}</div>
                <div className="truncate text-xs text-muted">{sub ?? w.pack.world.tagline}</div>
                <div className="mt-2 text-[10px] uppercase tracking-[.2em] text-muted">{w.builtIn ? "Original" : "AI-forged"}{on ? " · selected" : ""}</div>
              </button>
              {!w.builtIn && (
                <div className="mt-2 flex gap-3 text-[11px]">
                  <button onClick={() => exportWorld(w.pack)} className="text-muted hover:text-ink">Export</button>
                  <button onClick={() => { if (confirm(`Delete "${t}"? This can't be undone.`)) { deleteWorld(w.pack.id); onChanged(); } }} className="text-muted hover:text-rose-300">Delete</button>
                </div>
              )}
            </div>
          );
        })}
        <Link href="/create" className="glass grid w-[200px] shrink-0 snap-start place-items-center rounded-2xl border-dashed p-4 text-center transition hover:bg-white/5">
          <div>
            <div className="text-3xl text-accent">✦</div>
            <div className="font-display mt-1 font-bold">Forge a new world</div>
            <div className="mt-1 text-xs text-muted">Describe any theme and AI builds it</div>
          </div>
        </Link>
      </div>
    </section>
  );
}

function TileChip({ t }: { t: TileTypeDef }) {
  const color = tileColor(t);
  return (
    <div className="flex items-start gap-3 rounded-xl bg-white/[.04] p-3">
      <div className="relative grid h-[34px] w-[34px] shrink-0 place-items-center">
      <svg width="34" height="34" viewBox="-20 -20 40 40" className="absolute inset-0" aria-hidden>
        <polygon points="0,-18 15.6,-9 15.6,9 0,18 -15.6,9 -15.6,-9" fill={`${color}33`} stroke={color} strokeWidth="2" />
      </svg>
      <GlyphSvg glyph={tileGlyph(t)} color={color} cut="#1a1440" size={18} />
      </div>
      <div>
        <div className="text-sm font-semibold" style={{ color }}>{t.name}</div>
        <div className="text-xs leading-relaxed text-muted">{t.description}</div>
      </div>
    </div>
  );
}

export function Home({ pack, worlds, onStart, onSelectWorld, onWorldsChanged }: {
  pack: ThemePack;
  worlds: WorldEntry[];
  onStart: (c: GameConfig) => void;
  onSelectWorld: (id: string) => void;
  onWorldsChanged: () => void;
}) {
  const chars = pack.characters;
  const [title, subtitle] = splitTitle(pack.world.name);
  const [count, setCount] = useState(4);
  const [seats, setSeats] = useState<Seat[]>(chars.map((c, i) => ({ character: c.id, bot: i > 0 })));
  const [tuned, setTuned] = useState(false);
  useEffect(() => setTuned(!!loadTuning(pack)), [pack]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ludo:lobby") ?? "null");
      const ids = new Set(chars.map((c) => c.id));
      if (saved?.seats?.length === 4 && saved.seats.every((x: Seat) => ids.has(x.character))) {
        setSeats(saved.seats);
        setCount(saved.count);
      } else {
        setSeats(chars.map((c, i) => ({ character: c.id, bot: i > 0 })));
      }
    } catch {}
  }, [chars]);

  const active = seats.slice(0, count);
  const cycle = (i: number) => {
    sfx.click();
    setSeats((s) => {
      const used = new Set(s.slice(0, count).map((x, j) => (j === i ? "" : x.character)));
      const ids = chars.map((c) => c.id);
      let k = ids.indexOf(s[i].character);
      do k = (k + 1) % ids.length; while (used.has(ids[k]));
      const next = s.slice();
      // Keep guardians unique: swap with whoever held it outside the active seats.
      const holder = next.findIndex((x, j) => j !== i && x.character === ids[k]);
      if (holder >= 0) next[holder] = { ...next[holder], character: next[i].character };
      next[i] = { ...next[i], character: ids[k] };
      return next;
    });
  };
  const start = () => {
    sfx.click();
    try { localStorage.setItem("ludo:lobby", JSON.stringify({ seats, count })); } catch {}
    onStart({ seed: (Math.random() * 2 ** 31) | 0, players: active });
  };

  const groups: [string, TileTypeDef[]][] = [
    ["Landmarks", pack.tiles.filter((t) => t.category === "structural" && t.base !== "normal")],
    ["Blessings", pack.tiles.filter((t) => t.category === "helpful")],
    ["Hazards", pack.tiles.filter((t) => t.category === "harmful")],
    ["Gambles", pack.tiles.filter((t) => t.category === "neutral")],
  ];

  return (
    <div className="relative min-h-full">
      <Stars />
      <main className="relative mx-auto max-w-6xl px-4 pb-24 pt-[max(env(safe-area-inset-top),24px)] sm:px-8">
        <nav className="flex items-center justify-between py-2">
          <div className="font-display text-sm font-bold tracking-[.35em] text-muted">AI · LUDO</div>
          <div className="flex items-center gap-2">
            {tuned && <span className="rounded-full bg-gold/15 px-3 py-1 text-xs text-gold">Custom tuning on</span>}
            <Link href="/lab" className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted transition hover:border-white/30 hover:text-ink">Balance Lab</Link>
            <Link href="/create" className="rounded-full bg-primary/90 px-3 py-1 text-xs font-semibold text-white shadow-[0_0_20px_-4px_#8b5cf6] transition hover:bg-primary">✦ Forge a world</Link>
          </div>
        </nav>

        <section className="grid items-center gap-8 pt-6 lg:grid-cols-[1.1fr_1fr] lg:pt-10">
          <div>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-xs font-semibold uppercase tracking-[.4em] text-accent">
              {pack.world.tagline}
            </motion.p>
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="font-display mt-3 text-5xl font-black leading-[.95] sm:text-7xl">
              <span className="title-gradient">{title}</span>
              {subtitle && <span className="mt-2 block text-2xl font-bold text-white/90 sm:text-3xl">{subtitle}</span>}
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="mt-5 max-w-xl leading-relaxed text-white/75">
              {pack.world.story}
            </motion.p>
          </div>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.8 }}>
            <Orbit chars={chars} pack={pack} />
          </motion.div>
        </section>

        <WorldShelf worlds={worlds} selected={pack.id} onSelect={onSelectWorld} onChanged={onWorldsChanged} />

        {/* Lobby */}
        <motion.section initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="glass mt-6 rounded-3xl p-4 sm:p-6" id="play">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold">Choose your champions</h2>
            <div className="flex rounded-xl bg-black/30 p-1" role="radiogroup" aria-label="Number of players">
              {[2, 3, 4].map((n) => (
                <button key={n} role="radio" aria-checked={count === n} onClick={() => { sfx.click(); setCount(n); }}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${count === n ? "bg-primary text-white shadow" : "text-muted hover:text-white"}`}>
                  {n} players
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {active.map((s, i) => {
              const c = chars.find((x) => x.id === s.character)!;
              return (
                <motion.div key={i} layout className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-3 text-center"
                  style={{ boxShadow: `inset 0 -60px 80px -50px ${c.color}` }}>
                  <div className="text-[10px] font-semibold uppercase tracking-[.25em] text-muted">Seat {i + 1}</div>
                  <button onClick={() => cycle(i)} className="mx-auto mt-2 block" aria-label={`Change champion for seat ${i + 1}`}>
                    <motion.div key={c.id} initial={{ rotateY: 90 }} animate={{ rotateY: 0 }}><Emblem c={c} size={72} glow portrait={pack.art.portraits?.[c.id]} /></motion.div>
                  </button>
                  <div className="font-display mt-2 text-lg font-bold" style={{ color: c.color }}>{c.name}</div>
                  <div className="text-[11px] text-muted">{c.title} · {c.role}</div>
                  <button onClick={() => { sfx.click(); setSeats((x) => x.map((y, j) => (j === i ? { ...y, bot: !y.bot } : y))); }}
                    className={`mt-3 w-full rounded-lg py-1.5 text-xs font-semibold transition ${s.bot ? "bg-white/10 text-muted" : "bg-white text-[#1a0b2e]"}`}>
                    {s.bot ? "🤖 Bot" : "🧙 Human"}
                  </button>
                </motion.div>
              );
            })}
          </div>
          <p className="mt-3 text-center text-xs text-muted">Tap an emblem to change champion. Several humans can share this device.</p>
          <motion.button onClick={start} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            className="font-display mt-4 w-full rounded-2xl py-4 text-lg font-black tracking-[.15em] text-[#1a0b2e] shadow-[0_10px_40px_-10px_#f59e0b]"
            style={{ background: "linear-gradient(180deg,#fff1b8,#fcd34d 40%,#f59e0b)" }}>
            BEGIN THE BATTLE
          </motion.button>
          <Link href="/online" className="glass mt-3 block w-full rounded-2xl py-3 text-center font-semibold transition hover:bg-white/5">
            🌐 Play online with friends
          </Link>
        </motion.section>

        {/* Guardians */}
        <section className="mt-14">
          <h2 className="font-display text-2xl font-bold">The Champions</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {chars.map((c) => (
              <div key={c.id} className="glass rounded-2xl p-5" style={{ boxShadow: `inset 0 1px 0 ${c.color}55` }}>
                <div className="flex items-center gap-4">
                  <Emblem c={c} size={64} glow portrait={pack.art.portraits?.[c.id]} />
                  <div>
                    <div className="font-display text-xl font-bold" style={{ color: c.color }}>{c.name}</div>
                    <div className="text-xs uppercase tracking-[.2em] text-muted">{c.title} · {c.role}</div>
                  </div>
                </div>
                <p className="mt-3 text-sm italic text-white/70">{c.bio}</p>
                <dl className="mt-3 space-y-2 text-sm">
                  {[["Passive", c.passive.name, c.passive.description], ["Ability", c.active.name, c.active.description], ["Ultimate", c.ultimate.name, c.ultimate.description]].map(([k, n, d]) => (
                    <div key={k} className="rounded-lg bg-white/[.04] px-3 py-2">
                      <dt className="text-[10px] font-semibold uppercase tracking-[.2em]" style={{ color: k === "Ultimate" ? "#fcd34d" : c.color }}>{k} · <span className="font-display normal-case tracking-normal text-white">{n}</span></dt>
                      <dd className="mt-0.5 text-white/70">{d}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>

        {/* Tiles */}
        <section className="mt-14">
          <h2 className="font-display text-2xl font-bold">The Tiles of {title}</h2>
          <p className="mt-1 text-sm text-muted">Green helps, red hurts, gold is a gamble. Powers repeat across the board — you never know quite what waits ahead.</p>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            {groups.map(([name, list]) => (
              <div key={name}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[.25em] text-muted">{name}</div>
                <div className="grid gap-2">{list.map((t) => <TileChip key={t.id} t={t} />)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14 grid gap-4 text-sm text-white/75 md:grid-cols-3">
          {[
            ["Race", `Roll and move tile by tile from the ${pack.world.startName} to the ${pack.world.finish}. Choose your route at every fork.`],
            ["Hunt", "Move forward or backward each roll. Land on a rival to send them back to their last checkpoint. Sanctuaries are safe."],
            ["Unleash", "Cast your ability before rolling. Your ultimate charges each turn — faster when you capture, fastest when you're captured."],
          ].map(([t, d]) => (
            <div key={t} className="glass rounded-2xl p-5">
              <div className="font-display text-lg font-bold text-gold">{t}</div>
              <p className="mt-1">{d}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
