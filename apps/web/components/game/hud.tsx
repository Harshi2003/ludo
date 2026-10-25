"use client";
import {
  abilityDef, canUseAbility, character, progress, type AbilityDef, type GameEvent, type GameState, type ThemePack,
} from "@ludo/engine";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Emblem } from "../Emblem";
import type { NarratorLine, NarratorStats } from "@/lib/ai/narrator";

// ─── Player cards ───────────────────────────────────────────────────────

function UltRing({ value, max, color, size }: { value: number; max: number; color: string; size: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const ready = value >= max;
  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="4" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ready ? "#fcd34d" : color} strokeWidth="4"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, value / max))}
        style={{ transition: "stroke-dashoffset .6s ease", filter: ready ? "drop-shadow(0 0 6px #fcd34d)" : undefined }} />
    </svg>
  );
}

type SeatLabel = (seat: number) => { name: string | null; covering: boolean };

export function PlayerCards({ pack, state, compact, label, mine }: {
  pack: ThemePack; state: GameState; compact: boolean; label?: SeatLabel; mine?: (seat: number) => boolean;
}) {
  const total = progress(state.board, state.board.finish);
  return (
    <div className={compact ? "flex gap-1.5" : "flex flex-col gap-2.5"}>
      {state.players.map((p) => {
        const c = character(pack, p.character);
        const active = state.turn === p.seat && state.phase !== "over";
        const pct = Math.round((progress(state.board, p.tile) / total) * 100);
        const cost = c.ultimate.cost ?? 8;
        const size = compact ? 40 : 54;
        const who = label?.(p.seat);
        const isBot = who ? who.name === null : p.bot;
        return (
          <motion.div key={p.seat} layout
            className={`glass relative rounded-2xl ${compact ? "p-1.5" : "flex items-center gap-3 p-2.5 pr-3.5"}`}
            animate={{ scale: active ? 1.03 : 1, opacity: active || compact ? 1 : 0.86 }}
            style={{ borderColor: active ? c.color : undefined, boxShadow: active ? `0 0 0 1px ${c.color}, 0 0 28px -4px ${c.color}` : undefined }}>
            <div className="relative grid place-items-center" style={{ width: size, height: size }}>
              <UltRing value={p.ult} max={cost} color={c.color} size={size} />
              <Emblem c={c} size={size - 12} glow={active} portrait={pack.art.portraits?.[c.id]} />
              {p.shield && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-sky-400/90 text-[10px] font-bold text-sky-950 shadow" title="Shielded">◈</span>}
              {p.skip > 0 && <span className="absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-blue-200 text-[10px] text-blue-900 shadow" title="Stunned">❄</span>}
            </div>
            {!compact && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-display truncate text-[15px] font-bold tracking-wide" style={{ color: c.color }}>{c.name}</span>
                  {isBot && <span className="rounded bg-white/10 px-1.5 py-px text-[9px] font-semibold tracking-wider text-muted">BOT</span>}
                  {who?.name && <span className="truncate text-[11px] text-white/70">{who.name}{mine?.(p.seat) ? " (you)" : ""}</span>}
                  {who?.covering && <span className="rounded bg-amber-400/15 px-1.5 py-px text-[9px] font-semibold text-amber-200" title="A bot is playing until they're back">AWAY</span>}
                  {active && <span className="ml-auto h-2 w-2 animate-pulse rounded-full" style={{ background: c.color }} />}
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${c.color}88, ${c.color})` }}
                    animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 80, damping: 18 }} />
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-muted">
                  <span title="Captures">⚔ {p.captures}</span>
                  <span title="Ultimate charge" className={p.ult >= cost ? "font-semibold text-gold" : ""}>✦ {p.ult}/{cost}</span>
                  {p.cooldown > 0 ? <span title="Active ability cooldown">⏳ {p.cooldown - (state.turn === p.seat ? 0 : 1)}</span> : <span className="text-emerald-300/80">ready</span>}
                  {p.dice && <span className="text-pink-300" title="Dice cursed">☠ dice</span>}
                </div>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Ability buttons ────────────────────────────────────────────────────

function AbilityButton({ def, kind, color, ready, sub, onUse, compact }: {
  def: AbilityDef; kind: "active" | "ultimate"; color: string; ready: boolean; sub: string; onUse: () => void; compact: boolean;
}) {
  const [tip, setTip] = useState(false);
  const ult = kind === "ultimate";
  return (
    <div className="relative" onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}>
      <motion.button
        whileHover={ready ? { y: -2 } : undefined}
        whileTap={ready ? { scale: 0.94 } : undefined}
        disabled={!ready}
        onClick={onUse}
        onContextMenu={(e) => { e.preventDefault(); setTip((t) => !t); }}
        className={`glass relative overflow-hidden rounded-2xl text-left transition-opacity disabled:opacity-45 ${compact ? "min-h-14 w-[112px] px-2 py-1.5" : "min-h-[68px] w-[160px] px-3 py-2"}`}
        style={ready ? { borderColor: ult ? "#fcd34d" : color, boxShadow: `0 0 24px -6px ${ult ? "#fcd34d" : color}` } : undefined}
      >
        {ready && ult && (
          <motion.div className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(110deg, transparent 30%, rgba(252,211,77,.25) 50%, transparent 70%)" }}
            animate={{ x: ["-100%", "100%"] }} transition={{ duration: 1.8, repeat: Infinity }} />
        )}
        <div className={`font-semibold uppercase tracking-[.18em] ${compact ? "text-[8px]" : "text-[9px]"}`} style={{ color: ult ? "#fcd34d" : color }}>
          {ult ? "Ultimate" : "Ability"}
        </div>
        <div className={`font-display line-clamp-2 font-bold leading-[1.1] ${compact ? "text-[11.5px]" : "text-[15px]"}`} title={def.name}>{def.name}</div>
        <div className="truncate text-[10px] text-muted">{sub}</div>
      </motion.button>
      <AnimatePresence>
        {tip && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            className="glass pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-60 rounded-xl p-3 text-xs leading-relaxed">
            <div className="font-display mb-1 text-sm font-bold" style={{ color: ult ? "#fcd34d" : color }}>{def.name}</div>
            {def.description}
            <div className="mt-1.5 text-muted">{ult ? `Charge ${def.cost ?? 8}` : `Cooldown ${def.cooldown ?? 3} turns`}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AbilityBar({ pack, state, busy, onUse, compact, controllable }: {
  pack: ThemePack; state: GameState; busy: boolean; onUse: (w: "active" | "ultimate") => void; compact: boolean; controllable: boolean;
}) {
  const p = state.players[state.turn];
  const c = character(pack, p.character);
  const act = abilityDef(pack, state, "active");
  const ult = abilityDef(pack, state, "ultimate");
  const human = controllable && state.phase !== "over";
  const canAct = human && !busy && canUseAbility(pack, state, "active");
  const canUlt = human && !busy && canUseAbility(pack, state, "ultimate");
  const why = (w: "active" | "ultimate") => {
    if (state.usedAbility) return "Used this turn";
    if (state.phase !== "roll") return "Before rolling";
    if (w === "active" && p.cooldown > 0) return `Ready in ${p.cooldown} turn${p.cooldown > 1 ? "s" : ""}`;
    if (w === "ultimate" && p.ult < (ult.cost ?? 8)) return `Charging ${p.ult}/${ult.cost ?? 8}`;
    return "No target in range";
  };
  return (
    <div className="flex gap-2">
      <AbilityButton def={act} kind="active" color={c.color} ready={canAct} sub={canAct ? "Tap to cast" : why("active")} onUse={() => onUse("active")} compact={compact} />
      <AbilityButton def={ult} kind="ultimate" color={c.color} ready={canUlt} sub={canUlt ? "Unleash!" : why("ultimate")} onUse={() => onUse("ultimate")} compact={compact} />
    </div>
  );
}

// ─── Toasts ──────────────────────────────────────────────────────────────

export interface Toast {
  id: number;
  e: GameEvent;
}

const ICON: Partial<Record<GameEvent["kind"], string>> = {
  capture: "⚔", blocked_capture: "◈", tile: "✦", trap: "⚠", ability: "✷", ultimate: "☄", passive: "❂",
  skip: "❄", storm: "⛈", no_moves: "∅", checkpoint: "⚑", win: "♛", effect: "✧", world_event: "☁", event_warning: "⏱", tide: "≋",
};

export function Toasts({ pack, state, toasts }: { pack: ThemePack; state: GameState; toasts: Toast[] }) {
  return (
    <div className="pointer-events-none flex flex-col items-center gap-1.5">
      <AnimatePresence initial={false}>
        {toasts.map(({ id, e }) => {
          const p = state.players[e.seat];
          const color = p ? character(pack, p.character).color : "#c4b5fd";
          return (
            <motion.div key={id} layout initial={{ opacity: 0, y: -14, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className="glass flex max-w-[92vw] items-center gap-2 rounded-full py-1.5 pl-2 pr-4 text-[13px] sm:text-sm"
              style={{ borderColor: `${color}66` }}>
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs" style={{ background: `${color}33`, color }}>{ICON[e.kind] ?? "•"}</span>
              <span className="truncate">{e.msg}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ─── Ultimate cinematic ──────────────────────────────────────────────────

export function Cinematic({ pack, state, e }: { pack: ThemePack; state: GameState; e: GameEvent | null }) {
  const p = e ? state.players[e.seat] : undefined;
  const c = p ? character(pack, p.character) : undefined;
  const def = c && (e?.kind === "ultimate" ? c.ultimate : c.active);
  return (
    <AnimatePresence>
      {e && c && def && (
        <motion.div key={`${e.seat}-${e.msg}`} className="pointer-events-none fixed inset-0 z-40 grid place-items-center overflow-hidden"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.35 } }}>
          <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at center, ${c.color}40, rgba(5,3,15,.82) 65%)` }} />
          <motion.div className="absolute h-40 w-[160vw] -rotate-6"
            style={{ background: `linear-gradient(90deg, transparent, ${c.color}55, ${c.color}, ${c.color}55, transparent)` }}
            initial={{ x: "-100%" }} animate={{ x: "0%" }} transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }} />
          <div className="relative flex flex-col items-center px-6 text-center">
            <motion.div initial={{ scale: 0.3, rotate: -40, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 160, damping: 12 }}>
              <Emblem c={c} size={150} glow portrait={pack.art.portraits?.[c.id]} />
            </motion.div>
            <motion.div initial={{ y: 20, opacity: 0, letterSpacing: "0.6em" }} animate={{ y: 0, opacity: 1, letterSpacing: "0.12em" }}
              transition={{ delay: 0.15, duration: 0.6 }}
              className="font-display mt-4 text-4xl font-black uppercase text-white text-glow sm:text-6xl">
              {def.name}
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
              className="mt-3 max-w-md rounded-xl bg-black/60 px-4 py-2 text-sm text-white/85 backdrop-blur sm:text-base">
              <span className="font-semibold" style={{ color: c.color }}>{c.name}</span> — {def.description}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── AI commentary (Bitdeer) ─────────────────────────────────────────────

/** Sportscaster lines and in-character taunts streamed in from /api/narrate. */
export function NarratorTicker({ pack, state, line }: { pack: ThemePack; state: GameState; line: NarratorLine | null }) {
  const p = line?.seat !== undefined ? state.players[line.seat] : undefined;
  const c = p ? character(pack, p.character) : undefined;
  const color = c?.color ?? pack.art.palette.accent;
  return (
    <AnimatePresence>
      {line && (
        <motion.div key={line.id} initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.25 } }}
          className="glass mx-auto flex max-w-[min(640px,92vw)] items-start gap-2.5 rounded-2xl px-3.5 py-2 text-sm sm:text-[15px]"
          style={{ borderColor: `${color}77`, boxShadow: `0 0 28px -10px ${color}` }}>
          {c ? (
            <span className="mt-0.5 shrink-0 font-display font-bold" style={{ color }}>{c.name}:</span>
          ) : (
            <span className="mt-0.5 grid h-5 shrink-0 place-items-center rounded-full px-1.5 text-[9px] font-bold uppercase tracking-[.15em]" style={{ background: `${color}33`, color }}>Live</span>
          )}
          <span className={c ? "italic text-white/90" : "text-white/90"}>{c ? `“${line.text}”` : line.text}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Judges' view of the Bitdeer integration: model, calls, latency, tokens. */
export function ModelStudioPanel({ stats, available, on, onToggle, onClose }: {
  stats: NarratorStats; available: boolean; on: boolean; onToggle: (v: boolean) => void; onClose: () => void;
}) {
  const ok = stats.calls - stats.failed;
  const rows: [string, string][] = [
    ["Provider", stats.provider],
    ["Model", stats.model || "—"],
    ["Calls this game", `${stats.calls}${stats.failed ? ` (${stats.failed} failed)` : ""}`],
    ["Avg latency", ok ? `${Math.round(stats.totalMs / ok)} ms` : "—"],
    ["Tokens in / out", `${stats.promptTokens.toLocaleString()} / ${stats.completionTokens.toLocaleString()}`],
  ];
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      className="glass absolute right-3 top-[70px] z-30 w-[300px] rounded-2xl p-4 text-sm sm:top-[84px]">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-display font-bold title-gradient">AI Commentary</div>
        <button onClick={onClose} className="text-muted hover:text-white" aria-label="Close">✕</button>
      </div>
      {available ? (
        <>
          <dl className="space-y-1">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{k}</dt>
                <dd className="truncate text-right font-medium" title={v}>{v}</dd>
              </div>
            ))}
          </dl>
          <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl bg-white/5 px-3 py-2">
            <span>Live sportscaster & taunts</span>
            <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} className="h-4 w-4 accent-[var(--accent,#22d3ee)]" />
          </label>
        </>
      ) : (
        <p className="text-muted">Add <code className="text-white">BITDEER_API_KEY</code> to <code className="text-white">apps/web/.env.local</code> to turn on live AI commentary from Bitdeer AI Model Studio.</p>
      )}
    </motion.div>
  );
}

// ─── World event banner ─────────────────────────────────────────────────

/** Full-width headline when the world itself acts (fog, quakes, outages…). */
export function WorldEventBanner({ pack, e }: { pack: ThemePack; e: GameEvent | null }) {
  const def = e && pack.events?.find((d) => d.id === e.source);
  const { primary, accent } = pack.art.palette;
  return (
    <AnimatePresence>
      {e && def && (
        <motion.div key={`${e.source}-${e.msg}`} className="pointer-events-none fixed inset-0 z-40 grid place-items-center overflow-hidden"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.4 } }}>
          <motion.div className="absolute inset-0" initial={{ backdropFilter: "blur(0px)" }} animate={{ backdropFilter: "blur(3px)" }}
            style={{ background: "radial-gradient(ellipse at center, rgba(200,214,235,.22), rgba(5,6,14,.78) 70%)" }} />
          <motion.div className="relative w-full py-6 text-center"
            style={{ background: `linear-gradient(90deg, transparent, ${primary}33, ${primary}66, ${primary}33, transparent)` }}
            initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}>
            <div className="text-[11px] font-semibold uppercase tracking-[.4em]" style={{ color: accent }}>World event</div>
            <motion.h2 className="font-display mt-1 px-4 text-4xl font-black sm:text-6xl"
              style={{ color: "#fff", textShadow: `0 0 28px ${primary}` }}
              initial={{ y: 20, opacity: 0, letterSpacing: "0.3em" }} animate={{ y: 0, opacity: 1, letterSpacing: "0.02em" }}
              transition={{ delay: 0.15, duration: 0.5 }}>
              {def.name}
            </motion.h2>
            <motion.p className="mx-auto mt-2 max-w-xl px-6 text-sm text-white/85 sm:text-base"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
              {def.description}
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Victory ─────────────────────────────────────────────────────────────

export function Victory({ pack, state, onRematch, onHome, label }: {
  pack: ThemePack; state: GameState; onRematch?: () => void; onHome: () => void; label?: SeatLabel;
}) {
  if (state.winner === null) return null;
  const w = state.players[state.winner];
  const c = character(pack, w.character);
  const ranked = [...state.players].sort((a, b) =>
    a.seat === state.winner ? -1 : b.seat === state.winner ? 1 : progress(state.board, b.tile) - progress(state.board, a.tile));
  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#05030f]/80 p-4 backdrop-blur-md"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="glass relative w-full max-w-lg overflow-hidden rounded-3xl p-6 text-center sm:p-8"
        initial={{ scale: 0.85, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 120, damping: 14 }}>
        <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 50% 0%, ${c.color}55, transparent 60%)` }} />
        <div className="relative">
          <motion.div className="mb-1 text-5xl text-gold drop-shadow-[0_0_12px_#fcd34d]" initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>♛</motion.div>
          <div className="mx-auto w-fit"><Emblem c={c} size={110} glow portrait={pack.art.portraits?.[c.id]} /></div>
          <div className="mt-3 text-xs font-semibold uppercase tracking-[.3em] text-gold">Victory at the {pack.world.finish}</div>
          <h2 className="font-display mt-1 text-4xl font-black" style={{ color: c.color }}>{c.name} wins!</h2>
          <p className="mt-1 text-sm text-muted">{c.title} reached the {pack.world.finish} in round {state.round}.</p>
          <div className="mt-5 space-y-1.5 text-left">
            {ranked.map((p, i) => {
              const pc = character(pack, p.character);
              return (
                <div key={p.seat} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm">
                  <span className="w-4 text-muted">{i + 1}</span>
                  <Emblem c={pc} size={30} />
                  <span className="font-display flex-1 font-bold" style={{ color: pc.color }}>{pc.name}<span className="font-sans text-xs font-normal text-muted">{label ? ` · ${label(p.seat).name ?? "bot"}` : p.bot ? " · bot" : ""}</span></span>
                  <span className="text-muted">⚔ {p.captures}</span>
                  <span className="text-muted">☠ {p.timesCaptured}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={onHome} className="glass flex-1 rounded-xl py-3 font-semibold">Home</button>
            {onRematch ? (
              <button onClick={onRematch} className="flex-1 rounded-xl py-3 font-bold text-[#1a0b2e]"
                style={{ background: "linear-gradient(180deg,#fde68a,#f59e0b)" }}>Rematch</button>
            ) : (
              <div className="grid flex-1 place-items-center rounded-xl bg-white/5 py-3 text-sm text-muted">Waiting for the host…</div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Event log ───────────────────────────────────────────────────────────

export function LogDrawer({ pack, state, open, onClose }: { pack: ThemePack; state: GameState; open: boolean; onClose: () => void }) {
  const items = state.events.filter((e) => e.kind !== "roll" || e.value).slice(-120).reverse();
  return (
    <AnimatePresence>
      {open && (
        <motion.aside className="glass fixed bottom-3 right-3 top-3 z-30 flex w-[min(340px,86vw)] flex-col rounded-2xl"
          initial={{ x: 380 }} animate={{ x: 0 }} exit={{ x: 380 }} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="font-display font-bold tracking-wide">Chronicle</span>
            <button onClick={onClose} className="rounded-lg px-2 py-1 text-muted hover:bg-white/10" aria-label="Close log">✕</button>
          </div>
          <ol className="no-scrollbar flex-1 space-y-1 overflow-y-auto p-3 text-[12.5px]">
            {items.map((e, i) => {
              const p = state.players[e.seat];
              const color = p ? character(pack, p.character).color : "#c4b5fd";
              return (
                <li key={i} className={`flex gap-2 rounded-lg px-2 py-1 ${e.kind === "turn" ? "mt-2 bg-white/5 font-semibold" : ""}`}>
                  <span style={{ color }}>{ICON[e.kind] ?? "·"}</span>
                  <span className="text-white/85">{e.msg}</span>
                </li>
              );
            })}
          </ol>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
