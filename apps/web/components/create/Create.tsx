"use client";
import type { ThemePack } from "@ludo/engine";
import type { BalanceSummary } from "@ludo/themepack";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ForgeEvent } from "@/lib/ai/forge";
import { GlyphSvg } from "@/lib/glyphSvg";
import { tileColor, tileGlyph } from "@/lib/visuals";
import { saveWorld, selectWorld, splitTitle } from "@/lib/worlds";
import { Emblem } from "../Emblem";

const IDEAS = [
  "Pirate treasure war on a stormy sea",
  "Haunted candy factory at midnight",
  "Neon space race through an asteroid belt",
  "Jungle temple guarded by ancient beasts",
  "Underwater mermaid kingdom",
  "Dinosaur volcano island",
];

type StepState = "idle" | "active" | "done" | "skipped" | "error";
interface Progress {
  design: StepState;
  validate: StepState;
  balance: StepState;
  art: StepState;
  attempts: number;
  errors: string[];
  provider?: { provider: string; model: string; fallbackFrom?: string; reason?: string };
  balanceInfo?: { before: BalanceSummary; after: BalanceSummary; changes: string[] };
  artBy?: string;
}
const START: Progress = { design: "idle", validate: "idle", balance: "idle", art: "idle", attempts: 0, errors: [] };

function Editable({ value, onChange, className, label }: { value: string; onChange: (v: string) => void; className?: string; label: string }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} spellCheck={false}
      className={`w-full rounded-md border border-transparent bg-transparent px-1 -mx-1 outline-none transition hover:border-white/15 focus:border-accent/60 focus:bg-black/20 ${className ?? ""}`} />
  );
}

/** Which model is designing the world, and why if it fell back. */
function ProviderBadge({ info }: { info: NonNullable<Progress["provider"]> }) {
  return (
    <div className="mb-3 text-sm">
      <span className="inline-flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-accent" />
        <span className="text-muted">Designed with</span>
        <span className="font-semibold text-ink">{info.provider}</span>
        <code className="rounded bg-white/5 px-1.5 text-xs text-white/70">{info.model}</code>
      </span>
      {info.fallbackFrom && (
        <p className="mt-1.5 text-xs text-amber-200/80">{info.fallbackFrom} couldn&apos;t finish ({info.reason}). Switched to the fallback.</p>
      )}
    </div>
  );
}

export default function Create() {
  const router = useRouter();
  const [theme, setTheme] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress>(START);
  const [pack, setPack] = useState<ThemePack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingKey, setMissingKey] = useState(false);
  const lastTheme = useRef("");

  const forge = async (mock = false) => {
    const t = (theme || lastTheme.current).trim();
    if (t.length < 3) return setError("Describe your world in a few words first.");
    lastTheme.current = t;
    setBusy(true);
    setError(null);
    setMissingKey(false);
    setPack(null);
    setProgress({ ...START, design: "active" });
    try {
      const res = await fetch("/api/forge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: t, mock }) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        if (j.error === "missing_key") setMissingKey(true);
        else setError(j.message ?? j.error ?? "Couldn't start the forge.");
        setProgress(START);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) handle(JSON.parse(line) as ForgeEvent);
        }
      }
    } catch {
      setError("Lost connection to the forge. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handle = (e: ForgeEvent) => {
    setProgress((p) => {
      switch (e.stage) {
        case "provider": return { ...p, design: "active", validate: "idle", errors: [], attempts: 0, provider: e };
        case "design": return { ...p, design: "active", validate: e.attempt > 1 ? "active" : p.validate, attempts: e.attempt };
        case "invalid": return { ...p, design: "done", validate: "active", errors: e.errors };
        case "valid": return { ...p, design: "done", validate: "done", balance: "active", errors: [] };
        case "balance": return { ...p, balance: "done", art: "active", balanceInfo: e };
        case "art": return { ...p, art: e.status === "painting" ? "active" : e.status === "done" ? "done" : "skipped", artBy: e.by };
        case "error": return { ...p, design: p.design === "active" ? "error" : p.design, validate: p.validate === "active" ? "error" : p.validate };
        default: return p;
      }
    });
    if (e.stage === "done") {
      setPack(e.pack);
      // Into the kingdom library right away; "Play" later re-saves any edits.
      try {
        saveWorld(e.pack, lastTheme.current);
      } catch (err) {
        setError((err as Error).message);
      }
    }
    if (e.stage === "error") setError(e.message);
  };

  const update = (fn: (p: ThemePack) => void) =>
    setPack((p) => {
      if (!p) return p;
      const next = structuredClone(p);
      fn(next);
      return next;
    });

  const save = (to: "/" | "/lab") => {
    if (!pack) return;
    try {
      saveWorld(pack, lastTheme.current);
      selectWorld(pack.id);
      router.push(to);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const steps: { key: keyof Progress; label: string; detail: string }[] = [
    { key: "design", label: "Imagining the world", detail: progress.attempts > 1 ? `Redesign ${progress.attempts - 1}` : "Story, zones, champions, powers" },
    { key: "validate", label: "Checking the rules", detail: progress.errors.length ? `Fixing ${progress.errors.length} issue${progress.errors.length > 1 ? "s" : ""}` : "Every power must be playable" },
    { key: "balance", label: "Playtesting thousands of games", detail: progress.balanceInfo ? `Spread ${(progress.balanceInfo.before.spread * 100).toFixed(0)} → ${(progress.balanceInfo.after.spread * 100).toFixed(0)} pts` : "Bots hunt for unfair powers" },
    { key: "art", label: "Painting the realm", detail: progress.art === "skipped" ? "Using drawn art (add BITDEER_API_KEY to paint)" : progress.artBy ? `Painted by ${progress.artBy}` : "Seedream on Bitdeer paints the background and portraits" },
  ];
  const showProgress = busy || progress.design !== "idle";

  return (
    <div className="min-h-full" style={{ background: "radial-gradient(ellipse at 50% -20%, #3b1d7a, transparent 55%), #0b0820" }}>
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-[max(env(safe-area-inset-top),20px)] sm:px-8">
        <nav className="flex items-center justify-between py-2">
          <Link href="/" className="text-sm text-muted hover:text-ink">‹ Back to worlds</Link>
          <span className="font-display text-xs font-bold tracking-[.3em] text-muted">THE FORGE</span>
        </nav>

        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="font-display mt-6 text-4xl font-black sm:text-6xl">
          <span className="title-gradient">Forge a world</span>
        </motion.h1>
        <p className="mt-2 max-w-2xl text-white/70">Describe any theme. The AI invents the world, its champions, powers and traps, then bots playtest it until it’s fair.</p>

        <section className="glass mt-6 rounded-3xl p-4 sm:p-6">
          <label htmlFor="theme" className="text-xs font-semibold uppercase tracking-[.25em] text-muted">Your theme</label>
          <textarea id="theme" value={theme} onChange={(e) => setTheme(e.target.value)} maxLength={600} rows={3} disabled={busy}
            placeholder="e.g. A pirate war for the Sunken Crown, with cannons, krakens and smuggler tunnels…"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void forge(); }}
            className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-4 text-lg outline-none placeholder:text-white/30 focus:border-accent/60" />
          <div className="mt-3 flex flex-wrap gap-2">
            {IDEAS.map((i) => (
              <button key={i} disabled={busy} onClick={() => setTheme(i)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition hover:border-accent/50 hover:text-white disabled:opacity-40">{i}</button>
            ))}
          </div>
          <motion.button onClick={() => void forge()} disabled={busy} whileTap={{ scale: 0.98 }}
            className="font-display mt-5 w-full rounded-2xl py-4 text-lg font-black tracking-[.15em] text-[#1a0b2e] disabled:opacity-60"
            style={{ background: "linear-gradient(180deg,#fff1b8,#fcd34d 40%,#f59e0b)" }}>
            {busy ? "FORGING…" : "✦ FORGE THIS WORLD"}
          </motion.button>
        </section>

        <AnimatePresence>
          {missingKey && (
            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass mt-4 rounded-2xl p-5 text-sm">
              <div className="font-display text-lg font-bold text-gold">The forge needs an AI key</div>
              <p className="mt-1 text-white/75">Add your Anthropic API key (and optionally Bitdeer AI Model Studio as a backup) to <code className="rounded bg-black/40 px-1.5">apps/web/.env.local</code>:</p>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-black/40 p-3 text-xs text-white/85">ANTHROPIC_API_KEY=sk-ant-…{"\n"}BITDEER_API_KEY=…            # optional backup{"\n"}FAL_KEY=…                    # optional, paints art</pre>
              <p className="mt-2 text-white/60">Then restart the dev server. Meanwhile you can try the full flow with a built-in demo world.</p>
              <button onClick={() => void forge(true)} className="mt-3 rounded-xl bg-primary px-4 py-2 font-semibold text-white">Try the demo world</button>
            </motion.section>
          )}
        </AnimatePresence>

        {error && <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200" role="alert">{error}</div>}

        {/* Progress */}
        <AnimatePresence>
          {showProgress && !pack && (
            <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="mt-8 grid items-center gap-8 md:grid-cols-[220px_1fr]">
              <div className="relative mx-auto grid h-52 w-52 place-items-center">
                <div className="animate-spin-slow absolute inset-0 rounded-full border border-dashed border-accent/40" />
                <div className="absolute inset-6 rounded-full border border-primary/40" style={{ animation: "spin-slow 12s linear infinite reverse" }} />
                <div className="absolute inset-10 rounded-full" style={{ background: "radial-gradient(circle, rgba(252,211,77,.35), transparent 70%)" }} />
                <motion.div animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 2, repeat: Infinity }} className="text-5xl text-gold">✦</motion.div>
              </div>
              <div>
              {progress.provider && <ProviderBadge info={progress.provider} />}
              <ol className="space-y-3">
                {steps.map((s) => {
                  const st = progress[s.key] as StepState;
                  return (
                    <li key={s.key} className={`flex items-center gap-3 rounded-2xl border p-3 transition ${st === "active" ? "border-accent/50 bg-accent/5" : "border-white/5"}`}>
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm ${
                        st === "done" ? "bg-emerald-500/20 text-emerald-300" : st === "active" ? "bg-accent/20 text-accent" : st === "error" ? "bg-rose-500/20 text-rose-300" : "bg-white/5 text-muted"}`}>
                        {st === "done" ? "✓" : st === "error" ? "✕" : st === "skipped" ? "–" : st === "active" ? <span className="h-2.5 w-2.5 animate-ping rounded-full bg-accent" /> : "·"}
                      </span>
                      <div>
                        <div className={`font-semibold ${st === "idle" ? "text-muted" : "text-ink"}`}>{s.label}</div>
                        <div className="text-xs text-muted">{s.detail}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Reveal */}
        {pack && progress.provider && <div className="mt-8"><ProviderBadge info={progress.provider} /></div>}
        {pack && <Reveal pack={pack} update={update} balance={progress.balanceInfo} onSave={save} onAgain={() => { setPack(null); setProgress(START); }} />}
      </main>
    </div>
  );
}

function Reveal({ pack, update, balance, onSave, onAgain }: {
  pack: ThemePack;
  update: (fn: (p: ThemePack) => void) => void;
  balance?: { before: BalanceSummary; after: BalanceSummary; changes: string[] };
  onSave: (to: "/" | "/lab") => void;
  onAgain: () => void;
}) {
  const [title, subtitle] = splitTitle(pack.world.name);
  const pal = pack.art.palette;
  return (
    <motion.section initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 90, damping: 16 }} className="mt-10">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-8"
        style={{ background: pack.art.backgroundUrl ? `linear-gradient(180deg, ${pal.bg}55, ${pal.bg}ee), url(${pack.art.backgroundUrl}) center/cover` : `radial-gradient(ellipse at 70% 0%, ${pal.primary}44, transparent 60%), ${pal.surface}` }}>
        <div className="text-xs font-semibold uppercase tracking-[.35em]" style={{ color: pal.accent }}>A new world is born</div>
        <Editable label="World name" value={pack.world.name} onChange={(v) => update((p) => { p.world.name = v; })}
          className="font-display mt-2 text-3xl font-black text-white sm:text-5xl" />
        <Editable label="Tagline" value={pack.world.tagline} onChange={(v) => update((p) => { p.world.tagline = v; })} className="mt-1 text-lg text-white/80" />
        <p className="mt-3 max-w-3xl leading-relaxed text-white/75">{pack.world.story}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/70">
          <span className="rounded-full bg-black/30 px-3 py-1">{pack.world.startName}</span>
          {pack.zones.map((z) => (
            <span key={z.id} className="flex items-center gap-2"><span className="text-white/30">→</span>
              <span className="rounded-full px-3 py-1" style={{ background: `${pack.art.zoneColors[z.id]}22`, color: pack.art.zoneColors[z.id] }}>{z.name}</span>
            </span>
          ))}
          <span className="text-white/30">→</span><span className="rounded-full bg-gold/20 px-3 py-1 font-semibold text-gold">♛ {pack.world.finish}</span>
        </div>
        <p className="mt-3 text-[11px] text-white/40">Tip: click any name to rename it. ({title}{subtitle ? ` · ${subtitle}` : ""})</p>
      </div>

      <h3 className="font-display mt-8 text-xl font-bold">Champions</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {pack.characters.map((c, i) => (
          <div key={c.id} className="glass rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <Emblem c={c} size={60} glow portrait={pack.art.portraits?.[c.id]} />
              <div className="min-w-0 flex-1">
                <Editable label="Champion name" value={c.name} onChange={(v) => update((p) => { p.characters[i].name = v; })} className="font-display text-lg font-bold" />
                <div className="text-xs uppercase tracking-[.2em] text-muted">{c.title} · {c.role}</div>
              </div>
            </div>
            <p className="mt-2 text-sm italic text-white/65">{c.bio}</p>
            <div className="mt-2 space-y-1.5 text-sm">
              {(["passive", "active", "ultimate"] as const).map((k) => (
                <div key={k} className="rounded-lg bg-white/[.04] px-3 py-2">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em]" style={{ color: k === "ultimate" ? "#fcd34d" : c.color }}>
                    {k}
                    <Editable label={`${k} name`} value={c[k].name} onChange={(v) => update((p) => { p.characters[i][k].name = v; })}
                      className="font-display text-sm normal-case tracking-normal text-white" />
                  </div>
                  <div className="text-white/70">{c[k].description}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h3 className="font-display mt-8 text-xl font-bold">Tiles</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {pack.tiles.filter((t) => t.base !== "normal").map((t) => {
          const idx = pack.tiles.indexOf(t);
          const color = tileColor(t);
          return (
            <div key={t.id} className="flex items-start gap-3 rounded-xl bg-white/[.04] p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `${color}22`, boxShadow: `inset 0 0 0 1.5px ${color}` }}>
                <GlyphSvg glyph={tileGlyph(t)} color={color} cut="#1a1440" size={20} />
              </span>
              <div className="min-w-0">
                <Editable label="Tile name" value={t.name} onChange={(v) => update((p) => { p.tiles[idx].name = v; })} className="text-sm font-semibold" />
                <div className="text-xs text-muted">{t.description}</div>
              </div>
            </div>
          );
        })}
      </div>

      {balance && (
        <div className="glass mt-8 rounded-2xl p-5 text-sm">
          <div className="font-display text-lg font-bold">Playtest report</div>
          <p className="text-xs text-muted">Measured on fresh games after tuning.</p>
          <p className="mt-1 text-white/70">
            {balance.after.games} bot games · {balance.after.rounds.toFixed(1)} rounds and {balance.after.captures.toFixed(1)} captures per game ·
            win spread {(balance.before.spread * 100).toFixed(0)} → <b className="text-ink">{(balance.after.spread * 100).toFixed(0)} pts</b>
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            {pack.characters.map((c) => (
              <div key={c.id} className="rounded-xl bg-white/[.04] px-3 py-2">
                <div className="text-xs text-muted">{c.name}</div>
                <div className="text-lg font-semibold tabular-nums">{((balance.after.winRates[c.id] ?? 0) * 100).toFixed(0)}%</div>
              </div>
            ))}
          </div>
          {balance.changes.length > 0 && (
            <ul className="mt-3 list-inside list-disc text-xs text-white/60">{balance.changes.map((c, i) => <li key={i}>Rebalanced {c}</li>)}</ul>
          )}
        </div>
      )}

      <p className="mt-8 text-center text-sm text-emerald-300/90">✓ Saved to your kingdoms. Find it on the home screen next to Aetherfall.</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <button onClick={() => onSave("/")} className="font-display flex-1 rounded-2xl py-4 text-lg font-black tracking-[.12em] text-[#1a0b2e]"
          style={{ background: "linear-gradient(180deg,#fff1b8,#fcd34d 40%,#f59e0b)" }}>PLAY THIS WORLD</button>
        <button onClick={() => onSave("/lab")} className="glass flex-1 rounded-2xl py-4 font-semibold">Open in Balance Lab</button>
        <button onClick={onAgain} className="rounded-2xl px-6 py-4 text-muted hover:text-ink">Forge again</button>
      </div>
    </motion.section>
  );
}
