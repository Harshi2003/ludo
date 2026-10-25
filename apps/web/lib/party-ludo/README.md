# Party Ludo — mixed tiles and bounded penalties

## Shared friends-first lobby

Party is a built-in world in the main Worlds shelf. All themes use `/online` with
`components/lobby` for entry, profiles, invites, rosters, readiness and starting.
`npm run server` serves both classic and Party rooms, using `/party` for the Party
WebSocket endpoint. `server:party` is an optional legacy deployment only.
The older implementation notes below describe the original separate setup.

## Shared integration

Party Ludo now uses the shared `../board/BoardCamera.ts` and
`../board/useGameViewport.ts` alongside Magic/Pirate. Portrait screens project the
route vertically, keep illustrations and tokens upright, and use the same camera
bounds, gentle follow, zoom and touch controls. Party-specific lounge artwork,
route generation, challenges, penalties, profiles and online protocol stay in
their existing modules. Movement playback is synchronized with the current shared
renderer, including `ANIMATION_TIMING`, with Party hop sound retained.
The Party server uses the same timing constants to keep turns locked during playback.

Run `npm run server` from the root for online play in every world. Party uses
the same host and port with `/party`; `NEXT_PUBLIC_PARTY_WS_URL` is an optional
override for separate deployments.
The sections below record the original Party implementation and its verification;
references to untouched shared files describe that original isolated change.

## Launch

Run `npm run web` from the project root, then open http://localhost:3000/party-ludo. Refresh an existing Party tab and start a new game after updating code. No JSON import, API key, new dependency, or online service is needed. Play locally with 2–4 humans on one device; refreshing discards the match.

## Board mix

`config.ts` is the single source for rebalancing weights and movement/turn parameters. Default layout weights total 100:

| Tile | Weight | Primary effect |
| --- | --- | --- |
| Drink | 12 | Offer 1 sip, water/non-alcoholic drink, or no-drink participation |
| Everyone Drinks | 8 | Everyone may take 1 sip; each guest can independently choose water or no drink |
| Truth | 10 | Type an answer or answer out loud |
| Dare / Challenge | 10 | Complete a concrete task, fail it, or skip |
| Most Likely To | 10 | One vote per guest; tied votes share the result |
| Never Have I Ever | 8 | Each guest answers I have or Never |
| Would You Rather | 8 | Choose between two options |
| Lucky | 12 | Move forward 2 spaces; activate at most one secondary tile |
| Trap | 12 | Choose: move back 2 spaces or lose the next scheduled turn |
| Safe | 10 | Nothing happens |

Types are allocated over eligible individual tiles by largest remainder, then shuffled with a seed. Tiles in the same column can have different types; lanes no longer repeat a mirrored layout. Entrances and the finish are always Safe, so actual board proportions differ slightly from target weights. Landing frequencies also depend on dice and player route choices; layout weights are not drinking-consumption rates.

## Challenge penalties

A failed or skipped question draws exactly one random penalty. Completed answers/tasks do not draw a penalty; personal answers and vote winners have no right/wrong penalty.

| Outcome | Weight |
| --- | --- |
| Move backward 1–3 spaces, uniformly selected | 45 |
| Offer 1 optional sip with equivalent alternatives | 25 |
| Lose the next scheduled turn | 20 |
| Swap positions with a randomly selected other player | 10 |

Weights are relative; they need not total 100 after rebalancing. Every known key must be provided, values must be finite and nonnegative, and each weight table needs a positive total. `backwardMin`, `backwardMax`, `trapBackwardSteps`, `luckyForwardSteps`, and `rounds` are configurable. Configuration is validated and copied at game creation. The legacy `trapSkipChance` field is retained for compatibility but no longer decides primary Trap outcomes; the player chooses. A primary Trap blocks Continue and Escape dismissal until a choice is made. Movement uses the existing animation and may activate one secondary tile.

An optional sip never forces alcohol, requires proof, or creates another penalty for choosing water/no drink. A group confirmation means everyone chose freely, not that everyone drank. Drink choices do not redraw outcomes or repeat movement.

## One-secondary-landing limit

Normal moves activate their primary tile. A penalty movement, swap, Trap retreat, or Lucky advance can then activate **one** secondary landing effect:

- Drink / Everyone Drinks: offer the usual fully optional participation choices.
- Safe: no effect.
- Trap: queue one lost turn; never move again.
- Lucky: award a shield against the next challenge penalty or Trap; never move again.
- Any question tile: do not open or consume a question.

Only the active guest's destination is activated after a swap. The other guest moves but does not trigger a separate tile. If no movement was possible, no secondary landing is activated. The secondary resolver contains no movement or question-draw calls, so it cannot recurse into another chain. A Lucky shield is consumed to cancel one future challenge penalty or Trap, then disappears. Drink tiles remain optional regardless of shields.

Lost turns are scheduled slots: the next turn for that guest displays a Turn skipped result and is consumed once without a roll, movement, question, or drink. Multiple effects queue at most one lost turn at a time. These slots count toward the existing six-round match length. First to the Finale wins after acknowledging the result; otherwise the closest guest after the final round wins, and distance ties share the win.

## Animation and UI isolation

The existing layout, colors, glass cards, dice, board visuals, and renderer are reused. Only Party-specific files changed. `motions` records normal movement, forced paths, and both sides of a swap in order. The Party component passes each path through the isolated `PartyBoardRenderer.playEvent()` at its original default speed, then reconciles positions and opens the result. The dice still calls the untouched original `Dice.roll()` implementation. There are no custom animation replacements or duration/speed overrides.

Magic/Pirate data, shared engine code, existing game UI, Dice, BoardRenderer, global CSS, Food Quest, and AI prompts were not edited. Existing world/lobby storage is not used. No commit, push, or merge was performed.

## Questions and spice metadata

The existing 50 questions are byte-for-byte unchanged: 10 per category, with stable IDs and per-entry provenance. See `THIRD_PARTY_NOTICES.md` for the checked source formats, MIT notice, adaptation policy, and reasons the other requested sources were not copied. No questions repeat in one game. Exhausted categories draw another unused category; all 50 used means a Safe result instead of repetition. A secondary question landing does not consume an ID.

Before starting, players choose a maximum question spice level: Mild (level 1, default), Medium (levels 1–2), or Spicy (levels 1–3). The collection currently contains 45 Mild, 5 Medium, and 0 Spicy questions; four contextual classifications require review. The setup shows available counts and explains that Spicy currently uses Mild and Medium questions. Category fallback obeys the same ceiling, exhausted eligible questions become Safe, and rematches retain the selection. No question generation is used. Higher spice never permits unsafe or coercive content.

## Verification

```sh
npm test
node_modules/.bin/tsc --noEmit --incremental false -p apps/web/tsconfig.json
```

91 tests passed across eleven files (30 Party tests plus all existing engine, ThemePack, server, and Food Quest tests). Checks cover configuration, layout mix, regular forward/backward legal paths, all question interactions, 1–3-space retreats and path boundaries, direct/secondary drink alternatives, swap animations' motion records, Lucky/Trap effects, shield consumption, exactly one lost turn, final-result acknowledgement, question exhaustion, and no-repeat/no-chain invariants through 100 complete games each for 2/3/4 players.

The exact Dare -> failure -> backward 3 -> Drink -> no-drink -> next turn sequence is covered by a deterministic rule test. Secondary question, Trap, Lucky, and Safe destinations are tested to ensure no second movement or challenge starts. A 40,000-draw seeded frequency check yielded Back 17,869 (44.67%), Sip 10,197 (25.49%), Lost turn 7,942 (19.86%), Swap 3,992 (9.98%). This tests the configured draw, not subjective fun or human drinking behavior.

Desktop Chrome verified normal forward movement, Safe and direct Drink tiles, no-drink participation, a random swap followed by a secondary Drink, and regular backward movement onto a Dare followed by failure, a random one-space retreat, and a secondary Drink. The existing animations played before the result popup. Full 2/3/4-player outcomes and all other effect branches are covered by automated tests; a full new manual match and mobile layout were not rechecked in this update.

Checksum comparisons confirmed protected shared sources, all Food Quest files, Magic/Pirate, AI code, reused animation/UI sources, and `prompts.ts` remained unchanged.


## Party lounge illustrations and irregular maps

`PartyBoardRenderer.ts` is an isolated presentation fork of the shared renderer. Magic forests, floating islands, and the crystal castle are removed only here; the lounge background remains fully visible, and the finish is a neon bar counter. `tile-art.ts` draws ten local vector illustrations inside the original tile frames: a cocktail, clinking glasses, speech bubble, microphone, ballot box, raised hand, signpost, clover, trap, and sofa. The global UI, original renderer, Dice, engine, and other worlds remain untouched.

The copied `playEvent`, hop, teleport, and flyToken implementations are byte-identical to the original, enforced by a regression test. The Party renderer's overview can zoom out far enough to fit the longer randomized layouts. Future shared animation changes should be explicitly reviewed and synchronized; the regression test detects drift.

`board.ts` shuffles crossing/branch/merge/lane zone order, randomizes zone lengths, varies column spacing, and adds asymmetric bends and per-tile offsets. These change the graph plans as well as appearance. Graph movement still uses the existing engine path helpers. Starts retain equal distance to the finish, every tile remains reachable, forward edges remain acyclic, and tile centers remain separated. The same seed reproduces the map; new games choose a new seed.

300 generated boards (100 each for 2/3/4 players) were checked for reachability, reciprocal edges, equal start distances, finite geometry, and tile spacing. The existing 300 full-game rule simulations also pass on these new boards. Desktop Chrome verified the lounge backdrop, new illustrations, irregular route, original dice and piece movement, and next-player progression. The setup spice selector filters question draws without changing board generation, dice animation, movement, or penalties.

Alternative Dare tasks are declared in `interactions.ts`: players select the performance or description before confirming success. The reducer rejects completion without the required selection and records the selected task in the result. Failure and skip remain available. Drink participation choices visibly highlight the selected option.

Party route generation now uses an independent layered graph in `board.ts`, with randomized two- and three-way forks, merges, occasional adjacent-lane connections, run lengths, and geometry. Every start/rematch already supplies a fresh random seed; the tile bag is shuffled independently. Every generated board includes both two- and three-way choices with no more than three outgoing edges per tile. All forward edges advance one logical column, preserving equal start-to-finish distances and existing forward/backward animation helpers. The shared board generator is unchanged.

Most Likely To results use private pass-and-play checks for every participant in fixed seat order, so the handoff does not single out a selected player. Each player explicitly reveals only their own selected/not-selected result, then hides it before the next check. Tied leaders each see selected; no names, tallies, or winner lists appear in the shared result. Continue and Escape dismissal are blocked until all checks finish. This relies on other players looking away on a shared device; it is not authenticated or secure against device inspection.

Drink results now show a single instruction to sip your own drink, plus one “Got it — next player” acknowledgement. No beverage selection is required. Alcohol remains optional and players may pass. The same acknowledgement handles direct tiles, random sip penalties, and secondary Drink landings without adding movement or penalties. Legacy drink-choice reducer actions remain compatible, but are no longer shown in the interface.

## Online Party Ludo and playback

Run the independent Party server from the repository root:

```sh
node --import tsx apps/server/src/party-ludo/index.ts
```

In another terminal run `npm run web`. Open `http://localhost:3000/party-ludo/online` (also linked from Party setup). Create a room, then have each guest join using the code in their own browser. The host starts with 2–4 connected players and selects the spice ceiling. For other computers on the same LAN use `http://<host-LAN-IP>:3000/party-ludo/online`; both web port 3000 and Party port 8788 must be reachable. `NEXT_PUBLIC_PARTY_WS_URL` can override the WebSocket endpoint; HTTPS hosting requires a reachable WSS endpoint. This change does not publish an Internet service or alter the original Magic/Pirate server at 8787.

The new Party server authorizes actions by seat, rejects stale revisions, controls RNG, and broadcasts state for identical dice/movement playback. Ballots are stripped before transmission; only a player's own selected/not-selected result is sent after that player reveals it. Session tokens are kept in browser session storage, allowing refresh/network reconnect in the same tab. Players must wait for a disconnected participant to return; no bots/timeouts replace them. Rooms are in memory and expire after 30 minutes with no connected guests; restarting the server loses rooms. A lobby guest may explicitly leave to free their seat. In-game seats stay reserved.

Party-only playback adds existing click/roll/hop effects and a sound toggle. Movement uses the original hop/teleport timing and trajectories, with an added camera follow entry point that zooms in and follows both axes. Original renderer, Dice component, global audio implementation, engine and Magic/Pirate files remain unchanged. Automated online-room tests cover 2/3/4-player completion, turn authorization, redacted votes, private checks, stale actions and reconnection. An actual two-socket smoke test verified room join/start and matching rolls. Chrome verified the online lobby and connection; native capture failures prevented complete multi-browser interaction and audible/camera verification.

Online room creation and joining require a player name (1–18 English letters, digits, spaces, periods, hyphens, or underscores). Blank/invalid names are rejected by both setup controls and the Party server. Names are trimmed and used in the lobby, player list, turn instructions, and vote choices; reconnect retains the original name.

Online setup includes ten animal profile icons (Fox, Cat, Dog, Panda, Bear, Rabbit, Tiger, Lion, Koala, Penguin) and a photo picker. JPG/PNG/WebP files up to 5 MB are center-cropped and re-encoded to a 160×160 JPEG in the browser, removing source file metadata. The server validates bounded inline JPEG profiles (64 KB maximum data URL) or known animal IDs; no remote image URLs or SVG are accepted. Profiles are shared only through the Party room, displayed in the lobby, guest list, and vote options, and retained in the server member record on reconnect. They are not stored in an external upload service and are lost with the room. Board token visuals stay unchanged. Restart the separate Party server after this update to load the profile protocol and increased 96 KB incoming message limit.


## Invites, readiness and lobby moderation

Party setup prominently offers Host room / Join room; local play remains available. Hosts receive a randomly shuffled twelve-character invitation code with exactly six uppercase letters, four digits, and two symbols from `!@#$%*?`. Join codes are case-insensitive. Share invite link uses the Web Share API when available, otherwise clipboard copy, with a selectable fallback URL. URLs encode the full code in a `room` query parameter. An invite opens Join with its code filled in, then the guest enters their own name/profile before joining. Links use the browser's current origin: a localhost link cannot connect another computer; use the host's reachable LAN or public origin first.

Every lobby member, including the host, must press Ready before the host can start. The server checks readiness and connectivity; roster changes, lobby disconnects and spice changes reset all ready flags. All guests see the host-selected spice level. Rematches return to the lobby for a new ready check. Only the host may remove other lobby participants; targeting uses stable public member IDs, never private reconnect tokens. Removed clients clear their saved session and stop reconnecting, and their old token cannot rejoin that room. This is room removal rather than a permanent identity ban: a fresh browser identity with the code may join again. In-game removal is disallowed to preserve seat/turn state. New invite format requires restarting the Party server; existing in-memory rooms do not survive that restart.

Lobby usability update: Join/Create actions now report specific validation or connectivity errors instead of silently disabling on invalid input. Join accepts a complete encoded invite URL, a 12-character current code, or a legacy six-hex-digit code for still-running old rooms. The lobby detects old servers lacking readiness fields and explicitly requests a server update. Ready has a cyan border/ring only while selected; cancel returns to a transparent border. Player rows use stable member IDs, entry animation, profiles, roles, readiness badges, and an internally scrollable list without fixed seat placeholders. Current gameplay capacity remains 2–4. The old local Party server was restarted during verification; its temporary room codes expired. Two real WebSocket clients verified latest-server joining and Ready on/off.

Party match UI now follows the original Magic game screen arrangement: full-viewport Pixi board, top toolbar/minimap, left player cards with active-seat glow and progress, and bottom-right Dice dock. Party stop descriptions are in a toggleable toolbar panel. The new `PartyMinimap.tsx` is a Party-scoped copy of the existing minimap adapted to the isolated renderer type; the original Game/hud/Minimap/Dice/global styles and engine were not edited. Existing Party state transitions, online rooms, private voting, profiles and challenge dialogs remain in place. The toolbar includes real overview/follow, sound and browser-fullscreen actions; no microphone/voice-chat implementation is present in the original Magic toolbar. Chrome read-only screenshot verification confirmed the full board, left cards and bottom-right dice in an active online game; gameplay was left uninterrupted.
