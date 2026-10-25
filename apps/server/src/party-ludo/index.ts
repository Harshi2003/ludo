import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { PartyRooms } from './rooms';
const rooms = new PartyRooms();
const server = createServer((req, res) => { res.writeHead(req.url === '/health' ? 200 : 404); res.end(req.url === '/health' ? 'Party Ludo OK' : 'Not found'); });
const sockets = new WebSocketServer({ server, maxPayload: 96 * 1024 });
sockets.on('connection', ws => {
  const peer = { send: (data: string) => { if (ws.readyState === ws.OPEN) ws.send(data); } };
  let alive = true;
  ws.on('pong', () => alive = true);
  const ping = setInterval(() => { if (!alive) return ws.terminate(); alive = false; ws.ping(); }, 20000);
  ws.on('message', bytes => { try { rooms.handle(peer, JSON.parse(String(bytes))); } catch { peer.send(JSON.stringify({ t: 'error', message: 'Invalid message.' })); } });
  ws.on('close', () => { clearInterval(ping); rooms.leave(peer); });
});
const port = Number(process.env.PARTY_PORT || 8788);
server.listen(port, '0.0.0.0', () => console.log(`Party Ludo server listening on :${port}`));
