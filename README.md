# AI Ludo

An AI-powered, themeable Ludo platform. Players race left to right across a generated
board, capture rivals, and use champion abilities. Claude designs whole new worlds from a
one-line theme; a fixed engine and bot simulations keep every world playable and fair.

## Layout

| Path | What it is |
|---|---|
| `packages/engine` | Pure TS game engine: board generator, rules, effect primitives, bots, simulator |
| `packages/themepack` | Theme Pack schema/validator, auto-balancer, Magic Ludo + Pirate worlds |
| `packages/net` | Online protocol types shared by client and server |
| `apps/web` | Next.js app: game (PixiJS), Balance Lab, world forge, online lobby, PWA |
| `apps/server` | WebSocket game server (server-authoritative rooms, bots, reconnects) |
| `scripts/` | `sim.ts` balance report, `render-boards.ts`, browser playtests |

## Run locally

```bash
npm install
npm run web      # http://localhost:3000
npm run server   # ws://localhost:8787 (needed for online play)
npm test         # engine, theme pack and server tests
```

Optional keys in `apps/web/.env.local` (see `.env.example`):
`ANTHROPIC_API_KEY` (AI world forge), `FAL_KEY` (painted art), `NEXT_PUBLIC_WS_URL` (game server).
Without a key, the forge offers a demo world.

Phones on the same Wi‑Fi can open `http://<your-pc-ip>:3000`; online play finds the server on the same host.

## Pages

- `/` worlds, lobby, local play (humans and bots on one device)
- `/online` rooms with invite links, one device per player
- `/create` forge a new world from a theme
- `/lab` balance simulator and tuning
- `/?watch=4` all-bot spectator game

## Deploy

- **Web:** Vercel (or any Next.js host). Set `ANTHROPIC_API_KEY`, `FAL_KEY`, and `NEXT_PUBLIC_WS_URL=wss://your-server`.
- **Game server:** any Node 20+ host with WebSockets (Railway, Fly.io, Render): `npm install && npm run start -w @ludo/server`, `PORT` env respected, health check at `/health`. Rooms live in memory, so run a single instance.
