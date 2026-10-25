// Real touch taps on a phone: wobbly taps on legal tiles must move; taps on unreachable rivals must explain why.
import puppeteer from "puppeteer-core";
const out = process.argv[2];
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile" });
await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.setItem("ludo:world", "fog-city"));
await page.goto("http://localhost:3000/?watch=4&seed=5&human=byte", { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.__ludo?.at, { timeout: 30000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const S = () => page.evaluate(() => { const s = window.__ludo.state(); return { turn: s.turn, phase: s.phase, bot: s.players[s.turn].bot, moves: s.moves.map((m) => m.to), n: s.events.length }; });
// A tap whose finger drifts a few pixels, like a real thumb.
async function wobbleTap(x, y) {
  const c = await page.target().createCDPSession();
  const pt = (dx, dy) => [{ x: x + dx, y: y + dy }];
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(0, 0) });
  for (const [dx, dy] of [[3, 2], [6, -2], [4, 5], [7, 3]]) await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(dx, dy) });
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
let moved = 0, failed = 0, hints = [];
for (let turn = 0; turn < 8; turn++) {
  await page.waitForFunction(() => { const s = window.__ludo.state(); return !s.players[s.turn].bot && s.phase === "roll" || s.phase === "over"; }, { timeout: 120000, polling: 200 });
  await wait(600);
  if ((await S()).phase === "over") break;
  await page.click('button[aria-label="Roll the dice"]');
  await wait(2500);
  const s = await S();
  if (s.phase !== "move") continue;
  // First: tap a rival that isn't a legal destination, if any.
  const rivalTile = await page.evaluate(() => {
    const s = window.__ludo.state();
    const set = new Set(s.moves.map((m) => m.to));
    for (const p of s.players) if (p.seat !== s.turn) for (const q of p.pieces) if (!set.has(q.tile) && s.board.tiles[q.tile].start === undefined) return q.tile;
    return null;
  });
  if (rivalTile !== null) {
    const p = await page.evaluate((t) => window.__ludo.at(t), rivalTile);
    if (p.x > 0 && p.y > 140 && p.x < 390 && p.y < 650) {
      await wobbleTap(p.x, p.y);
      await wait(500);
      const toast = await page.evaluate(() => [...document.querySelectorAll(".glass span.truncate")].map((e) => e.textContent).filter((t) => /need|reach|behind|Nobody|glowing/.test(t)).at(-1));
      hints.push(toast ?? "(no hint)");
      if (hints.length === 1) await page.screenshot({ path: `${out}/tap-hint.png` });
    }
  }
  const before = (await S()).n;
  const p = await page.evaluate((t) => window.__ludo.at(t), s.moves[s.moves.length - 1]);
  await wobbleTap(p.x, p.y);
  await wait(1500);
  const after = await S();
  if (after.n > before) moved++; else { failed++; await page.screenshot({ path: `${out}/tap-fail${failed}.png` }); console.log("tap at", p, "did not move"); }
}
console.log(JSON.stringify({ moved, failed, hints }));
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no browser errors");
await browser.close();
