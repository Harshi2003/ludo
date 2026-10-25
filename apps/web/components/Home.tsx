"use client";
import type { CharacterDef, ThemePack, TileTypeDef } from "@ludo/engine";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "@/lib/sfx";
import { loadTuning } from "@/lib/tuning";
import { deleteWorld, exportWorld, importWorld, splitTitle, isPartyWorld, type WorldEntry } from "@/lib/worlds";
import { GlyphSvg } from "@/lib/glyphSvg";
import { tileColor, tileGlyph } from "@/lib/visuals";
import { Emblem } from "./Emblem";
import { LocalSetup, type LocalSession } from "./lobby/LocalSetup";
import { primaryButton, lobbyButton } from "./lobby/Lobby";
import { lobbyUrl } from "@/lib/lobby/invites";



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
    <section className="mt-6" aria-label="Worlds">
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
  onStart: (session: LocalSession) => void;
  onSelectWorld: (id: string) => void;
  onWorldsChanged: () => void;
}) {
  const chars = pack.characters;
  const party = isPartyWorld(pack);
  const [title, subtitle] = splitTitle(pack.world.name);
  const [tuned, setTuned] = useState(false);
  useEffect(() => setTuned(!party && !!loadTuning(pack)), [pack, party]);
  const groups: [string, TileTypeDef[]][] = [
    ["Landmarks", pack.tiles.filter(t => t.category === "structural" && t.base !== "normal")],
    ["Blessings", pack.tiles.filter(t => t.category === "helpful")],
    ["Hazards", pack.tiles.filter(t => t.category === "harmful")],
    ["Gambles", pack.tiles.filter(t => t.category === "neutral")],
  ];
  return <div className="relative min-h-full">
    <Stars />
    <main className="relative mx-auto max-w-6xl px-4 pb-24 pt-[max(env(safe-area-inset-top),24px)] sm:px-8">
      <nav className="flex flex-wrap items-center justify-between gap-3 py-2">
        <div className="font-display text-sm font-bold tracking-[.35em] text-muted">AI · LUDO</div>
        <div className="flex items-center gap-2">
          {tuned && <span className="rounded-full bg-gold/15 px-3 py-1 text-xs text-gold">Custom tuning on</span>}
          {!party && <Link href="/lab" className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted hover:text-ink">Balance Lab</Link>}
          <Link href="/create" className="rounded-full bg-primary/90 px-3 py-1 text-xs font-semibold text-white shadow-[0_0_20px_-4px_#8b5cf6]">✦ Forge a world</Link>
        </div>
      </nav>
      <WorldShelf worlds={worlds} selected={pack.id} onSelect={onSelectWorld} onChanged={onWorldsChanged} />
      <section className="glass mt-6 grid items-center gap-6 overflow-hidden rounded-3xl p-5 sm:p-8 lg:grid-cols-[1.2fr_1fr]" aria-label="Play selected world">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.25em] text-accent">Play with friends · 2–4 players</p>
          <h1 className="font-display mt-3 text-4xl font-black leading-tight sm:text-6xl"><span className="title-gradient">{title}</span></h1>
          {subtitle && <p className="font-display mt-2 text-lg font-bold text-white/90">{subtitle}</p>}
          <p className="mt-3 text-sm leading-relaxed text-muted">{pack.world.story}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link href={lobbyUrl(pack.id, "host")} className={`${primaryButton} text-center`}>Create room</Link>
            <Link href={lobbyUrl(pack.id, "join")} className={`${lobbyButton} grid place-items-center text-center`}>Join friends</Link>
          </div>
          <p className="mt-3 text-xs text-muted">Share one invite link. Everyone joins, readies up, and plays on their own device.</p>
        </div>
        <div className="hidden lg:block" aria-hidden="true">{party
          ? <img src="/party-ludo/party-lounge-v1.png" alt="" className="aspect-square w-full rounded-2xl object-cover" />
          : <Orbit chars={chars} pack={pack} />}</div>
      </section>
      <details className="glass mt-4 rounded-3xl p-5 sm:p-6">
        <summary className="cursor-pointer font-display text-lg font-bold">Play on one device</summary>
        <LocalSetup key={pack.id} pack={pack} onStart={onStart} />
      </details>
      {party ? <section className="mt-10"><h2 className="font-display text-2xl font-bold">Party stops</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{pack.tiles.map(t => <TileChip key={t.id} t={t} />)}</div></section> : <>
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
      </>}
    </main>
  </div>;
}
