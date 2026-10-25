# AI Ludo

An AI-powered, themeable Ludo platform. Players race left to right across a generated
board, capture rivals, and use champion abilities. Claude designs whole new worlds from a
one-line theme; a fixed engine and bot simulations keep every world playable and fair.

Every new game rolls a fresh board seed. An asymmetric graph grows from one to three
paths, with independent side forks, merges, bridges and wandering trails. Branches
have their own hazards and rewards. All seats enter the same shared junction, so
every route is available to everyone and starting distances stay equal. The same
seed reproduces the board for online players and replays.

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
npm run server   # ws://localhost:8787 (online play for every world)
npm test         # engine, theme pack and server tests
```

Optional keys in `apps/web/.env.local` (see `.env.example`):
`ANTHROPIC_API_KEY` (AI world forge), `FAL_KEY` (painted art), `NEXT_PUBLIC_WS_URL` (game server).
Without a key, the forge offers a demo world.

Phones on the same Wi‑Fi can open `http://<your-pc-ip>:3000`; online play finds the server on the same host.

## Pages

- `/` select a world (Magic, Party, or an AI-forged theme), then Create room or Join friends
- `/online` shared lobby: names, profiles, invite links, ready checks and host start
- `/party-ludo` opens the same home screen with Party selected
- `/party-ludo/online` compatibility entry for Party invites
- `/create` forge a new world from a theme
- `/lab` balance simulator and tuning
- `/?watch=4` all-bot spectator game

Both game modes support portrait and landscape play. `apps/web/lib/board/BoardCamera.ts`
shares camera bounds, follow behavior, zoom and touch gestures; `useGameViewport.ts`
keeps both HUDs on the same orientation breakpoint. Each renderer keeps its own
artwork and board generation. Party questions, penalties and online rules remain
in `apps/web/lib/party-ludo` and `apps/server/src/party-ludo`.

Online rooms start with the friends who joined; bots are off by default. The host
can enable bots explicitly in Magic's advanced lobby settings. Both games wait
for every player to be connected and ready. Roster/settings changes reset readiness,
and rematches return to the lobby. Local play is under “Play on one device” and
also defaults to humans.

`components/lobby` contains the shared entry form, player profiles, invite card,
room roster, readiness controls, local setup and Party spice picker. Game-specific
online adapters keep engine rules and private Party voting separate. Shared
profiles/validation live in `packages/net`; invite parsing is in `lib/lobby`.

One server hosts classic rooms at `/` and Party rooms at `/party` on port 8787.
Set `NEXT_PUBLIC_WS_URL` when deploying; Party derives its endpoint from that URL.
`NEXT_PUBLIC_PARTY_WS_URL` and `npm run server:party` remain available for a separate
legacy Party server on port 8788. Use `wss://` endpoints with HTTPS.

## Deploy

- **Web:** Vercel (or any Next.js host). Set `ANTHROPIC_API_KEY`, `FAL_KEY`, and `NEXT_PUBLIC_WS_URL=wss://your-server`.
- **Game server:** any Node 20+ host with WebSockets (Railway, Fly.io, Render): `npm install && npm run start -w @ludo/server`, `PORT` env respected, health check at `/health`. Rooms live in memory, so run a single instance.
