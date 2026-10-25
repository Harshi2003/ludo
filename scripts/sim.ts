import { readFileSync } from 'node:fs';
import { balanceReport, mean, simulate, type PlayerCount, type ThemePack } from '@ludo/engine';
import { magicPack, pirateFixture, sfPack } from '@ludo/themepack';

const packs = { magic: magicPack, sf: sfPack, pirate: pirateFixture };
const arg = process.argv[3] ?? 'magic';
// A path to a saved world JSON (e.g. apps/web/data/worlds/x.json) works too.
const pack: ThemePack = arg.endsWith('.json')
  ? ((j) => j.pack ?? j)(JSON.parse(readFileSync(arg, 'utf8')))
  : packs[arg as keyof typeof packs] ?? magicPack;

const games = Number(process.argv[2] ?? 500);
for (const players of [2, 3, 4] as PlayerCount[]) {
  const t = Date.now();
  const r = simulate(pack, { games, players, seed: 42 });
  const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
  console.log(`\n=== ${players} players · ${games} games · ${r.boardTiles.toFixed(0)} tiles · ${Date.now() - t}ms`);
  console.log('seat wins     ', r.winsBySeat.map((w) => pct(w, games)).join('  '));
  console.log('character wins', Object.keys(r.gamesByCharacter).map((c) => `${c} ${pct(r.winsByCharacter[c] ?? 0, r.gamesByCharacter[c])}`).join('  '));
  console.log(`rounds avg ${mean(r.rounds).toFixed(1)}  max ${Math.max(...r.rounds)}   captures avg ${mean(r.captures).toFixed(1)}`);
  console.log('fires/game    ', Object.entries(r.sources).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / games).toFixed(1)}`).join('  '));
  for (const w of balanceReport(r)) console.log(`  [${w.level}] ${w.msg}`);
}
