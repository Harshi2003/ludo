"use client";
import {
  botAction, character, createGame, reigning, step, tideLeft, tileDef, type Action, type GameEvent, type GameState, type ThemePack,
} from "@ludo/engine";
import { ANIMATION_TIMING } from "@ludo/net";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BoardRenderer } from "@/lib/board/BoardRenderer";
import { useGameViewport } from "@/lib/board/useGameViewport";
import { isMuted, setMuted, sfx } from "@/lib/sfx";
import { splitTitle } from "@/lib/worlds";
import { Dice, type DiceHandle } from "../Dice";
import { AbilityBar, Cinematic, LogDrawer, ModelStudioPanel, NarratorTicker, PlayerCards, Toasts, Victory, WorldEventBanner, type Toast } from "./hud";
import type { GameFeed } from "@/lib/net/useRoom";
import { useNarrator } from "@/lib/ai/narrator";
import { askRival } from "@/lib/ai/rival";
import { callStudio, readPref, resetStudioStats, writePref } from "@/lib/ai/studio";
import { sagaRequest, type Saga } from "@/lib/ai/saga";
import { useWorldTheme } from "@/lib/theme";
import { Minimap } from "./Minimap";
import { squadName } from "@/lib/squad";

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

const TOAST_KINDS = new Set<GameEvent["kind"]>(["capture", "blocked_capture", "tile", "trap", "ability", "ultimate", "passive", "skip", "storm", "no_moves", "effect", "win", "event_warning", "tide"]);

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
  const [worldEv, setWorldEv] = useState<GameEvent | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  useWorldTheme(pack);
  const narrator = useNarrator(pack);
  const { observe, say, available: aiReady } = narrator;
  // AI Rivals: bots choose their moves with Bitdeer and say why, in character.
  const [rivals, setRivalsState] = useState(true);
  const setRivals = useCallback((v: boolean) => { setRivalsState(v); writePref("rival", v); }, []);
  const [oracleBusy, setOracleBusy] = useState(false);
  const [saga, setSaga] = useState<Saga | "loading" | null>(null);
  useEffect(() => {
    setRivalsState(readPref("rival"));
    resetStudioStats();
  }, []);
  const [muted, setMute] = useState(isMuted());
  const [fast, setFast] = useState(false);
  const [showWin, setShowWin] = useState(false);
  const dice = useRef<DiceHandle>(null);
  const dice2 = useRef<DiceHandle>(null);
  const pick2 = pack.rules.dice === "pick2";
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
      observe(e, s);
      if (e.kind === "roll" && e.value) {
        sfx.roll();
        // Animate the faces actually thrown; modifiers can push the counted value past 6.
        const faces = e.dice ?? [Math.min(6, e.value)];
        await Promise.all([dice.current?.roll(faces[0]), faces[1] ? dice2.current?.roll(faces[1]) : undefined]);
      }
      if (e.kind === "ultimate" || e.kind === "ability") {
        e.kind === "ultimate" ? sfx.ultimate() : sfx.ability();
        if (e.kind === "ultimate" || !fast) {
          setCine(e);
          await new Promise((res) => setTimeout(res, e.kind === "ultimate" ? 1500 : 900));
          setCine(null);
        }
      }
      if (e.kind === "world_event") {
        sfx.worldEvent(e.source);
        setWorldEv(e);
        void r.playEvent(e, s);
        await new Promise((res) => setTimeout(res, fast ? 1100 : 2000));
        setWorldEv(null);
        continue;
      }
      if (e.kind === "event_warning" || e.kind === "tide") sfx.warning();
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
  }, [pack, fast, pushToast, observe]);

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
  // With AI Rivals on, Bitdeer picks among the legal moves while the bot "thinks";
  // a slow or invalid answer falls back to the built-in bot.
  useEffect(() => {
    if (online || !renderer || busy || view.phase === "over") return;
    const p = view.players[view.turn];
    if (!p.bot) return;
    let dead = false;
    const think = new Promise((res) => setTimeout(res, fast ? 250 : 1000));
    const smart = aiReady && rivals && view.phase === "move" && view.moves.length > 1;
    const brain = smart ? askRival(pack, stateRef.current, "pick", 3500) : Promise.resolve(null);
    void Promise.all([think, brain]).then(([, ai]) => {
      if (dead) return;
      if (ai) {
        if (ai.say) say(ai.say, p.seat);
        void act({ type: "move", index: ai.pick });
      } else {
        void act(botAction(pack, stateRef.current));
      }
    });
    return () => { dead = true; };
  }, [online, renderer, busy, view, act, pack, fast, aiReady, rivals, say]);

  const askOracle = useCallback(async () => {
    const s = stateRef.current;
    const at = s.events.length;
    setOracleBusy(true);
    const ai = await askRival(pack, s, "advise", 8000);
    setOracleBusy(false);
    // The turn may have moved on while the Oracle was thinking.
    if (!ai || stateRef.current.events.length !== at) return;
    say(ai.say || "This path is your best chance.", undefined, "oracle");
    rendererRef.current?.showAdvice(ai.pick);
  }, [pack, say]);

  // When the game ends, Bitdeer retells it as a legend for the victory screen.
  useEffect(() => {
    if (view.phase !== "over") {
      if (saga) setSaga(null); // online rematch reuses this screen
      return;
    }
    if (saga || !aiReady) return;
    setSaga("loading");
    void callStudio<Saga>("saga", "/api/saga", sagaRequest(pack, stateRef.current), 35_000).then((j) => setSaga(j?.story ? j : null));
  }, [view.phase, saga, aiReady, pack]);

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
  const squad = cur.pieces.length > 1;
  const humanTurn = isMine(view.turn) && view.phase !== "over";
  const curLabel = online?.label(view.turn);
  const waitingOn = curLabel?.name && !curLabel.covering ? `· ${curLabel.name} is choosing…` : "is plotting…";
  const canRoll = humanTurn && view.phase === "roll" && !busy;
  const stormAt = pack.rules.stormRound[view.players.length as 2 | 3 | 4];
  const nextEv = view.nextEvent ? pack.events?.[view.nextEvent.index] : undefined;
  const nextIn = view.nextEvent ? view.nextEvent.round - view.round : 0;
  const oneWay = pack.rules.movement === "forward";
  const tide = reigning(pack, view);
  const tideChamps = tide ? pack.characters.filter((c) => c.element === tide) : [];
  // Below this width the secondary controls fold into a "more" menu so the bar never overflows.
  const roomy = w >= 1180;
  const rolled = view.phase === "move" && view.dice ? view.dice.join(" or ") : view.roll;

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
          {oneWay ? (
            <div className={`glass hidden rounded-xl px-3 py-1.5 text-center ${portrait ? "" : "lg:block"}`} title="One-way streets: every move goes forward">
              <div className="text-[9px] uppercase tracking-[.2em] text-muted">Streets</div>
              <div className="text-sm font-bold leading-tight">→ One-way</div>
            </div>
          ) : (
            <div className={`glass hidden rounded-xl px-3 py-1.5 text-center ${portrait ? "" : "sm:block"} ${view.storm ? "border-amber-300/60" : ""}`}
              title={`${pack.rules.stormName}: backward moves end at round ${stormAt}`}>
              <div className="max-w-[110px] truncate text-[9px] uppercase tracking-[.2em] text-muted">{shortName(pack.rules.stormName)}</div>
              <div className={`text-sm font-bold leading-tight ${view.storm ? "text-amber-300" : ""}`}>{view.storm ? "⛈ Now" : `in ${stormAt - view.round}`}</div>
            </div>
          )}
          {tide && pack.rules.tides && (
            <div className={`glass hidden rounded-xl px-3 py-1.5 text-center ${portrait ? "" : "sm:block"}`} style={{ borderColor: `${tideChamps[0]?.color ?? "#fff"}88` }}
              title={`${pack.rules.tides.name}: ${tideChamps.map((c) => c.name).join(" & ") || "nobody"} moves +${pack.rules.tides.bonus} going forward`}>
              <div className="text-[9px] uppercase tracking-[.2em] text-muted">{tideLeft(pack, view) === 1 ? "Tide · last round" : `Tide · ${tideLeft(pack, view)} rounds`}</div>
              <div className="text-sm font-bold capitalize leading-tight" style={{ color: tideChamps[0]?.color }}>{tide} +{pack.rules.tides.bonus}</div>
            </div>
          )}
          {nextEv && (
            <div className={`glass hidden max-w-[150px] rounded-xl px-3 py-1.5 text-center ${portrait ? "" : "sm:block"} ${nextIn <= 1 ? "border-accent/70" : ""}`}
              title={`${nextEv.name}: ${nextEv.description}`}>
              <div className="text-[9px] uppercase tracking-[.2em] text-muted">{nextIn <= 1 ? "Next round" : `Event in ${nextIn}`}</div>
              <div className={`truncate text-sm font-bold leading-tight ${nextIn <= 1 ? "text-accent" : ""}`}>{nextEv.name}</div>
            </div>
          )}
          <IconBtn label="Overview" onClick={() => renderer?.overview()}>⤢</IconBtn>
          <IconBtn label="Follow" onClick={() => renderer?.focusSeat(stateRef.current.turn)}>◎</IconBtn>
          {roomy ? (
            <>
              {!online && <IconBtn label={fast ? "Normal speed" : "Fast bots"} active={fast} onClick={() => setFast((f) => !f)}>»</IconBtn>}
              <IconBtn label={muted ? "Unmute" : "Mute"} onClick={() => { setMuted(!muted); setMute(!muted); }}>{muted ? "🔇" : "🔊"}</IconBtn>
              <IconBtn label="AI commentary" active={aiOpen || (narrator.available && narrator.on)} onClick={() => setAiOpen((o) => !o)}>🎙</IconBtn>
            </>
          ) : (
            <div className="relative">
              <IconBtn label="More" active={moreOpen} onClick={() => setMoreOpen((o) => !o)}>⋯</IconBtn>
              <AnimatePresence>
                {moreOpen && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    className="glass absolute right-0 top-12 z-40 w-52 rounded-2xl p-1.5 text-sm">
                    {!online && <MenuItem icon="»" label={fast ? "Normal speed" : "Fast bots"} on={fast} onClick={() => setFast((f) => !f)} />}
                    <MenuItem icon={muted ? "🔇" : "🔊"} label={muted ? "Sound off" : "Sound on"} on={!muted} onClick={() => { setMuted(!muted); setMute(!muted); }} />
                    <MenuItem icon="🎙" label="AI commentary" on={aiOpen} onClick={() => { setAiOpen((o) => !o); setMoreOpen(false); }} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
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
      <div className="pointer-events-none absolute inset-x-0 z-20 px-28 sm:px-40" style={{ bottom: desktop ? 28 : 18 }}>
        <NarratorTicker pack={pack} state={view} line={narrator.line} />
      </div>
      <AnimatePresence>
        {aiOpen && (
          <ModelStudioPanel narratorOn={narrator.on} onNarrator={narrator.setOn} rivals={rivals} onRivals={setRivals}
            offline={!online} onClose={() => setAiOpen(false)} />
        )}
      </AnimatePresence>

      {/* Action dock */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2 sm:p-4"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}>
        <div className="pointer-events-auto">
          {humanTurn && view.phase === "move" && view.moves.length > 1 && aiReady && !busy && (
            <button onClick={() => void askOracle()} disabled={oracleBusy}
              className="glass mb-2 flex items-center gap-1.5 rounded-xl border-amber-300/50 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-white/10 disabled:opacity-70 sm:text-sm"
              title="Bitdeer reads the board and recommends a move">
              <span className={oracleBusy ? "animate-spin" : ""}>✦</span>
              {oracleBusy ? "The Oracle is reading the board…" : "Ask the Oracle"}
            </button>
          )}
          <AnimatePresence mode="wait">
            <motion.div key={`${view.turn}-${view.phase}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`glass mb-2 w-fit rounded-xl px-3 py-1.5 text-xs sm:text-sm ${portrait ? "max-w-[220px]" : ""}`}>
              <span className="font-display font-bold" style={{ color: cc.color }}>{squadName(cc)}</span>{" "}
              <span className="text-white/80">
                {view.phase === "over" ? "has won!" : !humanTurn ? waitingOn
                  : view.phase === "roll" ? (pick2 ? "· cast a power or roll both dice" : "· cast a power or roll")
                  : pick2 ? `· pick a die: ${rolled}` : squad ? `· move any piece to a glowing tile (${view.roll})` : `· choose a glowing tile (${view.roll})`}
              </span>
            </motion.div>
          </AnimatePresence>
          {humanTurn && <AbilityBar pack={pack} state={view} busy={busy} controllable onUse={(wch, piece) => void act({ type: "ability", which: wch, piece })} compact={!desktop} />}
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
          <div className="flex items-center gap-2" style={{ marginTop: pick2 ? -8 : 0 }}>
            <Dice ref={dice} size={pick2 ? (desktop ? 44 : 34) : desktop ? 58 : 46} />
            {pick2 && <Dice ref={dice2} size={desktop ? 44 : 34} />}
          </div>
          <span className="absolute bottom-2 text-[10px] font-bold uppercase tracking-[.25em]" style={{ color: canRoll ? cc.color : "var(--muted)" }}>
            {canRoll ? "Roll" : rolled ? (pick2 && view.phase === "move" ? rolled.toString().replace(" or ", " · ") : rolled) : "·"}
          </span>
        </motion.button>
      </div>

      <Cinematic pack={pack} state={view} e={cine} />
      <WorldEventBanner pack={pack} e={worldEv} />
      <LogDrawer pack={pack} state={view} open={logOpen} onClose={() => setLogOpen(false)} />
      {showWin && <Victory pack={pack} state={view} onHome={onExit} onRematch={online ? online.onRematch : onRematch} label={online?.label} saga={saga} />}
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

/** "The Great Sugar Crash" → "Sugar Crash": fits the chip. */
function shortName(name: string) {
  return name.replace(/^the\s+(great\s+)?/i, "").split(/\s+/).slice(0, 2).join(" ");
}

function MenuItem({ icon, label, on, onClick }: { icon: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/10 ${on ? "text-accent" : ""}`}>
      <span className="w-5 text-center">{icon}</span>
      <span className="flex-1">{label}</span>
      {on && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
    </button>
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
