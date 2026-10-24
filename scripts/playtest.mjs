// Real-time browser playtest: drives the running dev server with system Chrome.
// Usage: node scripts/playtest.mjs [outDir]
import puppeteer from "puppeteer-core";

const out = process.argv[2] ?? ".";
const base = process.env.URL ?? "http://localhost:3000";
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: [process.env.SOFTWARE ? "--use-angle=swiftshader" : "--use-angle=d3d11", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const errors = [];
const watch = (page, tag) => {
  page.on("pageerror", (e) => errors.push(`[${tag}] pageerror ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`[${tag}] console ${m.text()}`));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (page) => page.evaluate(() => {
  const s = window.__ludo?.state();
  return s && { round: s.round, turn: s.turn, phase: s.phase, winner: s.winner, tiles: s.players.map((p) => p.tile), caps: s.events.filter((e) => e.kind === "capture").length };
});

// 1. Desktop spectator game, all bots.
{
  const page = await browser.newPage();
  watch(page, "desktop");
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${base}/?watch=4&seed=11&human=none`, { waitUntil: "networkidle0" });
  await sleep(2000);
  const fps = await page.evaluate(() => new Promise((r) => {
    let n = 0; const t0 = performance.now();
    const f = () => (++n, performance.now() - t0 < 2000 ? requestAnimationFrame(f) : r(Math.round(n / 2)));
    requestAnimationFrame(f);
  }));
  console.log("desktop fps", fps);
  for (const t of [6, 25, 60]) {
    await sleep((t - (t === 6 ? 0 : t === 25 ? 6 : 25)) * 1000);
    await page.screenshot({ path: `${out}/desk-${t}s.png` });
    console.log(`desktop @${t}s`, JSON.stringify(await state(page)));
  }
  await page.close();
}

// 2. Mobile landscape, human Inferno vs bots: roll, pick a move.
{
  const page = await browser.newPage();
  watch(page, "mobile");
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true });
  await page.goto(`${base}/?watch=3&seed=5&human=inferno`, { waitUntil: "networkidle0" });
  await sleep(2500);
  for (let turn = 0; turn < 3; turn++) {
    await page.waitForFunction(() => {
      const s = window.__ludo?.state();
      return s && s.turn === 0 && s.phase === "roll";
    }, { timeout: 60000 });
    await page.waitForSelector('button[aria-label="Roll the dice"]:not([disabled])', { timeout: 30000 });
    await page.click('button[aria-label="Roll the dice"]');
    await page.waitForFunction(() => window.__ludo.state().phase === "move" || window.__ludo.state().turn !== 0, { timeout: 15000 });
    await sleep(1600);
    if (turn === 0) await page.screenshot({ path: `${out}/mobile-pick.png` });
    const s = await state(page);
    console.log("mobile before pick", JSON.stringify(s));
    if (s.phase === "move" && s.turn === 0) await page.evaluate(() => window.__ludo.pick(0));
    await sleep(2500);
  }
  await page.screenshot({ path: `${out}/mobile-after.png` });
  console.log("mobile end", JSON.stringify(await state(page)));
  await page.close();
}

// 3. Home page on a phone.
{
  const page = await browser.newPage();
  watch(page, "home");
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(base, { waitUntil: "networkidle0" });
  await sleep(1500);
  await page.screenshot({ path: `${out}/home-phone.png`, fullPage: false });
  await page.close();
}

await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no browser errors");
