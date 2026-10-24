import { balanceReport, simulate, type BotStyle, type PlayerCount, type ThemePack } from "@ludo/engine";

export interface SimRequest {
  pack: ThemePack;
  players: PlayerCount;
  games: number;
  seed: number;
  style: BotStyle;
}

self.onmessage = (e: MessageEvent<SimRequest>) => {
  const { pack, players, games, seed, style } = e.data;
  const step = Math.max(1, Math.floor(games / 50));
  const result = simulate(pack, {
    games, players, seed, style,
    onProgress: (done) => done % step === 0 && self.postMessage({ type: "progress", done }),
  });
  self.postMessage({ type: "done", result, warnings: balanceReport(result) });
};
