'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { PartyBoardRenderer as BoardRenderer } from '@/lib/party-ludo/PartyBoardRenderer';
import { PartyMinimap } from './PartyMinimap';
import { ProfileAvatar } from './Profile';
import type { PlayerProfile } from '@/lib/party-ludo/profile';
import { sfx, isMuted, setMuted } from '@/lib/sfx';
import { canAct, type PartyFeed } from '@/lib/party-ludo/online';
import { Dice, type DiceHandle } from '../Dice';
import { Emblem } from '../Emblem';
import { partyPack } from '@/lib/party-ludo/data';
import { LABELS, QUESTION_BY_ID, SPICE_LABELS, type SpiceLevel } from '@/lib/party-ludo/prompts';
import { TASK_OPTIONS } from '@/lib/party-ludo/interactions';
import { availableQuestions } from '@/lib/party-ludo/spice';
import { DEFAULT_PARTY_CONFIG } from '@/lib/party-ludo/config';
import { createPartyGame, partyRendererState, partyStep, voteLeaders, type PartyAction, type PartyState } from '@/lib/party-ludo/rules';

const selectedButton = 'rounded-xl border border-accent bg-primary/30 px-4 py-3 text-left font-bold text-accent ring-2 ring-accent/50';
const button = 'rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-left transition hover:border-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40';

export default function PartyLudo() {
  const [count, setCount] = useState(2);
  const [maxSpiceLevel, setMaxSpiceLevel] = useState<SpiceLevel>(1);
  const [game, setGame] = useState<{ players: number; seed: number; maxSpiceLevel: SpiceLevel } | null>(null);
  if (game) return <Match key={`${game.seed}-${game.players}`} initial={game} onExit={() => setGame(null)}
    onRematch={() => setGame({ ...game, seed: Math.floor(Math.random() * 2 ** 31) })} />;
  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
    <Link href="/" className="text-sm text-muted">← Back to Magic Ludo</Link>
    <section onClickCapture={e => { if ((e.target as HTMLElement).closest('button,a')) sfx.click(); }} className="glass mt-8 rounded-3xl p-6 sm:p-10">
      <p className="text-xs font-semibold uppercase tracking-[.3em] text-accent">2–4 friends · Online or one device · Six rounds</p>
      <h1 className="font-display title-gradient mt-3 text-4xl font-bold sm:text-6xl">Party Ludo — Sip &amp; Roll</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2"><Link href="/party-ludo/online?mode=host" className="rounded-xl bg-primary px-6 py-4 text-center font-bold">Host room</Link><Link href="/party-ludo/online?mode=join" className="rounded-xl border border-accent px-6 py-4 text-center font-bold text-accent">Join room</Link></div>
      <p className="mt-5 text-lg">Roll the dice. Pick your path. Let the party decide what happens next.</p>
      <ol className="mt-5 list-inside list-decimal space-y-2 text-sm text-muted">
        <li>Take turns rolling and moving forward or backward.</li>
        <li>Land on Drink, Lucky, Trap, Safe, or an interactive question tile.</li>
        <li>Complete the task or draw a random penalty when you fail or skip. Review the result, then continue.</li>
      </ol>
      <p className="mt-4 text-sm text-muted">Reach the Party Finale first, or be closest after six rounds. Tied guests share the win. No combat, abilities, or extra rolls.</p>
      <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/5 p-4 text-sm">Drinking is always optional: choose water, a non-alcoholic drink, or no drink. Failed or skipped questions draw a board or sip penalty. Forced movement can activate one extra tile.</div>
      <div className="mt-6 flex flex-wrap gap-3" role="group" aria-label="Number of players">{[2, 3, 4].map(n =>
        <button key={n} aria-pressed={count === n} onClick={() => setCount(n)} className={`rounded-xl border px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${count === n ? 'border-accent bg-primary/30 font-bold text-accent ring-2 ring-accent/50' : 'border-white/15 bg-white/5 hover:border-primary hover:bg-primary/20'}`}><span aria-hidden="true" className="mr-2 inline-block w-4">{count === n ? '✓' : ''}</span>{n} players</button>)}</div>
      <p role="status" aria-live="polite" className="mt-3 text-sm text-accent">Selected: {count} players</p>
      <fieldset className="mt-6">
        <legend className="font-display text-lg text-gold">Question spice level</legend>
        <p className="mt-2 text-sm text-muted">Choose the highest level your group is comfortable with. Lower levels are included.</p>
        <div className="mt-3 flex flex-wrap gap-3" role="group" aria-label="Question spice level">{([1, 2, 3] as const).map(level => <button key={level} aria-pressed={maxSpiceLevel === level} onClick={() => setMaxSpiceLevel(level)} className={`rounded-xl border px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${maxSpiceLevel === level ? 'border-accent bg-primary/30 font-bold text-accent ring-2 ring-accent/50' : 'border-white/15 bg-white/5 hover:border-primary hover:bg-primary/20'}`}>
          <span aria-hidden="true" className="mr-2 inline-block w-4">{maxSpiceLevel === level ? '✓' : ''}</span>{SPICE_LABELS[level]}<span className="mt-1 block text-xs font-normal text-muted">{level === 1 ? 'Light and playful' : level === 2 ? 'More personal · includes Mild' : 'All levels · includes Mild & Medium'}</span>
        </button>)}</div>
        <p role="status" aria-live="polite" className="mt-3 text-sm text-muted"><span className="text-accent">Selected: {SPICE_LABELS[maxSpiceLevel]}</span> · {availableQuestions(maxSpiceLevel).length} questions available. {maxSpiceLevel === 3 && !availableQuestions(3).some(q => q.spiceLevel === 3) ? 'No level-3 questions yet; this uses Mild and Medium questions.' : 'Questions above your selected level will never be drawn.'}</p>
      </fieldset>
      <button className="mt-5 rounded-xl bg-primary px-8 py-4 font-bold" onClick={() => setGame({ players: count, seed: Math.floor(Math.random() * 2 ** 31), maxSpiceLevel })}>Play on one device</button>
    </section>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{partyPack.tiles.map(tile => <section key={tile.id} className="glass rounded-2xl p-4">
      <h2 className="font-display text-xl text-gold">{tile.name}</h2><p className="mt-2 text-sm text-muted">{tile.description}</p>
    </section>)}</div>
  </main>;
}

function Challenge({ state, busy, act, profiles }: { profiles?: PlayerProfile[]; state: PartyState; busy: boolean; act: (a: PartyAction) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const [answer, setAnswer] = useState('');
  const titleId = useId(), promptId = useId();
  const card = state.card, question = card ? QUESTION_BY_ID[card.questionId] : null;
  useEffect(() => {
    const el = dialog.current!; el.showModal(); heading.current?.focus();
    return () => el.close();
  }, []);
  useEffect(() => { heading.current?.focus(); }, [state.phase]);
  return <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={promptId}
    onCancel={e => {
      e.preventDefault(); if (busy || state.result?.trapChoice === 'pending' || state.result?.privateVote && !state.result.privateVote.done) return;
      if (state.phase === 'card') void act({ type: 'skip' });
      else if (state.result?.drink) void act({ type: 'acknowledge-drink' });
      else void act({ type: 'next' });
    }}
    className="glass fixed inset-0 m-auto max-h-[90dvh] w-[min(92vw,620px)] overflow-y-auto rounded-3xl bg-bg p-6 text-ink shadow-2xl backdrop:bg-black/75 sm:p-8">
    <p className="text-xs font-semibold uppercase tracking-[.25em] text-accent">{state.players[state.turn].name} · Round {state.round} of {state.config.rounds}</p>
    <h2 ref={heading} tabIndex={-1} id={titleId} className="font-display mt-3 text-3xl text-gold outline-none">{state.phase === 'result' ? `${state.result!.title} — Result` : LABELS[card!.category]}</h2>
    <p id={promptId} className="mt-5 text-xl leading-relaxed">{question?.text ?? state.result?.detail}</p>
    {state.phase === 'result' && state.result ? <div className="mt-5">
      {question && <p role="status" className="rounded-xl bg-primary/20 p-4 text-accent">{state.result.detail}</p>}
      {state.result.effects.length > 0 && <ul className="mt-3 space-y-2 text-sm text-muted">{state.result.effects.map((effect, i) => <li key={i}>{effect}</li>)}</ul>}
      {state.result.privateVote && <section className="mt-4 rounded-xl border border-accent/20 bg-accent/5 p-4">
        {state.result.privateVote.done ? <p role="status">All private checks are complete. Results stay private.</p> : <>
          <p className="font-bold text-accent">Private check · {state.players[state.result.privateVote.seat].name} only</p>
          {!state.result.privateVote.revealed ? <>
            <p className="mt-2 text-sm text-muted">Everyone else: look away. Pass the device to this player. Every player gets the same private check.</p>
            <button disabled={busy} className={`${button} mt-3`} onClick={() => void act({ type: 'reveal-vote' })}>I am {state.players[state.result.privateVote.seat].name} — reveal my result</button>
          </> : <>
            <p className="mt-3 text-xl">{(state.result.privateVote.selected ?? voteLeaders(state).includes(state.result.privateVote.seat)) ? 'You were selected by the group. Tied top votes also count as selected.' : 'You were not selected by the group.'}</p>
            <p className="mt-2 text-sm text-muted">Keep your result to yourself. Hide it before passing the device.</p>
            <button disabled={busy} className={`${button} mt-3`} onClick={() => void act({ type: 'hide-vote' })}>Hide my result{state.result.privateVote.seat + 1 < state.players.length ? ' and pass the device' : ' and finish'}</button>
          </>}
        </>}
      </section>}
      {state.result.trapChoice === 'pending' && <div className="mt-4">
        <p className="text-sm text-muted">Choose one consequence to continue.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button disabled={busy} className={button} onClick={() => void act({ type: 'trap-choice', choice: 'back' })}>Move backward {state.config.trapBackwardSteps} spaces</button>
          <button disabled={busy} className={button} onClick={() => void act({ type: 'trap-choice', choice: 'skip-turn' })}>Lose my next turn</button>
        </div>
      </div>}
      {state.result.drink && <p className="mt-4 text-sm text-muted">Any drink is welcome. Alcohol is optional; you can also pass.</p>}
      <button disabled={busy || !!state.result.privateVote && !state.result.privateVote.done || state.result.trapChoice === 'pending'} className="mt-5 block rounded-xl bg-primary px-6 py-3 font-bold disabled:opacity-40" onClick={() => void act({ type: state.result!.drink ? 'acknowledge-drink' : 'next' })}>{state.result.drink ? 'Got it — next player' : 'Continue to next player'}</button>
    </div> : <>
      {card?.category === 'truth' && <div className="mt-5">
        <label htmlFor={`${promptId}-answer`} className="text-sm text-muted">Your answer (kept only for this turn)</label>
        <textarea id={`${promptId}-answer`} maxLength={500} rows={3} value={answer} onChange={e => setAnswer(e.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 p-3 text-ink" placeholder="Type an answer, or answer out loud." />
        <div className="mt-3 flex flex-wrap gap-3"><button disabled={busy || !answer.trim()} className={button} onClick={() => void act({ type: 'answer', text: answer })}>Submit answer</button>
          <button disabled={busy} className={button} onClick={() => void act({ type: 'spoken' })}>Answered out loud</button></div>
      </div>}
      {card?.category === 'dare' && <div className="mt-5"><p className="text-sm text-muted">Try the task above or adapt it to your comfort. Failing or skipping draws a random penalty.</p>
        {TASK_OPTIONS[card.questionId] && <div className="mt-3 grid gap-3" role="group" aria-label="Choose your task">
          <p className="text-sm text-muted">Choose which task you will perform, then confirm completion.</p>
          {TASK_OPTIONS[card.questionId].map((option, i) => <button key={option} disabled={busy} aria-pressed={card.taskOption === i} className={card.taskOption === i ? selectedButton : button} onClick={() => void act({ type: 'task-choice', option: i as 0 | 1 })}>{card.taskOption === i ? '✓ ' : ''}{option}</button>)}
        </div>}
        <div className="mt-3 flex flex-wrap gap-3"><button disabled={busy || !!TASK_OPTIONS[card.questionId] && card.taskOption === null} className={button} onClick={() => void act({ type: 'dare', success: true })}>Challenge completed</button>
          <button disabled={busy} className={button} onClick={() => void act({ type: 'dare', success: false })}>Could not complete</button></div>
      </div>}
      {card?.category === 'likely' && <div className="mt-5">
        <p className="text-sm text-muted">Pass the device to {state.players[card!.votes.length].name}. Choose one guest. Keep it kind; self-votes are welcome.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">{state.players.map((p, i) => <button disabled={busy} key={p.character} className={button} onClick={() => void act({ type: 'vote', player: i })}>{profiles?.[i] && <span className="mb-2 block"><ProfileAvatar profile={profiles[i]} name={p.name} size={32} /></span>}Vote for {p.name}</button>)}</div>
        <p className="mt-3 text-xs text-muted">{card!.votes.length} of {state.players.length} votes recorded.</p>
      </div>}
      {card?.category === 'never' && <div className="mt-5"><p className="text-sm text-muted">Pass the device to {state.players[card!.responses.length].name}. Respond to the statement above.</p>
        <div className="mt-3 flex flex-wrap gap-3"><button disabled={busy} className={button} onClick={() => void act({ type: 'respond', response: 'have' })}>I have</button>
          <button disabled={busy} className={button} onClick={() => void act({ type: 'respond', response: 'never' })}>Never</button></div>
        <p className="mt-3 text-xs text-muted">{card!.responses.length} of {state.players.length} responses recorded. No drinks required.</p>
      </div>}
      {card?.category === 'rather' && <div className="mt-5 grid gap-3">{question!.options!.map((option, i) => <button key={option} disabled={busy} className={button} onClick={() => void act({ type: 'choose', option: i as 0 | 1 })}>{i === 0 ? 'A' : 'B'}: {option}</button>)}</div>}
      <div className="mt-7 flex flex-wrap gap-3"><button disabled={busy} className={button} onClick={() => void act({ type: 'skip' })}>Skip + random penalty</button></div>
    </>}
  </dialog>;
}

export function Match({ initial, onExit, onRematch, remote }: { initial: { players: number; seed: number; maxSpiceLevel: SpiceLevel }; onExit: () => void; onRematch: () => void; remote?: { feed: PartyFeed; connected: boolean; error?: string; act: (a: PartyAction) => Promise<void> } }) {
  const [state, setState] = useState<PartyState>(() => remote?.feed.state ?? createPartyGame(initial.players, initial.seed, DEFAULT_PARTY_CONFIG, initial.maxSpiceLevel));
  const current = useRef(state), alive = useRef(true), lock = useRef(false);
  const host = useRef<HTMLDivElement>(null), renderer = useRef<BoardRenderer | null>(null), dice = useRef<DiceHandle>(null);
  const actRef = useRef<(a: PartyAction) => Promise<void>>(async () => {});
  const stage = useRef<HTMLElement>(null);
  const [stopsOpen, setStopsOpen] = useState(false);
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [boardError, setBoardError] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let dead = false; alive.current = true;
    let board: BoardRenderer | null = null;
    void document.fonts.ready.then(async () => {
      if (dead) return;
      try {
        board = await BoardRenderer.create(host.current!, partyPack, partyRendererState(current.current), getComputedStyle(document.documentElement).getPropertyValue('--font-display') || 'serif');
        if (dead) { board.destroy(); return; }
        renderer.current = board;
        board.setInsets({ left: 16, right: 16, top: 16, bottom: 16 }); board.setActive(current.current.turn);
        await board.sync(partyRendererState(current.current));
        if (dead) return;
        board.setMoves(current.current.phase === 'move' ? current.current.moves : null, current.current.turn);
        board.onPick = index => { void actRef.current({ type: 'move', index }); };
        setReady(true);
      } catch { if (!dead) setBoardError(true); }
    });
    return () => { dead = true; alive.current = false; renderer.current = null; board?.destroy(); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const resize = () => renderer.current?.setInsets(window.innerWidth >= 1024
      ? { left: 300, right: 20, top: 76, bottom: 170 }
      : { left: 12, right: 12, top: 150, bottom: 170 });
    resize(); window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [ready]);
  const fullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.current?.requestFullscreen(); }
    catch { setError('Full screen is unavailable in this browser.'); }
  };
  const [muted, updateMuted] = useState(false);
  useEffect(() => { updateMuted(isMuted()); }, []);
  const lastRevision = useRef(remote?.feed.revision ?? -1), playback = useRef(Promise.resolve());
  const remoteRef = useRef(remote); remoteRef.current = remote;
  const allowed = !remote || remote.connected && !remote.feed.locked && canAct(state, remote.feed.seat);
  const act = async (action: PartyAction) => {
    if (remoteRef.current) {
      if (!remoteRef.current.connected || remoteRef.current.feed.locked || !canAct(current.current, remoteRef.current.feed.seat, action)) return;
      return remoteRef.current.act(action);
    }
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const before = current.current;
    try {
      const next = partyStep(before, action);
      renderer.current?.setMoves(null, before.turn);
      if (action.type === 'roll') { sfx.roll(); await dice.current?.roll(next.roll!); }
      if (!alive.current) return;
      for (const motion of next.motions) {
        if (!alive.current) return;
        renderer.current?.followMovement(motion.seat);
        if (renderer.current) await renderer.current.playEvent({ kind: 'move', seat: motion.seat, tile: motion.to, path: motion.path, msg: motion.reason }, partyRendererState(next));
      }
      if (!alive.current) return;
      if (renderer.current) {
        await renderer.current.sync(partyRendererState(next));
        if (!alive.current) return;
        renderer.current.setActive(next.turn); renderer.current.focusSeat(next.turn);
        renderer.current.setMoves(next.phase === 'move' ? next.moves : null, next.turn);
      }
      current.current = next; setState(next);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => {
    if (!remote?.feed.state || remote.feed.revision === lastRevision.current) return;
    lastRevision.current = remote.feed.revision;
    const next = remote.feed.state, action = remote.feed.action;
    playback.current = playback.current.then(async () => {
      if (!alive.current) return;
      setBusy(true);
      try {
        renderer.current?.setMoves(null, current.current.turn);
        if (action === 'roll' && next.roll !== null) { sfx.roll(); await dice.current?.roll(next.roll); }
        for (const motion of action ? next.motions : []) {
          if (!alive.current) return;
          renderer.current?.followMovement(motion.seat);
          await renderer.current?.playEvent({ kind: 'move', seat: motion.seat, tile: motion.to, path: motion.path, msg: motion.reason }, partyRendererState(next));
        }
        if (!alive.current) return;
        await renderer.current?.sync(partyRendererState(next));
        renderer.current?.setActive(next.turn); renderer.current?.focusSeat(next.turn);
        renderer.current?.setMoves(next.phase === 'move' ? next.moves : null, next.turn);
        current.current = next; setState(next);
      } catch { setError('Animation interrupted. The server state has been restored.'); current.current = next; setState(next); }
      finally { if (alive.current) setBusy(false); }
    });
  }, [remote?.feed.revision]);
  actRef.current = act;
  const canRoll = state.phase === 'roll' && !busy && allowed && (ready || boardError);
  const activeColor = partyPack.characters[state.turn].color;
  return <main ref={stage} onClickCapture={e => { if (!remote && (e.target as HTMLElement).closest('button,a,summary')) sfx.click(); }} className="fixed inset-0 isolate overflow-hidden bg-bg">
    <div ref={host} className="absolute inset-0" aria-label="Party Ludo board" />
    <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(3,2,10,.65))' }} />
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-2 sm:gap-3 sm:p-3">
      <div className="pointer-events-auto flex items-center gap-2">
        <button title="Leave game" aria-label="Leave game" disabled={busy} onClick={onExit} className="glass grid h-10 w-10 place-items-center rounded-xl text-lg">‹</button>
        <div className="glass hidden rounded-xl px-3 py-1.5 sm:block"><h1 className="font-display title-gradient text-sm font-bold">Party Ludo</h1><p className="text-[10px] uppercase tracking-[.2em] text-muted">Sip &amp; Roll</p></div>
      </div>
      <div className="glass pointer-events-auto hidden h-12 min-w-0 flex-1 overflow-hidden rounded-xl px-2 py-1 md:block"><PartyMinimap pack={partyPack} state={partyRendererState(state)} renderer={renderer.current} /></div>
      <div className="pointer-events-auto ml-auto flex flex-wrap items-center justify-end gap-1.5">
        <div className="glass hidden rounded-xl px-3 py-1.5 text-center sm:block"><p className="text-[9px] uppercase tracking-[.2em] text-muted">Round</p><p className="font-display text-base font-bold">{state.round}/{state.config.rounds}</p></div>
        <button title="Board overview" aria-label="Board overview" disabled={!ready} className="glass grid h-10 w-10 place-items-center rounded-xl" onClick={() => renderer.current?.overview()}>⤢</button>
        <button title="Follow player" aria-label="Follow player" disabled={!ready} className="glass grid h-10 w-10 place-items-center rounded-xl" onClick={() => renderer.current?.focusSeat(state.turn)}>◎</button>
        <button title="Full screen" aria-label="Full screen" className="glass grid h-10 w-10 place-items-center rounded-xl" onClick={() => void fullscreen()}>⛶</button>
        <button title={muted ? 'Unmute' : 'Mute'} aria-label={muted ? 'Unmute' : 'Mute'} className="glass grid h-10 w-10 place-items-center rounded-xl" onClick={() => { setMuted(!muted); updateMuted(!muted); }}>{muted ? '🔇' : '🔊'}</button>
        <button title="Party stops" aria-label="Party stops" aria-expanded={stopsOpen} className={`glass grid h-10 w-10 place-items-center rounded-xl ${stopsOpen ? 'border-accent text-accent' : ''}`} onClick={() => setStopsOpen(v => !v)}>☰</button>
      </div>
    </header>
    <aside aria-label="Players" className="absolute inset-x-2 top-[72px] z-10 flex gap-2 overflow-x-auto pb-2 lg:bottom-[180px] lg:left-3 lg:right-auto lg:top-[86px] lg:w-[270px] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
      {state.players.map((p, i) => {
        const color = partyPack.characters[i].color, active = state.turn === i && state.phase !== 'over';
        const total = state.board.distToFinish[state.board.starts[i]];
        const progress = Math.max(0, Math.min(100, (1 - state.board.distToFinish[p.tile] / total) * 100));
        return <section key={p.character} aria-current={active ? 'step' : undefined} className={`glass relative flex min-w-[170px] shrink-0 items-center gap-3 rounded-2xl p-2.5 transition lg:min-w-0 ${active ? '' : 'opacity-85'}`} style={{ borderColor: active ? color : undefined, boxShadow: active ? `0 0 0 1px ${color}, 0 0 28px -4px ${color}` : undefined }}>
          {remote?.feed.profiles?.[i] ? <ProfileAvatar profile={remote.feed.profiles[i]} name={p.name} size={44} /> : <Emblem c={partyPack.characters[i]} size={44} glow={active} />}
          <div className="min-w-0 flex-1"><p className="truncate font-display text-sm font-bold" style={{ color }}>{p.name}{remote?.feed.seat === i ? ' (you)' : ''}</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: color }} /></div>
            <p className="mt-1.5 text-[10px] text-muted">{state.board.distToFinish[p.tile]} steps left{p.skipTurns > 0 ? ' · Next turn lost' : ''}{p.shield ? ' · Shield' : ''}{active ? ' · Playing' : ''}</p>
          </div>
        </section>;
      })}
    </aside>
    {stopsOpen && <aside aria-label="Party stop descriptions" className="glass absolute right-3 top-[76px] z-30 max-h-[65vh] w-[min(320px,92vw)] overflow-y-auto rounded-2xl p-4"><div className="flex items-center justify-between"><h2 className="font-display text-lg text-gold">Party stops</h2><button aria-label="Close party stops" className="p-2" onClick={() => setStopsOpen(false)}>×</button></div><p className="mt-2 text-xs text-muted">Click a stop to see what happens.</p><div className="mt-3 space-y-2 text-sm">{partyPack.tiles.map(tile => <details key={tile.id} className="rounded-xl border border-white/10 bg-white/5"><summary className="cursor-pointer rounded-xl px-3 py-2">{tile.name}</summary><p className="px-3 pb-3 leading-relaxed text-muted">{tile.description}</p></details>)}</div></aside>}
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-2 p-2 sm:p-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>
      <section className="pointer-events-auto min-w-0 max-w-[calc(100%-116px)] sm:max-w-[calc(100%-160px)] lg:ml-[286px]" aria-busy={busy}>
        <div className="glass mb-2 w-fit max-w-full rounded-xl px-3 py-2 text-xs sm:text-sm"><span className="font-display font-bold" style={{ color: activeColor }}>{state.players[state.turn].name}</span> <span className="text-muted">· {SPICE_LABELS[state.maxSpiceLevel]}{remote ? ` · Room ${remote.feed.code}` : ''}</span><p role="status" aria-live="polite" className="mt-1">{busy ? 'Rolling and moving…' : remote && !remote.connected ? 'Reconnecting…' : !allowed ? 'Waiting for the other players…' : state.message}</p>{(error || remote?.error) && <p role="alert" className="mt-2 text-red-300">{error || remote?.error}</p>}</div>
        {state.phase === 'move' && <details className="glass mb-2 rounded-xl p-3"><summary className="cursor-pointer text-sm text-accent">Choose a highlighted tile · Show destinations</summary><div className="mt-2 grid max-h-[25vh] gap-2 overflow-y-auto sm:grid-cols-2">{state.moves.map((m, i) => <button key={i} disabled={busy || !allowed} className={button} onClick={() => void act({ type: 'move', index: i })}>{m.dir === 'fwd' ? 'Forward' : 'Backward'} · {partyPack.tiles.find(t => t.id === state.board.tiles[m.to].type)!.name} · Tile {m.to}</button>)}</div></details>}
        {boardError && <p className="glass rounded-xl p-2 text-xs text-muted">Board unavailable. Use the destination list to move.</p>}
      </section>
      <button disabled={!canRoll} onClick={() => void act({ type: 'roll' })} aria-label="Roll the dice" className="glass pointer-events-auto relative grid h-[104px] w-[104px] shrink-0 place-items-center rounded-[28px] disabled:cursor-default sm:h-[132px] sm:w-[132px]" style={{ borderColor: canRoll ? activeColor : undefined, boxShadow: canRoll ? `0 0 0 2px ${activeColor}, 0 0 40px -4px ${activeColor}` : undefined }}><Dice ref={dice} size={52} /><span className="absolute bottom-2 text-[10px] font-bold uppercase tracking-[.25em]" style={{ color: canRoll ? activeColor : 'var(--muted)' }}>{canRoll ? 'Roll' : state.roll ?? '·'}</span></button>
    </div>
    {!ready && !boardError && <div className="pointer-events-none absolute inset-0 grid place-items-center"><p className="font-display animate-pulse text-lg tracking-[.3em] text-muted">GETTING THE PARTY READY…</p></div>}
    {state.phase === 'over' && <section role="dialog" aria-modal="true" aria-label="Party results" className="glass absolute left-1/2 top-1/2 z-40 max-h-[80vh] w-[min(90vw,540px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl bg-bg p-8 text-center"><h2 className="font-display text-3xl text-gold">{state.winners.map(i => state.players[i].name).join(' & ')} {state.winners.length > 1 ? 'share the win!' : 'wins!'}</h2><p className="mt-4 text-muted">{state.completed} cards completed · {state.skipped} cards skipped</p><div className="mt-5 flex flex-wrap justify-center gap-3"><button className={button} disabled={!!remote && !remote.feed.host} onClick={onRematch}>{remote ? 'Return to lobby' : 'Play again'}</button><button className={button} onClick={onExit}>Leave game</button></div></section>}
    {(state.phase === 'card' || state.phase === 'result') && (!remote || allowed) && <Challenge key={`${state.turns}-${state.card?.questionId ?? 'tile'}`} state={state} busy={busy} act={act} profiles={remote?.feed.profiles} />}
  </main>;
}
