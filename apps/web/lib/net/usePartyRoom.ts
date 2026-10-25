"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PartyFeed } from "../party-ludo/online";
import { serverUrl } from "./useRoom";

export function usePartyRoom(inviteCode?: string) {
  const socket = useRef<WebSocket | null>(null);
  const session = useRef<{ code: string; token: string } | null>(null);
  const [feed, setFeed] = useState<PartyFeed | null>(null);
  const [connected, setConnected] = useState(false), [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const requests = useRef(new Map<number, ReturnType<typeof setTimeout>>()), sequence = useRef(0);
  const send = useCallback((message: Record<string, unknown>) => {
    const ws = socket.current;
    if (ws?.readyState !== WebSocket.OPEN) { setError("Connection lost. Wait for reconnection and try again."); return; }
    const requestId = ++sequence.current;
    setError(""); setPending(true);
    requests.current.set(requestId, setTimeout(() => {
      requests.current.delete(requestId); setPending(requests.current.size > 0);
      setError("The room did not respond. Reconnecting…"); ws.close();
    }, 8000));
    ws.send(JSON.stringify({ ...message, requestId }));
  }, []);
  useEffect(() => {
    let disposed = false, removed = false, retry = 0;
    let timer: ReturnType<typeof setTimeout>;
    try { session.current = JSON.parse(sessionStorage.getItem("party:online") ?? "null"); } catch {}
    if (inviteCode && session.current?.code !== inviteCode) session.current = null;
    const clearRequests = () => { for (const timer of requests.current.values()) clearTimeout(timer); requests.current.clear(); setPending(false); };
    const connect = () => {
      const url = new URL(serverUrl()); url.pathname = `${url.pathname.replace(/\/$/, "")}/party`;
      const ws = new WebSocket(process.env.NEXT_PUBLIC_PARTY_WS_URL || url.toString()); socket.current = ws;
      ws.onopen = () => { if (disposed) return; retry = 0; setConnected(true); setError(""); if (session.current) send({ t: "join", ...session.current }); };
      ws.onmessage = event => {
        if (disposed || socket.current !== ws) return;
        const message = JSON.parse(event.data);
        if (message.t === "ack") { clearTimeout(requests.current.get(message.requestId)); requests.current.delete(message.requestId); setPending(requests.current.size > 0); if (message.error) setError(message.error); }
        if (message.t === "feed") { setFeed(message.feed); clearRequests(); }
        if (message.t === "session") { session.current = { code: message.code, token: message.token }; try { sessionStorage.setItem("party:online", JSON.stringify(session.current)); } catch {} }
        if (message.t === "error") { setError(message.message); clearRequests(); if (/not found|expired|does not exist/i.test(message.message)) { session.current = null; sessionStorage.removeItem("party:online"); } }
        if (message.t === "kicked") { removed = true; session.current = null; sessionStorage.removeItem("party:online"); setFeed(null); setError(message.message); ws.close(); }
      };
      ws.onclose = () => { if (disposed || socket.current !== ws) return; setConnected(false); clearRequests(); if (!removed) timer = setTimeout(connect, Math.min(8000, 500 * 2 ** retry++)); };
      ws.onerror = () => { if (!disposed) setError("Can't connect to the room. Please try again in a moment."); };
    };
    connect();
    return () => { disposed = true; clearTimeout(timer); for (const timer of requests.current.values()) clearTimeout(timer); requests.current.clear(); socket.current?.close(); };
  }, [inviteCode, send]);
  const leave = () => {
    if (feed && !feed.state) send({ t: "leave" });
    session.current = null; try { sessionStorage.removeItem("party:online"); } catch {}
    setFeed(null);
  };
  return { feed, connected, error, pending, send, leave };
}
