"use client";
import type { GameState, ThemePack } from "@ludo/engine";
import { motion } from "motion/react";
import { useMemo } from "react";
import { planMoves, rollAdvice } from "@/lib/overseer";

const TONE = { good: "#34d399", bad: "#fb4f6d", neutral: "#fbbf24" } as const;

/**
 * The Overseer: a built in guide for the human whose turn it is. Before the roll it explains the
 * ready power; while moving it lists every option in plain words, best first, and tapping one moves.
 */
export function Overseer({ pack, state, color, compact, onPick, onHover }: {
  pack: ThemePack; state: GameState; color: string; compact: boolean;
  onPick: (index: number) => void;
  onHover?: (index: number | null) => void;
}) {
  const moving = state.phase === "move";
  const plan = useMemo(() => (moving ? planMoves(pack, state) : null), [moving, pack, state]);
  const roll = useMemo(() => (moving ? null : rollAdvice(pack, state)), [moving, pack, state]);
  const shown = plan ? plan.plans.slice(0, compact ? 3 : 5) : [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`glass mb-2 rounded-2xl p-2 ${compact ? "w-[min(270px,calc(100vw-120px))]" : "w-[340px]"}`}>
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[9px] font-semibold uppercase tracking-[.22em]" style={{ color }}>
        <span>◉</span> Overseer
      </div>
      {roll && (
        <div className="px-1 pb-0.5">
          <div className="text-[13px] font-bold leading-tight">{roll.title}</div>
          <div className={`mt-0.5 text-[11.5px] leading-snug text-white/75 ${compact ? "line-clamp-3" : ""}`}>{roll.detail}</div>
        </div>
      )}
      {plan && (
        <>
          <div className="flex flex-col gap-1">
            {shown.map((p, i) => (
              <button key={p.index} onClick={() => onPick(p.index)}
                onMouseEnter={() => onHover?.(p.index)} onMouseLeave={() => onHover?.(null)}
                className="flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/10"
                style={i === 0 ? { background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66` } : undefined}>
                {shown.length > 1 && <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-black" style={{ background: color, color: "#0b0820" }}>{i + 1}</span>}
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px]" style={{ background: `${TONE[p.tone]}26`, color: TONE[p.tone] }}>{p.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-bold leading-tight">{p.title}</span>
                    {i === 0 && <span className="shrink-0 rounded-full px-1.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: color, color: "#0b0820" }}>★ Pick</span>}
                    {compact && i > 0 && p.threats.length > 0 && <span className="shrink-0 text-[10px] text-rose-300/90">⚔{p.threats.length}</span>}
                  </span>
                  <span className={`block text-[11px] leading-snug text-white/70 ${compact ? (i > 0 ? "truncate" : "line-clamp-2") : ""}`}>{p.detail}</span>
                  {p.threats.length > 0 && !(compact && i > 0) && <span className="block text-[10.5px] text-rose-300/90">⚔ {p.threats.length > 2 ? `${p.threats.length} rivals` : p.threats.join(" & ")} can reach you there</span>}
                </span>
              </button>
            ))}
          </div>
          {plan.why && <div className="px-1 pt-1 text-[11px] italic text-white/60">{plan.why}</div>}
          {plan.plans.length > shown.length && <div className="px-1 text-[10px] text-muted">+{plan.plans.length - shown.length} more glowing on the board</div>}
        </>
      )}
    </motion.div>
  );
}
