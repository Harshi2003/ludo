// Plays Fog City as a human seat against bots: rolls, casts powers when ready, picks moves.
// node scripts/_sfplay.mjs <outdir> <humanId> <w> <h> <seed>
import puppeteer from "puppeteer-core";
const [out, human = "byte", W = "1440", H = "900", seed = "21"] = process.argv.slice(2);
const tag = `${human}-${W}`;
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.setViewport({ width: +W, height: +H });
await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.setItem("ludo:world", "fog-city"));
await page.goto(`http://localhost:3000/?watch=4&seed=${seed}&human=${human}`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.__ludo, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: `${out}/${tag}-start.png` });
// Fast bots
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /Fast bots/.test(x.getAttribute("aria-label") ?? x.textContent ?? ""));
  b?.click();
});
const S = () => page.evaluate(() => { const s = window.__ludo.state(); return { turn: s.turn, phase: s.phase, n: s.events.length, moves: s.moves.length, round: s.round, bot: s.players[s.turn].bot }; });
let last = -1, lastChange = Date.now(), casts = 0, shots = 0, myTurns = 0;
const t0 = Date.now();
while (Date.now() - t0 < 900000) {
  const s = await S();
  if (s.phase === "over") break;
  if (s.n !== last) { last = s.n; lastChange = Date.now(); }
  if (Date.now() - lastChange > 25000) { console.log("STUCK", JSON.stringify(s)); await page.screenshot({ path: `${out}/${tag}-stuck.png` }); break; }
  if (!s.bot) {
    const busy = await page.evaluate(() => document.querySelector(`button[aria-label="Roll the dice"]`)?.disabled ?? true);
    if (s.phase === "roll" && !busy) {
      // Cast a ready power half the time.
      const cast = Math.random() < 0.6 && await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => /Tap to cast|Unleash!|Combo/.test(x.textContent ?? "") && !x.disabled);
        if (!b) return null;
        const t = b.textContent; b.click(); return t;
      });
      if (cast) { casts++; console.log(`r${s.round} cast: ${cast}`); await new Promise((r) => setTimeout(r, 2500)); if (shots < 3) await page.screenshot({ path: `${out}/${tag}-cast${shots++}.png` }); continue; }
      myTurns++;
      await page.click('button[aria-label="Roll the dice"]').catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    if (s.phase === "move" && s.moves > 0) {
      if (myTurns === 2) await page.screenshot({ path: `${out}/${tag}-choose.png` });
      await page.evaluate((k) => window.__ludo.pick(k), Math.floor(Math.random() * s.moves));
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
  }
  await new Promise((r) => setTimeout(r, 300));
}
await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: `${out}/${tag}-end.png` });
const sum = await page.evaluate(() => {
  const s = window.__ludo.state();
  const count = (k) => s.events.filter((e) => e.kind === k).length;
  const tiles = {}; s.events.filter((e) => e.kind === "tile").forEach((e) => (tiles[e.source] = (tiles[e.source] ?? 0) + 1));
  return { phase: s.phase, round: s.round, winner: s.winner, captures: count("capture"), events: count("world_event"), tiles, fizzles: s.events.filter((e) => /fizzle|nothing|no target/i.test(e.msg)).map((e) => e.msg).slice(0, 8) };
});
console.log(JSON.stringify({ casts, myTurns, ...sum }));
console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join("\n")}` : "no browser errors");
await browser.close();
