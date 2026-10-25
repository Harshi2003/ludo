import { createServer } from 'node:http';
import type { ClientMessage } from '@ludo/net';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms';
import { PartyRooms } from './party-ludo/rooms';

const PORT = Number(process.env.PORT ?? 8787);
const manager = new RoomManager();
const partyRooms = new PartyRooms();

// Plain HTTP for health checks; WebSockets on the same port.
const http = createServer((req, res) => {
  res.writeHead(req.url === '/health' ? 200 : 404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: req.url === '/health', rooms: manager.rooms.size, partyRooms: partyRooms.rooms.size }));
});
const wss = new WebSocketServer({ server: http, maxPayload: 512 * 1024 });

wss.on('connection', (ws, request) => {
  const party = new URL(request.url ?? '/', 'http://localhost').pathname === '/party';
  let requestError: string | undefined;
  const peer = { send: (data: unknown) => {
    const msg = typeof data === 'string' ? JSON.parse(data) : data;
    if (msg && typeof msg === 'object' && msg.t === 'error') requestError = msg.message;
    if (ws.readyState === ws.OPEN) ws.send(typeof data === 'string' ? data : JSON.stringify(data));
  } };
  let alive = true;
  ws.on('pong', () => (alive = true));
  const ping = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 20_000);

  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return peer.send({ t: 'error', message: 'Bad message.' });
    }
    requestError = undefined;
    try {
      if (party) partyRooms.handle(peer, msg); else manager.handle(peer, msg);
    } catch (err) {
      console.error('handler error', err);
      peer.send({ t: 'error', message: 'Something went wrong on the server.' });
    }
    if (typeof msg?.requestId === 'number') peer.send({ t: 'ack', requestId: msg.requestId, error: requestError });
  });
  ws.on('close', () => {
    clearInterval(ping);
    if (party) partyRooms.leave(peer); else manager.leave(peer);
  });
});

setInterval(() => manager.sweep(), 60_000);
http.listen(PORT, () => console.log(`AI Ludo server on :${PORT} (all worlds; Party at /party)`));
