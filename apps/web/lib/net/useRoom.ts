"use client";
import type { Action, Board, GameEvent, GameState, ThemePack } from "@ludo/engine";
import { fromWire, type PlayerProfile, type ClientMessage, type RoomView, type ServerMessage, type WireState } from "@ludo/net";
import { useCallback, useEffect, useRef, useState } from "react";

export function serverUrl() {
  const env = process.env.NEXT_PUBLIC_WS_URL;
  if (env) return env;
  const secure = location.protocol === "https:";
  return `${secure ? "wss" : "ws"}://${location.hostname}:8787`;
}

const SESSION = "ludo:session";
interface Session {
  code: string;
  token: string;
}
const loadSession = (): Session | null => {
  try {
    return JSON.parse(localStorage.getItem(SESSION) ?? "null");
  } catch {
    return null;
  }
};
const saveSession = (s: Session | null) => {
  try {
    if (s) localStorage.setItem(SESSION, JSON.stringify(s));
    else localStorage.removeItem(SESSION);
  } catch {}
};

export type Conn = "connecting" | "open" | "reconnecting" | "offline";

export interface GameFeed {
  /** Called for every batch of server events, in order. */
  subscribe(fn: (events: GameEvent[], state: GameState) => void): () => void;
}

/**
 * One room connection: reconnects with backoff and rejoins with the saved
 * token, so a refresh or a dropped phone connection lands you back in your seat.
 */
export function useRoom(inviteCode?: string) {
  const ws = useRef<WebSocket | null>(null);
  const [conn, setConn] = useState<Conn>("connecting");
  const [you, setYou] = useState<{ id: string; token: string } | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [pack, setPack] = useState<ThemePack | null>(null);
  const [game, setGame] = useState<{ board: Board; initial: GameState; epoch: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestPending, setRequestPending] = useState(false);
  const requests = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextRequest = useRef(0);
  const listeners = useRef(new Set<(e: GameEvent[], s: GameState) => void>());
  const board = useRef<Board | null>(null);
  const name = useRef("");
  const closed = useRef(false);

  const send = useCallback((m: ClientMessage) => {
    const sock = ws.current;
    if (sock?.readyState !== WebSocket.OPEN) {
      setError('Connection lost. Wait for reconnection and try again.');
      return;
    }
    const requestId = ++nextRequest.current;
    const timeout = setTimeout(() => {
      requests.current.delete(requestId);
      setRequestPending(requests.current.size > 0);
      setError('The server did not respond. Reconnecting; check the room before trying again.');
      sock.close();
    }, 5000);
    requests.current.set(requestId, timeout);
    setRequestPending(true);
    sock.send(JSON.stringify({ ...m, requestId }));
  }, []);

  useEffect(() => {
    closed.current = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout>;

    const connect = () => {
      let sock: WebSocket;
      try {
        sock = new WebSocket(serverUrl());
      } catch {
        setConn("offline");
        return;
      }
      ws.current = sock;
      sock.onopen = () => {
        if (closed.current || ws.current !== sock) return;
        retry = 0;
        setConn("open");
        const s = loadSession();
        if (s && (!inviteCode || s.code === inviteCode)) send({ t: "join", code: s.code, token: s.token, name: name.current });
      };
      sock.onmessage = (ev) => {
        if (closed.current || ws.current !== sock) return;
        const m = JSON.parse(ev.data) as ServerMessage;
        handle(m);
      };
      sock.onclose = () => {
        if (closed.current || ws.current !== sock) return;
        for (const t of requests.current.values()) clearTimeout(t);
        requests.current.clear();
        setRequestPending(false);
        setError((previous) => previous ?? 'Connection lost. Reconnecting…');
        setConn(retry > 3 ? "offline" : "reconnecting");
        timer = setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
      };
    };

    const handle = (m: ServerMessage) => {
      switch (m.t) {
        case "ack":
          clearTimeout(requests.current.get(m.requestId));
          requests.current.delete(m.requestId);
          setRequestPending(requests.current.size > 0);
          if (m.error) setError(m.error);
          break;
        case "welcome":
          setYou(m.you);
          setRoom(m.room);
          setPack(m.pack);
          setError(null);
          saveSession({ code: m.room.code, token: m.you.token });
          if (m.board && m.state) {
            board.current = m.board;
            setGame({ board: m.board, initial: fromWire(m.state, m.board), epoch: Date.now() });
          } else setGame(null);
          break;
        case "room":
          setRoom(m.room);
          if (m.room.status === "lobby") setGame(null);
          break;
        case "start":
          board.current = m.board;
          setRoom(m.room);
          setGame({ board: m.board, initial: fromWire(m.state, m.board, []), epoch: Date.now() });
          // Events from createGame (first turn) play like any update.
          queueMicrotask(() => emit(m.events, m.state));
          break;
        case "update":
          setRoom(m.room);
          emit(m.events, m.state);
          break;
        case "error":
          setError(m.message);
          if (/No room with that code/.test(m.message)) saveSession(null);
          break;
      }
    };
    const emit = (events: GameEvent[], w: WireState) => {
      if (!board.current) return;
      const s = fromWire(w, board.current);
      for (const fn of listeners.current) fn(events, s);
    };

    connect();
    return () => {
      closed.current = true;
      clearTimeout(timer);
      for (const t of requests.current.values()) clearTimeout(t);
      requests.current.clear();
      ws.current?.close();
    };
  }, [inviteCode]);

  const [feed] = useState<GameFeed>(() => ({
    subscribe: (fn) => {
      listeners.current.add(fn);
      return () => void listeners.current.delete(fn);
    },
  }));

  return {
    conn,
    you,
    room,
    pack,
    game,
    error,
    requestPending,
    clearError: () => setError(null),
    feed,
    create: (n: string, p: ThemePack, profile?: PlayerProfile) => {
      name.current = n;
      saveSession(null);
      send({ t: "create", name: n, pack: p, profile });
    },
    join: (code: string, n: string, profile?: PlayerProfile) => {
      name.current = n;
      const s = loadSession();
      send({ t: "join", code, name: n, profile, token: s?.code === code.toUpperCase() ? s.token : undefined });
    },
    resume: (n: string) => {
      name.current = n;
      const s = loadSession();
      if (s && ws.current?.readyState === WebSocket.OPEN) send({ t: "join", code: s.code, name: n, token: s.token });
    },
    hasSession: () => !!loadSession(),
    pick: (character: string | null) => send({ t: "pick", character }),
    ready: (ready: boolean) => send({ t: "ready", ready }),
    bots: (enabled: boolean) => send({ t: "bots", enabled }),
    players: (count: 2 | 3 | 4) => send({ t: "players", count }),
    start: () => send({ t: "start" }),
    rematch: () => send({ t: "rematch" }),
    act: (action: Action) => send({ t: "action", action }),
    leave: () => {
      send({ t: "leave" });
      saveSession(null);
      setRoom(null);
      setGame(null);
    },
  };
}

export type RoomApi = ReturnType<typeof useRoom>;
