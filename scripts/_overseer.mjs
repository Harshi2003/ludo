// Plays human turns through the Overseer panel: screenshots roll and move advice, picks by tapping its rows.
// node scripts/_overseer.mjs <out> <world> <humanId> <w> <h>
import puppeteer from "puppeteer-core";
const [out, world = "fog-city", human = "byte", W = "390", H = "844"] = process.argv.slice(2);
const tag = `ov-${world}-${W}`;
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.setViewport({ width: +W, height: +H });
await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });
await page.evaluate((w) => localStorage.setItem("ludo:world", w), world);
await page.goto(`http://localhost:3000/?watch=4&seed=9&human=${human}`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.__ludo, { timeout: 30000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const S = () => page.evaluate(() => { const s = window.__ludo.state(); return { phase: s.phase, bot: s.players[s.turn].bot, n: s.events.length, moves: s.moves.length }; });
let picked = 0, rollShots = 0, moveShots = 0, powerShot = false;
for (let turn = 0; turn < 10; turn++) {
  await page.waitForFunction(() => { const s = window.__ludo.state(); return (!s.players[s.turn].bot && s.phase === "roll") || s.phase === "over"; }, { timeout: 180000, polling: 200 });
  await wait(900);
  if ((await S()).phase === "over") break;
  const advice = await page.evaluate(() => [...document.querySelectorAll("div")].find((d) => d.firstElementChild?.textContent?.includes("Overseer"))?.innerText ?? "(no overseer)");
  const ready = /is ready|is charged/.test(advice);
  if (rollShots < 1 || (ready && !powerShot)) { await page.screenshot({ path: `${out}/${tag}-roll${rollShots++}.png` }); if (ready) powerShot = true; }
  console.log(`turn ${turn} ROLL:`, advice.replace(/\s+/g, " ").slice(0, 200));
  await page.click('button[aria-label="Roll the dice"]');
  await wait(2600);
  const s = await S();
  if (s.phase !== "move") continue;
  const list = await page.evaluate(() => [...document.querySelectorAll("div")].find((d) => d.firstElementChild?.textContent?.includes("Overseer"))?.innerText ?? "(no overseer)");
  console.log(`turn ${turn} MOVE (${s.moves}):`, list.replace(/\s+/g, " ").slice(0, 260));
  if (moveShots < 2 && s.moves > 1) await page.screenshot({ path: `${out}/${tag}-move${moveShots++}.png` });
  const before = (await S()).n;
  const ok = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("★ Pick")); b?.click(); return !!b; });
  await wait(1500);
  if (ok && (await S()).n > before) picked++;
  else console.log("  pick via Overseer failed", ok);
}
console.log(JSON.stringify({ picked }));
console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join("\n")}` : "no browser errors");
await browser.close();
