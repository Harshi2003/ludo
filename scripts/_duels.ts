import { botAction, createGame, step } from '@ludo/engine';
import { magicPack as pack } from '@ludo/themepack';
// Head to head win rate for every pair of houses, both seat orders.
const ids = pack.characters.map((c) => c.id);
const n = Number(process.argv[2] ?? 150);
const wins: Record<string, number> = {};
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
  let a = 0;
  for (let g = 0; g < n; g++) {
    const pair = g % 2 ? [ids[j], ids[i]] : [ids[i], ids[j]];
    const s = createGame(pack, { seed: 1000 + g * 7919, players: pair.map((character) => ({ character, bot: true })) });
    for (let k = 0; k < 20000 && s.phase !== 'over'; k++) step(pack, s, botAction(pack, s));
    if (s.winner !== null && s.players[s.winner].character === ids[i]) a++;
  }
  console.log(`${ids[i]} vs ${ids[j]}: ${((a / n) * 100).toFixed(0)}%`);
  wins[ids[i]] = (wins[ids[i]] ?? 0) + a; wins[ids[j]] = (wins[ids[j]] ?? 0) + n - a;
}
console.log(Object.entries(wins).map(([k, v]) => `${k} ${((v / (n * 3)) * 100).toFixed(0)}%`).join('  '));
