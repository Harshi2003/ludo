'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ProfileAvatar, ProfilePicker } from './Profile';
import { DEFAULT_PROFILE, type PlayerProfile } from '@/lib/party-ludo/profile';
import { Match } from './PartyLudo';
import type { PartyFeed } from '@/lib/party-ludo/online';
import type { PartyAction } from '@/lib/party-ludo/rules';
import { SPICE_LABELS, type SpiceLevel } from '@/lib/party-ludo/prompts';
import { partyInviteUrl, prepareRoomEntry } from '@/lib/party-ludo/invite';
import { sfx } from '@/lib/sfx';
const button = 'rounded-xl border border-white/20 bg-primary/20 px-5 py-3 disabled:opacity-40';
export default function PartyOnline() {
  const socket = useRef<WebSocket | null>(null), stopped = useRef(false);
  const session = useRef<{ code: string; token: string } | null>(null);
  const [feed, setFeed] = useState<PartyFeed | null>(null), [connected, setConnected] = useState(false), [error, setError] = useState('');
  const [name, setName] = useState(''), [code, setCode] = useState(''), [mode, setMode] = useState<'host' | 'join' | null>(null);
  const [profile, setProfile] = useState<PlayerProfile>(DEFAULT_PROFILE), [profileBusy, setProfileBusy] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [shareMessage, setShareMessage] = useState(''), [shareUrl, setShareUrl] = useState('');

  const send = (message: unknown) => {
    if (socket.current?.readyState !== WebSocket.OPEN) { setError('Connecting to the party server. Please wait.'); return; }
    setError(''); socket.current.send(JSON.stringify(message));
  };
  useEffect(() => {
    stopped.current = false;
    const params = new URLSearchParams(location.search);
    const requestedMode = params.get('mode');
    if (requestedMode === 'host' || requestedMode === 'join') setMode(requestedMode);
    const invited = params.get('room');
    if (invited) { setCode(invited.trim().toUpperCase()); setMode('join'); }
    try { session.current = JSON.parse(sessionStorage.getItem('party:online') || 'null'); } catch {}
    if (invited && session.current?.code !== invited.trim().toUpperCase()) session.current = null;
    let timer: ReturnType<typeof setTimeout>;
    function connect() {
      const url = process.env.NEXT_PUBLIC_PARTY_WS_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8788`;
      const ws = new WebSocket(url); socket.current = ws;
      ws.onopen = () => { setConnected(true); setError(''); if (session.current) ws.send(JSON.stringify({ t: 'join', ...session.current })); };
      ws.onmessage = event => {
        const msg = JSON.parse(event.data);
        if (msg.t === 'feed') setFeed(msg.feed);
        if (msg.t === 'session') { session.current = { code: msg.code, token: msg.token }; sessionStorage.setItem('party:online', JSON.stringify(session.current)); }
        if (msg.t === 'error') setError(msg.message);
        if (msg.t === 'kicked') { setRemoved(true); stopped.current = true; session.current = null; sessionStorage.removeItem('party:online'); setFeed(null); setConnected(false); setError(msg.message); ws.close(); }
      };
      ws.onclose = () => { setConnected(false); if (!stopped.current) timer = setTimeout(connect, 1500); };
      ws.onerror = () => setError('Party server unavailable. Start the party server or check its address.');
    }
    connect();
    return () => { stopped.current = true; clearTimeout(timer); socket.current?.close(); };
  }, []);
  const leave = () => { if (feed && !feed.state && socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ t: 'leave' })); session.current = null; sessionStorage.removeItem('party:online'); location.href = '/party-ludo'; };
  const act = async (action: PartyAction) => { if (feed) send({ t: 'action', revision: feed.revision, action }); };
  const enterRoom = (kind: 'host' | 'join') => {
    try {
      if (profileBusy) throw new Error('Please wait for your profile photo to finish processing.');
      const entry = prepareRoomEntry(connected, name, kind === 'join' ? code : undefined);
      send({ t: kind === 'host' ? 'create' : 'join', ...entry, profile });
    } catch (e) { setError(e instanceof Error ? e.message : 'Check your room details.'); }
  };
  const lobbySupported = !!feed && Array.isArray(feed.ready) && Array.isArray(feed.memberIds);
  const shareInvite = async () => {
    if (!feed) return;
    const url = partyInviteUrl(location.origin, feed.code); setShareUrl(url);
    try {
      if (navigator.share) { await navigator.share({ title: 'Join my Party Ludo room', url }); setShareMessage('Invite shared.'); }
      else { await navigator.clipboard.writeText(url); setShareMessage('Invite link copied.'); }
    } catch { setShareMessage('Copy the invite link below and send it to your friends.'); }
  };
  const copyCode = async () => {
    if (!feed) return;
    try { await navigator.clipboard.writeText(feed.code); setShareMessage('Room code copied.'); }
    catch { setShareMessage('Select and copy the room code above.'); }
  };
  return <div onClickCapture={e => { if ((e.target as HTMLElement).closest('button,a')) sfx.click(); }}>
    <div className="mx-auto max-w-7xl px-4 pt-4 text-sm text-accent" role="status">{removed ? 'Removed from room' : connected ? feed ? `Room ${feed.code} · You: ${feed.names[feed.seat]}` : 'Party server connected' : 'Connecting / reconnecting…'}</div>
    {error && <p role="alert" className="mx-auto max-w-7xl px-4 py-2 text-red-300">{error} <button className="underline" onClick={leave}>Leave room</button></p>}
    <style>{`@keyframes lobby-arrive { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    {feed?.state ? <Match key={`${feed.code}-${feed.state.seed}`} initial={{ players: feed.names.length, seed: feed.state.seed, maxSpiceLevel: feed.state.maxSpiceLevel }} remote={{ feed, connected, act, error }} onExit={leave} onRematch={() => send({ t: 'rematch' })} /> :
      <main className="glass mx-auto mt-8 max-w-3xl rounded-3xl p-5 sm:p-8">
        <Link href="/party-ludo" className="text-sm text-muted">← Back to Party Ludo</Link>
        <h1 className="font-display mt-4 text-4xl text-gold">Party Ludo Online</h1>
        <p className="mt-3 text-muted">2–4 players, each on their own browser. Share the room code with your friends.</p>
        {!feed ? <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">{(['host', 'join'] as const).map(option => <button key={option} aria-pressed={mode === option} className={`${button} ${mode === option ? 'border-accent ring-2 ring-accent/50 text-accent' : ''}`} onClick={() => { setMode(option); setError(''); }}>{mode === option ? '✓ ' : ''}{option === 'host' ? 'Host room' : 'Join room'}</button>)}</div>
          {mode && <>
          <label className="block">Your player name<input required autoComplete="nickname" value={name} maxLength={18} onChange={e => setName(e.target.value)} className="mt-2 block w-full rounded-xl bg-white/10 p-3" aria-describedby="player-name-help" placeholder="Enter your player name" /></label>
          <p id="player-name-help" className="text-sm text-muted">Required: 1–18 characters. Use English letters, numbers, spaces, periods, hyphens, or underscores. This name appears on the board, turns, and voting buttons.</p>
          <ProfilePicker value={profile} onChange={setProfile} onBusy={setProfileBusy} />
          {mode === 'host' ? <button disabled={profileBusy} className={button} onClick={() => enterRoom('host')}>Create room</button> : <>
          <label className="block">Room code or invite link<input value={code} onChange={e => setCode(e.target.value)} placeholder="Paste your room code or invite link" autoCapitalize="none" autoComplete="off" spellCheck={false} className="mt-2 block w-full rounded-xl bg-white/10 p-3" /></label>
          <button disabled={profileBusy} className={button} onClick={() => enterRoom('join')}>Join room</button><p className="text-xs text-muted">12 characters: 6 letters, 4 digits, and 2 symbols. Letters are case-insensitive.</p></>}
          </>}
        </div> : <div className="mt-6 space-y-4">
          <p className="text-2xl text-accent">Room code: <span className="select-all break-all font-mono">{feed.code}</span></p>
          <div className="flex flex-wrap gap-3"><button className={button} onClick={copyCode}>Copy code</button><button className={button} onClick={shareInvite}>Share invite link</button></div>
          {shareUrl && <label className="block text-sm">Invite link<input readOnly value={shareUrl} onFocus={e => e.target.select()} className="mt-2 block w-full rounded-xl bg-white/10 p-3" /></label>}
          <p className="text-xs text-muted">Invite links use this page’s address. For friends on other devices, open the page using the host’s LAN or public address before sharing; localhost links work only on your own computer.</p>
          {shareMessage && <p role="status" className="text-sm text-accent">{shareMessage}</p>}
          <p className="text-sm text-muted">Everyone, including the host, must press Ready. Player or spice changes reset readiness.</p>
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4" aria-labelledby="lobby-players-title">
            <div className="mb-3 flex items-center justify-between gap-3"><h2 id="lobby-players-title" className="font-display text-xl text-gold">Room lobby</h2><span className="text-sm text-muted">{feed.names.length} {feed.names.length === 1 ? 'player' : 'players'}</span></div>
            <p role="status" className="mb-3 text-sm text-muted">Players appear here as they join. Scroll the list to see everyone.</p>
            <div tabIndex={0} role="region" aria-label="Lobby player list" className="max-h-[45vh] min-h-32 overflow-y-auto overscroll-contain rounded-xl pr-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              <ul className="space-y-3">{feed.names.map((n, i) => <li key={feed.memberIds?.[i] ?? i} className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 transition duration-300 motion-safe:animate-[lobby-arrive_220ms_ease-out] ${feed.ready?.[i] ? 'border-accent bg-accent/10' : 'border-transparent bg-bg/40'}`}>
                <span className="w-5 shrink-0 text-xs text-muted">{i + 1}</span><ProfileAvatar profile={feed.profiles?.[i] ?? DEFAULT_PROFILE} name={n} />
                <div className="min-w-0 flex-1"><p className="break-words font-bold">{n}{i === feed.seat && <span className="ml-2 text-xs text-accent">You</span>}</p><p className="text-xs text-muted">{i === 0 ? 'Host' : 'Guest'}</p></div>
                <span className={`rounded-lg px-2 py-1 text-xs ${feed.ready?.[i] ? 'bg-accent/15 text-accent' : 'text-muted'}`}>{feed.connected[i] ? feed.ready?.[i] ? '✓ Ready' : 'Not ready' : 'Reconnecting…'}</span>
                {feed.host && i !== 0 && <button disabled={!connected || !lobbySupported} className="rounded-lg border border-red-300/30 px-3 py-2 text-xs text-red-300 disabled:opacity-40" onClick={() => send({ t: 'kick', memberId: feed.memberIds[i] })}>Remove</button>}
              </li>)}</ul>
            </div>
            <p className="mt-3 text-xs text-muted">Invite more friends to fill the lobby. Current gameplay supports 2–4 players.</p>
          </section>
          {!lobbySupported && <p role="alert" className="rounded-xl border border-gold/40 p-3 text-sm text-gold">This room is using an older Party server without lobby readiness. After the current game, restart the Party server and create a new room.</p>}
          {feed.host ? <><label className="block">Question spice level<select disabled={!connected} value={feed.spiceLevel ?? 1} onChange={e => send({ t: 'spice', spiceLevel: Number(e.target.value) as SpiceLevel })} className="ml-3 rounded-lg bg-surface p-3">{([1, 2, 3] as const).map(l => <option key={l} value={l}>{SPICE_LABELS[l]}{l > 1 ? ' · includes lower levels' : ''}</option>)}</select></label><p className="text-sm text-muted">Spicy currently uses Mild and Medium questions.</p><button className={button} disabled={!connected || !lobbySupported || feed.names.length < 2 || feed.connected.some(c => !c) || !feed.ready?.every(Boolean)} onClick={() => send({ t: 'start', spiceLevel: feed.spiceLevel })}>Start game</button></> : <p>Waiting for the host to start.</p>}
          <button className={`w-full rounded-xl border-2 px-5 py-4 font-bold transition disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${feed.ready?.[feed.seat] ? 'border-accent bg-accent/15 text-accent ring-2 ring-accent/30' : 'border-transparent bg-white/5 text-ink hover:bg-primary/20'}`} disabled={!connected || !lobbySupported} aria-pressed={!!feed.ready?.[feed.seat]} onClick={() => send({ t: 'ready', ready: !feed.ready?.[feed.seat] })}>{feed.ready?.[feed.seat] ? '✓ Ready — click to cancel' : 'Not ready — click to ready up'}</button>
          {!feed.host && <p className="text-sm text-muted">Question spice level: {SPICE_LABELS[feed.spiceLevel ?? 1]}</p>}
          <button className={button} onClick={leave}>Leave room</button>
        </div>}
      </main>}
  </div>;
}
