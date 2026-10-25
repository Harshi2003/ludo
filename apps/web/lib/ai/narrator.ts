"use client";
import { character, progress, type GameEvent, type GameState, type ThemePack } from "@ludo/engine";
import { useCallback, useEffect, useRef, useState } from "react";

export interface NarratorLine {
  id: number;
  text: string;
  /** Seat of the character speaking (taunts); undefined for the sportscaster. */
  seat?: number;
}

export interface NarratorStats {
  provider: string;
  model: string;
  calls: number;
  failed: number;
  totalMs: number;
  promptTokens: number;
  completionTokens: number;
}

const HOT = new Set<GameEvent["kind"]>(["capture", "ultimate", "world_event", "win", "blocked_capture"]);
const MIN_GAP_MS = 5000;
const PREF = "ludo:narrator";

/**
 * Live AI commentary from Bitdeer: watches the game log, and on big moments asks
 * /api/narrate for a sportscaster line or an in-character taunt. Stays silent with no key.
 */
export function useNarrator(pack: ThemePack) {
  const [available, setAvailable] = useState(false);
  const [on, setOnState] = useState(true);
  const [line, setLine] = useState<NarratorLine | null>(null);
  const [stats, setStats] = useState<NarratorStats>({ provider: "Bitdeer AI Model Studio", model: "", calls: 0, failed: 0, totalMs: 0, promptTokens: 0, completionTokens: 0 });
  const recent = useRef<string[]>([]);
  const busy = useRef(false);
  const last = useRef(0);
  const leader = useRef<number | null>(null);
  const lineId = useRef(0);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  // observe() is called from long-lived callbacks, so it reads these through refs.
  const live = useRef({ available: false, on: true });
  live.current = { available, on };

  useEffect(() => {
    try {
      setOnState(localStorage.getItem(PREF) !== "0");
    } catch {}
    fetch("/api/narrate")
      .then((r) => r.json())
      .then((j: { enabled?: boolean; provider?: string; model?: string }) => {
        setAvailable(!!j.enabled);
        setStats((s) => ({ ...s, provider: j.provider ?? s.provider, model: j.model ?? s.model }));
      })
      .catch(() => {});
    return () => {
      if (hide.current) clearTimeout(hide.current);
    };
  }, []);

  const setOn = useCallback((v: boolean) => {
    setOnState(v);
    try {
      localStorage.setItem(PREF, v ? "1" : "0");
    } catch {}
  }, []);

  const request = useCallback(async (mode: "cast" | "taunt", seat: number | undefined, state: GameState) => {
    busy.current = true;
    last.current = Date.now();
    const c = seat !== undefined && seat >= 0 ? character(pack, state.players[seat].character) : undefined;
    try {
      const res = await fetch("/api/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: c && mode === "taunt" ? "taunt" : "cast",
          world: { name: pack.world.name, tagline: pack.world.tagline },
          speaker: c && { name: c.name, title: c.title, bio: c.bio },
          moments: recent.current,
        }),
      });
      const j = (await res.json()) as { line?: string; model?: string; ms?: number; usage?: { prompt_tokens: number; completion_tokens: number } | null };
      if (!res.ok || !j.line) throw new Error("no line");
      setStats((s) => ({
        ...s,
        model: j.model ?? s.model,
        calls: s.calls + 1,
        totalMs: s.totalMs + (j.ms ?? 0),
        promptTokens: s.promptTokens + (j.usage?.prompt_tokens ?? 0),
        completionTokens: s.completionTokens + (j.usage?.completion_tokens ?? 0),
      }));
      setLine({ id: ++lineId.current, text: j.line, seat: c && mode === "taunt" ? seat : undefined });
      if (hide.current) clearTimeout(hide.current);
      hide.current = setTimeout(() => setLine(null), 7000);
    } catch {
      setStats((s) => ({ ...s, calls: s.calls + 1, failed: s.failed + 1 }));
    } finally {
      busy.current = false;
    }
  }, [pack]);

  /** Feed every played event here, in order. */
  const observe = useCallback((e: GameEvent, state: GameState) => {
    if (e.kind === "roll" || e.kind === "turn" || e.kind === "checkpoint") {
      if (e.kind === "turn") {
        // Lead changes are big moments too.
        const top = [...state.players].sort((a, b) => progress(state.board, b.tile) - progress(state.board, a.tile))[0];
        if (leader.current !== null && top.seat !== leader.current && state.round > 2) {
          recent.current.push(`${character(pack, top.character).name} takes the lead!`);
          maybeFire(true, top.seat, state);
        }
        leader.current = top.seat;
      }
      return;
    }
    recent.current.push(e.msg);
    recent.current = recent.current.slice(-8);
    maybeFire(HOT.has(e.kind) || e.msg.includes(" copies "), e.seat, state, e.kind === "win");
  }, [pack]); // eslint-disable-line react-hooks/exhaustive-deps

  function maybeFire(hot: boolean, seat: number, state: GameState, force = false) {
    if (!live.current.available || !live.current.on || !hot || busy.current) return;
    if (!force && Date.now() - last.current < MIN_GAP_MS) return;
    // Half the hot moments come from the character who caused them.
    const taunt = seat >= 0 && !force && Math.random() < 0.5;
    void request(taunt ? "taunt" : "cast", seat, state);
  }

  return { available, on, setOn, line, stats, observe };
}
