"use client";
import { character, playerProgress, type GameEvent, type GameState, type ThemePack } from "@ludo/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import { squadName } from "@/lib/squad";
import { callStudio, loadStudio, readPref, writePref } from "./studio";

export interface NarratorLine {
  id: number;
  text: string;
  /** Seat of the character speaking (taunts, rival moves); undefined for the sportscaster. */
  seat?: number;
  /** "oracle": advice to the player whose turn it is. */
  kind?: "oracle";
}

const HOT = new Set<GameEvent["kind"]>(["capture", "ultimate", "world_event", "win", "blocked_capture"]);
const MIN_GAP_MS = 5000;

/**
 * Live AI commentary from Bitdeer: watches the game log, and on big moments asks
 * /api/narrate for a sportscaster line or an in-character taunt. Stays silent with no key.
 * Rivals and the Oracle also speak through it, via say().
 */
export function useNarrator(pack: ThemePack) {
  const [available, setAvailable] = useState(false);
  const [on, setOnState] = useState(true);
  const [line, setLine] = useState<NarratorLine | null>(null);
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
    setOnState(readPref("narrator"));
    void loadStudio().then((s) => setAvailable(s.enabled));
    return () => {
      if (hide.current) clearTimeout(hide.current);
    };
  }, []);

  const setOn = useCallback((v: boolean) => {
    setOnState(v);
    writePref("narrator", v);
  }, []);

  /** Shows a line in the ticker, and holds off the sportscaster so it isn't talked over. */
  const say = useCallback((text: string, seat?: number, kind?: "oracle") => {
    last.current = Date.now();
    setLine({ id: ++lineId.current, text, seat, kind });
    if (hide.current) clearTimeout(hide.current);
    hide.current = setTimeout(() => setLine(null), kind === "oracle" ? 9000 : 6000);
  }, []);

  const request = useCallback(async (mode: "cast" | "taunt", seat: number | undefined, state: GameState) => {
    busy.current = true;
    last.current = Date.now();
    const c = seat !== undefined && seat >= 0 ? character(pack, state.players[seat].character) : undefined;
    const j = await callStudio<{ line?: string }>("narrator", "/api/narrate", {
      mode: c && mode === "taunt" ? "taunt" : "cast",
      world: { name: pack.world.name, tagline: pack.world.tagline },
      speaker: c && { name: c.name, title: c.title, bio: c.bio },
      moments: recent.current,
    }, 14_000);
    if (j?.line) say(j.line, c && mode === "taunt" ? seat : undefined);
    busy.current = false;
  }, [pack, say]);

  /** Feed every played event here, in order. */
  const observe = useCallback((e: GameEvent, state: GameState) => {
    if (e.kind === "roll" || e.kind === "turn" || e.kind === "checkpoint") {
      if (e.kind === "turn") {
        // Lead changes are big moments too.
        const top = [...state.players].sort((a, b) => playerProgress(state, b.seat) - playerProgress(state, a.seat))[0];
        if (leader.current !== null && top.seat !== leader.current && state.round > 2) {
          recent.current.push(`${squadName(character(pack, top.character))} takes the lead!`);
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

  return { available, on, setOn, line, observe, say };
}
