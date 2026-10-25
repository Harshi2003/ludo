"use client";
import {
  botAction, character, createGame, step, tileDef, type Action, type GameEvent, type GameState, type ThemePack,
} from "@ludo/engine";
import { ANIMATION_TIMING } from "@ludo/net";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BoardRenderer } from "@/lib/board/BoardRenderer";
import { useGameViewport } from "@/lib/board/useGameViewport";
import { isMuted, setMuted, sfx } from "@/lib/sfx";
import { splitTitle } from "@/lib/worlds";
import { Dice, type DiceHandle } from "../Dice";
import { AbilityBar, Cinematic, LogDrawer, PlayerCards, Toasts, Victory, type Toast } from "./hud";
import type { GameFeed } from "@/lib/net/useRoom";
import { Minimap } from "./Minimap";

/** Online play: the server owns the state; this client controls only its own seats. */
export interface OnlineBinding {
  initial: GameState;
  feed: GameFeed;
  mine: (seat: number) => boolean;
  send: (a: Action) => void;
  /** Who's behind a seat: a player name, or null for a bot. */
  label: (seat: number) => { name: string | null; covering: boolean };
  onRematch?: () => void;
  error: string | null;
  clearError: () => void;
  conn: string;
}

export interface GameConfig {
  seed: number;
  players: { character: string; bot: boolean }[];
}

const TOAST_KINDS = new Set<GameEvent["kind"]>(["capture", "blocked_capture", "tile", "trap", "ability", "ultimate", "passive", "skip", "storm", "no_moves", "effect", "win"]);

export default function Game({ pack, config, onExit, onRematch, online }: {
  pack: ThemePack; config?: GameConfig; onExit: () => void; onRematch?: () => void; online?: OnlineBinding;
}) {
  const stateRef = useRef<GameState>(null as unknown as GameState);
  if (!stateRef.current) {
    stateRef.current = online ? structuredClone(online.initial) : createGame(pack, { seed: config!.seed, players: config!.players });
  }
  const isMine = useCallback((seat: number) => (online ? online.mine(seat) : !stateRef.current.players[seat].bot), [online]);
  const rendererRef = useRef<BoardRenderer | null>(null);
  const queue = useRef<{ events: GameEvent[]; state: GameState }[]>([]);
  const pumping = useRef(false);
  const [view, setView] = useState<GameState>(() => structuredClone(stateRef.current));
  const [renderer, setRenderer] = useState<BoardRenderer | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const seen = useRef(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [cine, setCine] = useState<GameEvent | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [muted, setMute] = useState(isMuted());
  const [fast, setFast] = useState(false);
  const [showWin, setShowWin] = useState(false);
  const dice = useRef<DiceHandle>(null);
  const host = useRef<HTMLDivElement>(null);
  const toastId = useRef(0);
  const { w, h, portrait, desktop } = useGameViewport();

  // Mount the Pixi board once.
  useEffect(() => {
    let dead = false;
    let r: BoardRenderer | null = null;
    const font = getComputedStyle(document.documentElement).getPropertyValue("--font-display") || "serif";
    void document.fonts.ready.then(() =>
      BoardRenderer.create(host.current!, pack, stateRef.current, font).then((x) => {
        if (dead) return x.destroy();
        r = x;
        x.setActive(stateRef.current.turn);
        x.focusSeat(stateRef.current.turn);
        rendererRef.current = x;
        setRenderer(x);
      }),
    );
    return () => {
      dead = true;
      r?.destroy();
    };
  }, [pack]);

  useEffect(() => {
    renderer?.setPortrait(portrait);
    renderer?.setInsets(desktop ? { left: 300, right: 20, top: 70, bottom: 120 } : { left: 0, right: 0, top: portrait ? 126 : 66, bottom: portrait ? 170 : 96 });
  }, [renderer, desktop, portrait, w, h]);

  useEffect(() => renderer?.setSpeed(fast ? 2 : 1), [renderer, fast]);

  const pushToast = useCallback((e: GameEvent) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, e }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), e.kind === "win" ? 6000 : 3200);
  }, []);

  const play = useCallback(async (events: GameEvent[], r: BoardRenderer) => {
    const s = stateRef.current;
    for (const e of events) {
      if (e.kind === "roll" && e.value) {
        sfx.roll();
        await dice.current?.roll(e.value);
      }
      if (e.kind === "ultimate" || e.kind === "ability") {
        e.kind === "ultimate" ? sfx.ultimate() : sfx.ability();
        if (e.kind === "ultimate" || !fast) {
          setCine(e);
          await new Promise((res) => setTimeout(res, e.kind === "ultimate" ? 1500 : 900));
          setCine(null);
        }
      }
      if (e.kind === "turn") sfx.turn();
      if (e.kind === "capture") sfx.capture();
      if (e.kind === "blocked_capture") sfx.shield();
      if (e.kind === "tile" && e.tile !== undefined) sfx.tile(tileDef(pack, s, e.tile)?.category !== "harmful");
      if (e.kind === "win") sfx.win();
      if (TOAST_KINDS.has(e.kind) && !(e.kind === "effect" && !e.targets?.length && !e.msg.includes("extra"))) pushToast(e);
      if (e.kind === "move" && e.path) e.path.forEach((_, i) => setTimeout(() => sfx.hop(i), (i * ANIMATION_TIMING.stepMs) / (fast ? 2 : 1)));
      await r.playEvent(e, s);
    }
    await r.sync(s);
  }, [pack, fast, pushToast]);

  const act = useCallback(async (a: Action) => {
    if (busyRef.current || !renderer) return;
    busyRef.current = true;
    setBusy(true);
    renderer.setMoves(null, 0);
    if (online) {
      // The server answers with an update; the queue below plays it.
      online.send(a);
      return;
    }
    const s = stateRef.current;
    try {
      step(pack, s, a);
    } catch (err) {
      console.error(err);
    }
    const events = s.events.slice(seen.current);
    seen.current = s.events.length;
    setView(structuredClone(s));
    await play(events, renderer);
    setView(structuredClone(s));
    busyRef.current = false;
    setBusy(false);
    if (s.phase === "over") setTimeout(() => setShowWin(true), 900);
  }, [pack, play, renderer]);

  // Online: play server updates strictly in order, one batch at a time.
  const pump = useCallback(async () => {
    const r = rendererRef.current;
    if (pumping.current || !r) return;
    pumping.current = true;
    busyRef.current = true;
    setBusy(true);
    while (queue.current.length) {
      const { events, state } = queue.current.shift()!;
      stateRef.current = { ...state, events: [...stateRef.current.events, ...events] };
      setView(structuredClone(stateRef.current));
      await play(events, r);
    }
    setView(structuredClone(stateRef.current));
    pumping.current = false;
    busyRef.current = false;
    setBusy(false);
    if (stateRef.current.phase === "over") setTimeout(() => setShowWin(true), 900);
  }, [play]);

  useEffect(() => {
    if (!online) return;
    return online.feed.subscribe((events, state) => {
      queue.current.push({ events, state });
      void pump();
    });
  }, [online, pump]);

  useEffect(() => {
    if (renderer && queue.current.length) void pump();
  }, [renderer, pump]);

  // A rejected action (e.g. out of turn) must not leave the controls locked.
  useEffect(() => {
    if (!online?.error) return;
    pushToast({ kind: "no_moves", seat: -1, msg: online.error });
    online.clearError();
    if (!pumping.current) {
      busyRef.current = false;
      setBusy(false);
    }
  }, [online, online?.error, pushToast]);

  // Bots take their turns on their own (offline only; the server runs them online).
  useEffect(() => {
    if (online || !renderer || busy || view.phase === "over") return;
    const p = view.players[view.turn];
    if (!p.bot) return;
    const t = setTimeout(() => act(botAction(pack, stateRef.current)), fast ? 250 : 1000);
    return () => clearTimeout(t);
  }, [online, renderer, busy, view, act, pack, fast]);

  // Highlight legal destinations for humans.
  useEffect(() => {
    if (!renderer) return;
    const human = isMine(view.turn) && view.phase === "move" && !busy;
    renderer.setMoves(human ? view.moves : null, view.turn);
    renderer.onPick = (i) => { sfx.click(); void act({ type: "move", index: i }); };
    // Test hook for automated playtests.
    if (process.env.NODE_ENV !== "production") (window as unknown as { __ludo: unknown }).__ludo = { state: () => stateRef.current, pick: renderer.onPick };
  }, [renderer, view, busy, act, isMine]);

  // Keyboard: space/enter rolls.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.key === " " || e.key === "Enter") && isMine(stateRef.current.turn) && stateRef.current.phase === "roll") {
        e.preventDefault();
        void act({ type: "roll" });
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [act, isMine]);

  const cur = view.players[view.turn];
  const cc = character(pack, cur.character);
  const humanTurn = isMine(view.turn) && view.phase !== "over";
  const curLabel = online?.label(view.turn);
  const waitingOn = curLabel?.name && !curLabel.covering ? `— ${curLabel.name} is choosing…` : "is plotting…";
  const canRoll = humanTurn && view.phase === "roll" && !busy;
  const stormAt = pack.rules.stormRound[view.players.length as 2 | 3 | 4];

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-bg">
      <div ref={host} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(3,2,10,.65))" }} />

      {/* Top bar */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-2 sm:gap-3 sm:p-3 ${portrait ? "flex-wrap" : ""}`} style={{ paddingTop: "max(env(safe-area-inset-top), 8px)" }}>
        <div className="pointer-events-auto flex items-center gap-2">
          <button onClick={onExit} className="glass grid h-10 w-10 place-items-center rounded-xl text-lg" aria-label="Leave game">‹</button>
          {desktop && (
            <div className="glass rounded-xl px-3 py-1.5">
              <div className="font-display text-sm font-bold leading-tight title-gradient">{splitTitle(pack.world.name)[0]}</div>
              <div className="max-w-[220px] truncate text-[10px] uppercase tracking-[.2em] text-muted">{splitTitle(pack.world.name)[1] ?? pack.world.tagline}</div>
            </div>
          )}
        </div>
        {!desktop && <div className={`pointer-events-auto ${portrait ? "order-last flex w-full justify-center" : ""}`}><PlayerCards pack={pack} state={view} compact label={online?.label} /></div>}
        <div className={`glass pointer-events-auto hidden h-12 min-w-0 flex-1 overflow-hidden rounded-xl px-2 py-1 ${portrait ? "" : "md:block"}`}>
          <Minimap pack={pack} state={view} renderer={renderer} />
        </div>
        <div className="pointer-events-auto ml-auto flex items-center gap-1.5">
          <div className={`glass hidden rounded-xl px-3 py-1.5 text-center ${portrait ? "" : "sm:block"}`}>
            <div className="text-[9px] uppercase tracking-[.2em] text-muted">Round</div>
            <div className="font-display text-base font-bold leading-tight">{view.round}</div>
          </div>
          <div className={`glass hidden rounded-xl px-3 py-1.5 text-center ${portrait ? "" : "sm:block"} ${view.storm ? "border-amber-300/60" : ""}`}
            title={`${pack.rules.stormName}: backward moves end at round ${stormAt}`}>
            <div className="text-[9px] uppercase tracking-[.2em] text-muted">Storm</div>
            <div className={`text-sm font-bold leading-tight ${view.storm ? "text-amber-300" : ""}`}>{view.storm ? "⛈ Now" : `in ${stormAt - view.round}`}</div>
          </div>
          <IconBtn label="Overview" onClick={() => renderer?.overview()}>⤢</IconBtn>
          <IconBtn label="Follow" onClick={() => renderer?.focusSeat(stateRef.current.turn)}>◎</IconBtn>
          {!online && <IconBtn label={fast ? "Normal speed" : "Fast bots"} active={fast} onClick={() => setFast((f) => !f)}>»</IconBtn>}
          <IconBtn label={muted ? "Unmute" : "Mute"} onClick={() => { setMuted(!muted); setMute(!muted); }}>{muted ? "🔇" : "🔊"}</IconBtn>
          <IconBtn label="Chronicle" active={logOpen} onClick={() => setLogOpen((o) => !o)}>☰</IconBtn>
        </div>
      </div>

      {desktop && (
        <div className="absolute left-3 top-[86px] w-[270px]">
          <PlayerCards pack={pack} state={view} compact={false} label={online?.label} mine={online ? isMine : undefined} />
        </div>
      )}

      <div className={`pointer-events-none absolute inset-x-0 z-20 ${portrait ? "top-[126px]" : "top-[70px] sm:top-[84px]"}`}>
        <Toasts pack={pack} state={view} toasts={toasts} />
      </div>

      {/* Action dock */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2 sm:p-4"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}>
        <div className="pointer-events-auto">
          <AnimatePresence mode="wait">
            <motion.div key={`${view.turn}-${view.phase}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`glass mb-2 w-fit rounded-xl px-3 py-1.5 text-xs sm:text-sm ${portrait ? "max-w-[220px]" : ""}`}>
              <span className="font-display font-bold" style={{ color: cc.color }}>{cc.name}</span>{" "}
              <span className="text-white/80">
                {view.phase === "over" ? "has won!" : !humanTurn ? waitingOn : view.phase === "roll" ? "— cast an ability or roll" : `— choose a glowing tile (${view.roll})`}
              </span>
            </motion.div>
          </AnimatePresence>
          {humanTurn && <AbilityBar pack={pack} state={view} busy={busy} controllable onUse={(wch) => void act({ type: "ability", which: wch })} compact={!desktop} />}
        </div>
        <motion.button
          disabled={!canRoll}
          onClick={() => void act({ type: "roll" })}
          whileHover={canRoll ? { scale: 1.05 } : undefined}
          whileTap={canRoll ? { scale: 0.92 } : undefined}
          className="glass pointer-events-auto relative grid place-items-center rounded-[28px] disabled:cursor-default"
          style={{
            width: desktop ? 132 : portrait ? 88 : 104, height: desktop ? 132 : portrait ? 88 : 104, flexShrink: 0,
            borderColor: canRoll ? cc.color : undefined,
            boxShadow: canRoll ? `0 0 0 2px ${cc.color}, 0 0 40px -4px ${cc.color}` : undefined,
          }}
          aria-label="Roll the dice"
        >
          <Dice ref={dice} size={desktop ? 58 : 46} />
          <span className="absolute bottom-2 text-[10px] font-bold uppercase tracking-[.25em]" style={{ color: canRoll ? cc.color : "var(--muted)" }}>
            {canRoll ? "Roll" : view.roll ? view.roll : "·"}
          </span>
        </motion.button>
      </div>

      <Cinematic pack={pack} state={view} e={cine} />
      <LogDrawer pack={pack} state={view} open={logOpen} onClose={() => setLogOpen(false)} />
      {showWin && <Victory pack={pack} state={view} onHome={onExit} onRematch={online ? online.onRematch : onRematch} label={online?.label} />}
      {online && online.conn !== "open" && (
        <div className="glass absolute left-1/2 top-20 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-sm text-amber-200" role="status">
          {online.conn === "offline" ? "Connection lost. Retrying…" : "Reconnecting…"}
        </div>
      )}

      {!renderer && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="font-display animate-pulse text-lg tracking-[.3em] text-muted">FORGING THE REALM…</div>
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, label, onClick, active }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} title={label} aria-label={label}
      className={`glass grid h-10 w-10 place-items-center rounded-xl text-base transition-colors hover:bg-white/10 ${active ? "border-accent/70 text-accent" : ""}`}>
      {children}
    </button>
  );
}
