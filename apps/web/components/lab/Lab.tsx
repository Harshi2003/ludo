"use client";
import { character, mean, type BalanceWarning, type BotStyle, type PlayerCount, type SimResult, type ThemePack } from "@ludo/engine";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getWorld, selectedWorldId, isPartyWorld } from "@/lib/worlds";
import { applyTuning, defaultTuning, isDefault, loadTuning, saveTuning, type Tuning } from "@/lib/tuning";
import { Emblem } from "../Emblem";
import { BarRows, ChartCard, characterColor, Histogram, StatTile, VIZ } from "./charts";

interface Run {
  result: SimResult;
  warnings: BalanceWarning[];
  players: number;
  ms: number;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="flex rounded-xl bg-black/30 p-1" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${value === o.v ? "bg-primary text-white" : "text-muted hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, suffix = "", onChange, changed }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void; changed?: boolean;
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className={`tabular-nums ${changed ? "font-semibold text-gold" : "text-ink"}`}>{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)}
        className="mt-1 w-full accent-[#8b5cf6]" />
    </label>
  );
}

export default function Lab() {
  const [pack] = useState<ThemePack>(() => { const world = getWorld(selectedWorldId()).pack; return isPartyWorld(world) ? getWorld(null).pack : world; });
  const base = useMemo(() => defaultTuning(pack), [pack]);
  const [tuning, setTuning] = useState<Tuning>(base);
  const [players, setPlayers] = useState<PlayerCount>(4);
  const [games, setGames] = useState(500);
  const [style, setStyle] = useState<BotStyle>("normal");
  const [progress, setProgress] = useState<number | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [prev, setPrev] = useState<Run | null>(null);
  const [saved, setSaved] = useState(false);
  const worker = useRef<Worker | null>(null);

  useEffect(() => {
    const t = loadTuning(pack);
    if (t) setTuning(t);
  }, [pack]);

  const start = () => {
    worker.current?.terminate();
    const w = new Worker(new URL("../../workers/sim.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    const t0 = performance.now();
    setProgress(0);
    w.onmessage = (e) => {
      if (e.data.type === "progress") setProgress(e.data.done / games);
      else {
        setPrev(run && run.players === players ? run : null);
        setRun({ result: e.data.result, warnings: e.data.warnings, players, ms: performance.now() - t0 });
        setProgress(null);
        w.terminate();
      }
    };
    w.postMessage({ pack: applyTuning(pack, tuning), players, games, seed: (Math.random() * 1e9) | 0, style });
  };

  // Run once on load so the page is never empty.
  useEffect(() => {
    start();
    return () => worker.current?.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setChar = (id: string, k: "cooldown" | "cost" | "power", v: number) =>
    setTuning((t) => ({ ...t, chars: { ...t.chars, [id]: { ...t.chars[id], [k]: v } } }));

  const r = run?.result;
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of pack.tiles) m.set(t.id, `${t.name} · tile`);
    for (const c of pack.characters) {
      m.set(c.active.id, `${c.active.name} · ${c.name}`);
      m.set(c.ultimate.id, `${c.ultimate.name} · ${c.name}`);
      m.set(c.passive.id, `${c.passive.name} · ${c.name}`);
    }
    return m;
  }, [pack]);

  const charRate = (x: SimResult | undefined, id: string) => (x && x.gamesByCharacter[id] ? (x.winsByCharacter[id] ?? 0) / x.gamesByCharacter[id] : undefined);
  const spread = (x: SimResult | undefined) => {
    if (!x) return 0;
    const rates = pack.characters.map((c) => charRate(x, c.id)).filter((v): v is number => v !== undefined);
    return (Math.max(...rates) - Math.min(...rates)) * 100;
  };
  const pr = prev?.result;
  const fair = r ? 1 / r.players : 0.25;

  return (
    <div className="min-h-full" style={{ background: "radial-gradient(ellipse at 80% -10%, #2a1660, transparent 50%), #0b0820" }}>
      <main className="mx-auto max-w-7xl px-4 pb-20 pt-[max(env(safe-area-inset-top),20px)] sm:px-8">
        <nav className="flex items-center justify-between py-2">
          <Link href="/" className="text-sm text-muted hover:text-ink">‹ Back to the game</Link>
          <span className="font-display text-xs font-bold tracking-[.3em] text-muted">BALANCE LAB</span>
        </nav>
        <h1 className="font-display mt-3 text-3xl font-black sm:text-4xl"><span className="title-gradient">Balance Lab</span></h1>
        <p className="mt-1 max-w-2xl text-sm text-white/70">
          Bots play hundreds of games of {pack.world.name.split(":")[0]} in the background. Tune the guardians and rules, re-run, and see whether every seat and guardian has a fair shot.
        </p>

        {/* Controls: one row above the charts */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Segmented label="Players" value={players} onChange={setPlayers} options={[2, 3, 4].map((n) => ({ v: n as PlayerCount, label: `${n}P` }))} />
          <Segmented label="Games" value={games} onChange={setGames} options={[200, 500, 1000, 2000].map((n) => ({ v: n, label: n >= 1000 ? `${n / 1000}K` : `${n}` }))} />
          <Segmented label="Bot style" value={style} onChange={setStyle} options={[{ v: "easy", label: "Easy" }, { v: "normal", label: "Normal" }, { v: "aggressive", label: "Aggressive" }]} />
          <button onClick={start} disabled={progress !== null}
            className="ml-auto rounded-xl px-5 py-2.5 text-sm font-bold text-[#1a0b2e] disabled:opacity-60"
            style={{ background: "linear-gradient(180deg,#fff1b8,#fcd34d 40%,#f59e0b)" }}>
            {progress !== null ? `Simulating… ${Math.round(progress * 100)}%` : `Run ${games.toLocaleString()} games`}
          </button>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/5">
          <motion.div className="h-full bg-accent" animate={{ width: `${(progress ?? (run ? 1 : 0)) * 100}%`, opacity: progress === null ? 0 : 1 }} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {/* Stat tiles */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Games simulated" value={r ? r.games.toLocaleString() : "—"} />
              <StatTile label="Average rounds" value={r ? mean(r.rounds).toFixed(1) : "—"} delta={r && pr ? mean(r.rounds) - mean(pr.rounds) : undefined} good="none" />
              <StatTile label="Captures per game" value={r ? mean(r.captures).toFixed(1) : "—"} delta={r && pr ? mean(r.captures) - mean(pr.captures) : undefined} good="up" />
              <StatTile label="Guardian win spread (pts)" value={r ? spread(r).toFixed(1) : "—"} delta={r && pr ? spread(r) - spread(pr) : undefined} good="down" />
            </div>

            {/* Verdict */}
            {run && (
              <div className="rounded-2xl border border-white/10 p-4" style={{ background: VIZ.surface }}>
                {run.warnings.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-ink"><span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500/20 text-emerald-300">✓</span>
                    Balanced: seats, guardians, kills and game length are all within target.</div>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {run.warnings.map((w, i) => (
                      <li key={i} className="flex items-center gap-2 text-ink">
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${w.level === "bad" ? "bg-rose-500/20 text-rose-300" : "bg-amber-500/20 text-amber-300"}`}>{w.level === "bad" ? "✕" : "!"}</span>
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{w.level === "bad" ? "Unbalanced" : "Watch"}</span>
                        {w.msg.replace(/^([a-z][a-z0-9-]*) wins/, (m, id: string) => (pack.characters.some((c) => c.id === id) ? `${character(pack, id).name} wins` : m))}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 text-xs text-muted">{run.result.games.toLocaleString()} games · {run.players} players · {(run.ms / 1000).toFixed(1)}s · avg board {Math.round(run.result.boardTiles)} tiles</div>
              </div>
            )}

            {r && (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <ChartCard title="Win rate by guardian" subtitle={`Line marks a fair share (${pct(fair)}). Ticks show the previous run.`}
                    table={{ head: ["Guardian", "Win rate", "Wins", "Games"], rows: pack.characters.filter((c) => r.gamesByCharacter[c.id]).map((c) => [c.name, pct(charRate(r, c.id) ?? 0), r.winsByCharacter[c.id] ?? 0, r.gamesByCharacter[c.id]]) }}>
                    <BarRows format={pct} reference={fair} referenceLabel="fair" max={Math.max(0.6, fair * 2)}
                      rows={pack.characters.map((c, i) => ({ c, i })).filter(({ c }) => r.gamesByCharacter[c.id]).map(({ c, i }) => ({
                        key: c.id, label: c.name, color: characterColor(c.id, i), value: charRate(r, c.id) ?? 0,
                        prev: charRate(pr, c.id), extra: `${r.winsByCharacter[c.id] ?? 0} of ${r.gamesByCharacter[c.id]} games`,
                      }))} />
                  </ChartCard>
                  <ChartCard title="Win rate by seat" subtitle="Seat 1 moves first. Every seat should be close to fair."
                    table={{ head: ["Seat", "Win rate", "Wins"], rows: r.winsBySeat.map((w, i) => [`Seat ${i + 1}`, pct(w / r.games), w]) }}>
                    <BarRows format={pct} reference={fair} referenceLabel="fair" max={Math.max(0.6, fair * 2)}
                      rows={r.winsBySeat.map((w, i) => ({ key: `s${i}`, label: `Seat ${i + 1}`, color: VIZ.series, value: w / r.games, prev: pr && pr.winsBySeat[i] !== undefined ? pr.winsBySeat[i] / pr.games : undefined, extra: `${w} wins` }))} />
                  </ChartCard>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <ChartCard title="Game length" subtitle={`Rounds per game · median ${median(r.rounds)}`}
                    table={{ head: ["Rounds", "Games"], rows: counts(r.rounds) }}>
                    <Histogram values={r.rounds} unit="rounds" />
                  </ChartCard>
                  <ChartCard title="Captures per game" subtitle={`Median ${median(r.captures)} · ${pct(r.captures.filter((c) => c === 0).length / r.games)} of games have none`}
                    table={{ head: ["Captures", "Games"], rows: counts(r.captures) }}>
                    <Histogram values={r.captures} unit="captures" />
                  </ChartCard>
                </div>
                <ChartCard title="What fires most" subtitle="Average times per game each power triggers. Rarely-firing powers may be invisible to players."
                  table={{ head: ["Power", "Per game"], rows: Object.entries(r.sources).sort((a, b) => b[1] - a[1]).map(([k, v]) => [names.get(k) ?? k, (v / r.games).toFixed(2)]) }}>
                  <BarRows format={(v) => v.toFixed(1)} max={Math.max(1, ...Object.values(r.sources).map((v) => v / r.games))}
                    rows={Object.entries(r.sources).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => ({
                      key: k, label: (names.get(k) ?? k).split(" · ")[0], color: VIZ.series, value: v / r.games,
                      prev: pr?.sources[k] !== undefined ? pr.sources[k] / pr.games : undefined, extra: names.get(k),
                    }))} />
                </ChartCard>
              </>
            )}
          </div>

          {/* Tuning */}
          <aside className="glass h-fit space-y-5 rounded-2xl p-4 lg:sticky lg:top-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Tuning</h2>
              <button onClick={() => setTuning(base)} disabled={isDefault(pack, tuning)} className="text-xs text-muted hover:text-ink disabled:opacity-40">Reset</button>
            </div>
            {pack.characters.map((c) => {
              const t = tuning.chars[c.id];
              const b = base.chars[c.id];
              return (
                <div key={c.id} className="space-y-2 rounded-xl bg-black/20 p-3">
                  <div className="flex items-center gap-2"><Emblem c={c} size={28} /><span className="font-display font-bold" style={{ color: c.color }}>{c.name}</span></div>
                  <Slider label={`${c.active.name} cooldown`} value={t.cooldown} min={1} max={8} suffix=" turns" changed={t.cooldown !== b.cooldown} onChange={(v) => setChar(c.id, "cooldown", v)} />
                  <Slider label={`${c.ultimate.name} charge`} value={t.cost} min={4} max={14} changed={t.cost !== b.cost} onChange={(v) => setChar(c.id, "cost", v)} />
                  <Slider label="Ability power" value={t.power} min={50} max={150} step={10} suffix="%" changed={t.power !== 100} onChange={(v) => setChar(c.id, "power", v)} />
                </div>
              );
            })}
            <div className="space-y-2 rounded-xl bg-black/20 p-3">
              <div className="font-display font-bold">Rules</div>
              <Slider label={`${pack.rules.stormName} round (${players}P)`} value={tuning.stormRound[players]} min={8} max={40}
                changed={tuning.stormRound[players] !== base.stormRound[players]}
                onChange={(v) => setTuning((t) => ({ ...t, stormRound: { ...t.stormRound, [players]: v } }))} />
              <Slider label="Charge per turn" value={tuning.charge.turn} min={0} max={3} changed={tuning.charge.turn !== base.charge.turn} onChange={(v) => setTuning((t) => ({ ...t, charge: { ...t.charge, turn: v } }))} />
              <Slider label="Charge per capture" value={tuning.charge.capture} min={0} max={5} changed={tuning.charge.capture !== base.charge.capture} onChange={(v) => setTuning((t) => ({ ...t, charge: { ...t.charge, capture: v } }))} />
              <Slider label="Charge when captured" value={tuning.charge.captured} min={0} max={6} changed={tuning.charge.captured !== base.charge.captured} onChange={(v) => setTuning((t) => ({ ...t, charge: { ...t.charge, captured: v } }))} />
              <label className="flex items-center justify-between pt-1 text-xs">
                <span className="text-muted">Rolling a 6 rolls again</span>
                <input type="checkbox" checked={tuning.extraRollOnSix} onChange={(e) => setTuning((t) => ({ ...t, extraRollOnSix: e.target.checked }))} className="h-4 w-4 accent-[#8b5cf6]" />
              </label>
            </div>
            <button onClick={start} disabled={progress !== null} className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-60">Re-run with tuning</button>
            <button onClick={() => { saveTuning(pack, isDefault(pack, tuning) ? null : tuning); setSaved(true); setTimeout(() => setSaved(false), 2200); }}
              className="w-full rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-ink hover:bg-white/5">
              Use these settings when playing
            </button>
            <AnimatePresence>
              {saved && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center text-xs text-emerald-300">Saved. New games will use this tuning.</motion.p>}
            </AnimatePresence>
          </aside>
        </div>
      </main>
    </div>
  );
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

function counts(xs: number[]): (string | number)[][] {
  const m = new Map<number, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}
