// Plays a whole bot game on fast speed and screenshots the victory screen.
import puppeteer from "puppeteer-core";
const out = process.argv[2] ?? ".";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${process.env.URL ?? "http://localhost:3000"}/?watch=${process.env.P ?? 2}&seed=3&human=none`, { waitUntil: "networkidle0" });
await page.click('button[aria-label="Fast bots"]');
const t0 = Date.now();
await page.waitForFunction(() => window.__ludo?.state().phase === "over", { timeout: 600000, polling: 1000 });
await new Promise((r) => setTimeout(r, 3500));
await page.screenshot({ path: `${out}/victory.png` });
const s = await page.evaluate(() => { const s = window.__ludo.state(); return { round: s.round, winner: s.winner, caps: s.events.filter((e) => e.kind === "capture").length }; });
console.log(`finished in ${((Date.now() - t0) / 1000).toFixed(0)}s`, JSON.stringify(s));
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no browser errors");
await browser.close();
