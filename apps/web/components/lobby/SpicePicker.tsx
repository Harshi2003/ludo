"use client";
import { SPICE_LABELS, type SpiceLevel } from "@/lib/party-ludo/prompts";
import { availableQuestions } from "@/lib/party-ludo/spice";

export function SpicePicker({ value, onChange, disabled }: { value: SpiceLevel; onChange?: (level: SpiceLevel) => void; disabled?: boolean }) {
  return <fieldset className="rounded-2xl border border-white/10 p-4">
    <legend className="px-2 font-display text-lg text-gold">Question spice level</legend>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Question spice level">
      {([1, 2, 3] as const).map(level => <button key={level} type="button" disabled={disabled || !onChange} aria-pressed={value === level} onClick={() => onChange?.(level)} className={`rounded-xl border px-4 py-2 text-sm transition disabled:cursor-default ${value === level ? "border-accent bg-primary/25 text-accent ring-1 ring-accent/40" : "border-white/10 bg-white/5 text-muted"}`}>{SPICE_LABELS[level]}</button>)}
    </div>
    <p className="mt-3 text-xs text-muted">{availableQuestions(value).length} questions · Lower levels included.{value === 3 ? " Spicy currently includes Mild and Medium questions." : ""}</p>
  </fieldset>;
}
