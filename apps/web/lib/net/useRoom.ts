"use client";
import type { Action, Board, GameEvent, GameState, ThemePack } from "@ludo/engine";
import { fromWire, type ClientMessage, type RoomView, type ServerMessage, type WireState } from "@ludo/net";
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
export function useRoom() {
  const ws = useRef<WebSocket | null>(null);
  const [conn, setConn] = useState<Conn>("connecting");
  const [you, setYou] = useState<{ id: string; token: string } | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [pack, setPack] = useState<ThemePack | null>(null);
  const [game, setGame] = useState<{ board: Board; initial: GameState; epoch: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listeners = useRef(new Set<(e: GameEvent[], s: GameState) => void>());
  const board = useRef<Board | null>(null);
  const pending = useRef<ClientMessage | null>(null);
  const name = useRef("");
  const closed = useRef(false);

  const send = useCallback((m: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(m));
    else pending.current = m;
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
        retry = 0;
        setConn("open");
        const s = loadSession();
        // Rejoin our seat after a drop; otherwise flush whatever the user asked for.
        if (s && (!pending.current || pending.current.t === "join")) {
          sock.send(JSON.stringify({ t: "join", code: s.code, token: s.token, name: name.current }));
          if (pending.current?.t === "join" && pending.current.code === s.code) pending.current = null;
        }
        if (pending.current) {
          sock.send(JSON.stringify(pending.current));
          pending.current = null;
        }
      };
      sock.onmessage = (ev) => {
        const m = JSON.parse(ev.data) as ServerMessage;
        handle(m);
      };
      sock.onclose = () => {
        if (closed.current) return;
        setConn(retry > 3 ? "offline" : "reconnecting");
        timer = setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
      };
    };

    const handle = (m: ServerMessage) => {
      switch (m.t) {
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
      ws.current?.close();
    };
  }, []);

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
    clearError: () => setError(null),
    feed,
    create: (n: string, p: ThemePack) => {
      name.current = n;
      saveSession(null);
      send({ t: "create", name: n, pack: p });
    },
    join: (code: string, n: string) => {
      name.current = n;
      const s = loadSession();
      send({ t: "join", code, name: n, token: s?.code === code.toUpperCase() ? s.token : undefined });
    },
    resume: (n: string) => {
      name.current = n;
      const s = loadSession();
      if (s) send({ t: "join", code: s.code, name: n, token: s.token });
    },
    hasSession: () => !!loadSession(),
    pick: (character: string | null) => send({ t: "pick", character }),
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
