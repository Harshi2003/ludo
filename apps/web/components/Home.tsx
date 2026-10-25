"use client";
import { members, type CharacterDef, type ThemePack, type TileTypeDef } from "@ludo/engine";
import { memberAsCharacter, portraitOf } from "@/lib/squad";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ruleCards, ruleTags } from "@/lib/rulesText";
import { useWorldTheme, worldTheme } from "@/lib/theme";
import { sfx } from "@/lib/sfx";
import { loadTuning } from "@/lib/tuning";
import { deleteWorld, exportWorld, importWorld, splitTitle, isPartyWorld, type WorldEntry } from "@/lib/worlds";
import { GlyphSvg } from "@/lib/glyphSvg";
import { tileColor, tileGlyph } from "@/lib/visuals";
import { Emblem } from "./Emblem";
import { Backdrop, HeroArt } from "./Scenery";
import { LocalSetup, type LocalSession } from "./lobby/LocalSetup";
import { primaryButton, lobbyButton } from "./lobby/Lobby";
import { lobbyUrl } from "@/lib/lobby/invites";


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
                <div className="mt-2 flex flex-wrap gap-1">
                  {ruleTags(w.pack).map((t) => <span key={t} className="rounded-full bg-white/[.07] px-2 py-0.5 text-[10px] text-white/70">{t}</span>)}
                </div>
                {!w.builtIn && <div className="mt-2 text-[10px] uppercase tracking-[.2em] text-muted">Forged by AI</div>}
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

function PowerRow({ kind, name, text, color }: { kind: string; name: string; text: string; color: string }) {
  return (
    <div className="rounded-lg bg-white/[.04] px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[.2em]" style={{ color: kind === "Ultimate" || kind === "Crown power" ? "var(--gold)" : color }}>{kind} · <span className="font-display normal-case tracking-normal text-white">{name}</span></dt>
      <dd className="mt-0.5 text-white/70">{text}</dd>
    </div>
  );
}

/** A squad: its shared passive and crown power, then each legend with its own power. */
function HouseCard({ pack, c }: { pack: ThemePack; c: CharacterDef }) {
  return (
    <div className="glass rounded-2xl p-5" style={{ boxShadow: `inset 0 1px 0 ${c.color}55` }}>
      <div className="flex items-center gap-3">
        <div className="flex -space-x-3">
          {members(c).map((_, i) => {
            const m = memberAsCharacter(c, i);
            return <Emblem key={m.id} c={m} size={i ? 44 : 56} glow={!i} portrait={portraitOf(pack, m)} />;
          })}
        </div>
        <div className="min-w-0">
          <div className="font-display truncate text-xl font-bold" style={{ color: c.color }}>{c.house ?? c.name}</div>
          <div className="text-xs uppercase tracking-[.2em] text-muted">{c.element} · {c.role}</div>
        </div>
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        <PowerRow kind="House passive" name={c.passive.name} text={c.passive.description} color={c.color} />
        <PowerRow kind="Crown power" name={c.ultimate.name} text={c.ultimate.description} color={c.color} />
      </dl>
      <div className="mt-3 space-y-2">
        {members(c).map((_, i) => {
          const m = memberAsCharacter(c, i);
          return (
            <div key={m.id} className="flex gap-3 rounded-xl bg-white/[.03] p-3">
              <Emblem c={m} size={40} portrait={portraitOf(pack, m)} />
              <div className="min-w-0 text-sm">
                <div><span className="font-display font-bold" style={{ color: c.color }}>{m.name}</span> <span className="text-xs text-muted">{m.title}</span></div>
                <p className="mt-0.5 text-xs italic text-white/60">{m.bio}</p>
                <p className="mt-1 text-white/80"><span className="font-semibold text-white">{m.active.name}.</span> {m.active.description} <span className="text-xs text-muted">Cooldown {m.active.cooldown ?? 3}.</span></p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TileChip({ t, cut }: { t: TileTypeDef; cut: string }) {
  const color = tileColor(t);
  return (
    <div className="flex items-start gap-3 rounded-xl bg-white/[.04] p-3">
      <div className="relative grid h-[34px] w-[34px] shrink-0 place-items-center">
      <svg width="34" height="34" viewBox="-20 -20 40 40" className="absolute inset-0" aria-hidden>
        <polygon points="0,-18 15.6,-9 15.6,9 0,18 -15.6,9 -15.6,-9" fill={`${color}33`} stroke={color} strokeWidth="2" />
      </svg>
      <GlyphSvg glyph={tileGlyph(t)} color={color} cut={cut} size={18} />
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
  useWorldTheme(pack);
  const theme = worldTheme(pack);
  const [tuned, setTuned] = useState(false);
  useEffect(() => setTuned(!party && !!loadTuning(pack)), [pack, party]);
  const groups: [string, TileTypeDef[]][] = [
    ["Landmarks", pack.tiles.filter(t => t.category === "structural" && t.base !== "normal")],
    ["Blessings", pack.tiles.filter(t => t.category === "helpful")],
    ["Hazards", pack.tiles.filter(t => t.category === "harmful")],
    ["Gambles", pack.tiles.filter(t => t.category === "neutral")],
  ];

  return (
    <div className="relative min-h-full">
      <Backdrop pack={pack} scene={theme.scene} />
      <main className="relative mx-auto max-w-6xl px-4 pb-24 pt-[max(env(safe-area-inset-top),24px)] sm:px-8">
        <nav className="flex flex-wrap items-center justify-between gap-3 py-2">
          <div className="font-display text-sm font-bold tracking-[.35em] text-muted">DICEBOUND</div>
          <div className="flex items-center gap-2">
            {tuned && <span className="rounded-full bg-gold/15 px-3 py-1 text-xs text-gold">Custom tuning on</span>}
            {!party && <Link href="/lab" className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted transition hover:border-white/30 hover:text-ink">Balance Lab</Link>}
            <Link href="/create" className="rounded-full bg-primary/90 px-3 py-1 text-xs font-semibold text-white shadow-[0_0_20px_-4px_var(--primary)] transition hover:bg-primary">✦ Forge a world</Link>
          </div>
        </nav>

        <WorldShelf worlds={worlds} selected={pack.id} onSelect={onSelectWorld} onChanged={onWorldsChanged} />

        {/* The selected world: story, art and the way in. */}
        <motion.section key={pack.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="glass mt-6 grid items-center gap-6 overflow-hidden rounded-3xl p-5 sm:p-8 lg:grid-cols-[1.15fr_1fr]" aria-label="Play selected world" id="play">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.3em] text-accent">{pack.world.tagline}</p>
            <h1 className="font-display mt-3 text-4xl font-black leading-[.95] sm:text-6xl">
              <span className="title-gradient">{title}</span>
              {subtitle && <span className="mt-2 block text-xl font-bold text-white/90 sm:text-2xl">{subtitle}</span>}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/75">{pack.world.story}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link href={lobbyUrl(pack.id, "host")} className={`${primaryButton} text-center`}>Create room</Link>
              <Link href={lobbyUrl(pack.id, "join")} className={`${lobbyButton} grid place-items-center text-center`}>Join friends</Link>
            </div>
            <p className="mt-3 text-xs text-muted">Share one invite link. Everyone joins, readies up, and plays on their own device. 2 to 4 players.</p>
          </div>
          <div aria-hidden="true">{party
            ? <img src="/party-ludo/party-lounge-v1.png" alt="" className="aspect-square w-full rounded-2xl object-cover" />
            : <HeroArt pack={pack} scene={theme.scene} chars={chars} />}</div>
        </motion.section>

        <details className="glass mt-4 rounded-3xl p-5 sm:p-6">
          <summary className="cursor-pointer font-display text-lg font-bold">Play on one device</summary>
          <LocalSetup key={pack.id} pack={pack} onStart={onStart} />
        </details>

        {party ? (
          <section className="mt-10">
            <h2 className="font-display text-2xl font-bold">Party stops</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{pack.tiles.map((t) => <TileChip key={t.id} t={t} cut={pack.art.palette.bg} />)}</div>
          </section>
        ) : (
          <>
            {/* This world's rules */}
            <section className="mt-14" aria-labelledby="how">
              <h2 id="how" className="font-display text-2xl font-bold">How {title} plays</h2>
              <p className="mt-1 text-sm text-muted">Every world has its own rules. Here are this one's.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ruleCards(pack).map((r) => (
                  <div key={r.key} className="glass rounded-2xl p-4">
                    <div className="flex items-center gap-2">
                      <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-white/[.07] px-1.5 text-sm text-gold">{r.icon}</span>
                      <span className="font-display font-bold text-gold">{r.title}</span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-white/75">{r.text}</p>
                  </div>
                ))}
              </div>
            </section>

        <section className="mt-14">
          <h2 className="font-display text-2xl font-bold">{chars.some((c) => c.squad?.length) ? "The Houses" : "The Champions"}</h2>
          {chars.some((c) => c.squad?.length) && <p className="mt-1 text-sm text-muted">Every player leads a whole house. Each legend brings its own power; the house shares one passive and one crown power.</p>}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {chars.map((c) => (c.squad?.length ? <HouseCard key={c.id} pack={pack} c={c} /> : (
              <div key={c.id} className="glass rounded-2xl p-5" style={{ boxShadow: `inset 0 1px 0 ${c.color}55` }}>
                <div className="flex items-center gap-4">
                  <Emblem c={c} size={64} glow portrait={portraitOf(pack, c)} />
                  <div>
                    <div className="font-display text-xl font-bold" style={{ color: c.color }}>{c.name}</div>
                    <div className="text-xs uppercase tracking-[.2em] text-muted">{c.title} · {c.role}</div>
                  </div>
                </div>
                <p className="mt-3 text-sm italic text-white/70">{c.bio}</p>
                <dl className="mt-3 space-y-2 text-sm">
                  {[["Passive", c.passive.name, c.passive.description], ["Ability", c.active.name, c.active.description], ["Ultimate", c.ultimate.name, c.ultimate.description]].map(([k, n, d]) => (
                    <PowerRow key={k} kind={k} name={n} text={d} color={c.color} />
                  ))}
                </dl>
              </div>
            )))}
          </div>
        </section>

        {/* Tiles */}
        <section className="mt-14">
          <h2 className="font-display text-2xl font-bold">The Tiles of {title}</h2>
          <p className="mt-1 text-sm text-muted">Green helps, red hurts, gold is a gamble. Tiles repeat along the route, so you never know quite what waits ahead.</p>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            {groups.map(([name, list]) => (
              <div key={name}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[.25em] text-muted">{name}</div>
                <div className="grid gap-2">{list.map((t) => <TileChip key={t.id} t={t} cut={pack.art.palette.bg} />)}</div>
              </div>
            ))}
          </div>
        </section>
          </>
        )}
      </main>
    </div>
  );
}
