import { createServer } from 'node:http';
import type { ClientMessage } from '@ludo/net';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomManager, type Peer } from './rooms';

const PORT = Number(process.env.PORT ?? 8787);
const manager = new RoomManager();

// Plain HTTP for health checks; WebSockets on the same port.
const http = createServer((req, res) => {
  res.writeHead(req.url === '/health' ? 200 : 404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: req.url === '/health', rooms: manager.rooms.size }));
});
const wss = new WebSocketServer({ server: http, maxPayload: 512 * 1024 });
const peers = new WeakMap<WebSocket, Peer>();

wss.on('connection', (ws) => {
  const peer: Peer = { send: (msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg)) };
  peers.set(ws, peer);
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
    try {
      manager.handle(peer, msg);
    } catch (err) {
      console.error('handler error', err);
      peer.send({ t: 'error', message: 'Something went wrong on the server.' });
    }
  });
  ws.on('close', () => {
    clearInterval(ping);
    manager.leave(peer);
  });
});

setInterval(() => manager.sweep(), 60_000);
http.listen(PORT, () => console.log(`AI Ludo game server on :${PORT}`));
