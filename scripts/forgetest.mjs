// End-to-end: /create without a key → demo world → reveal → save & play → pirate board.
import puppeteer from "puppeteer-core";
const out = process.argv[2] ?? ".";
const base = process.env.URL ?? "http://localhost:3000";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--use-angle=d3d11"] });
const errors = [];
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !m.text().includes("503") && errors.push(m.text()));
await page.setViewport({ width: 1280, height: 900 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickText = (t) => page.evaluate((t) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(t))?.click(), t);

await page.goto(`${base}/create`, { waitUntil: "networkidle0" });
await page.type("#theme", "Pirate treasure war on a stormy sea");
await clickText("FORGE THIS WORLD");
await page.waitForFunction(() => document.body.textContent?.includes("needs an AI key") || document.body.textContent?.includes("A new world is born"), { timeout: 60000 });
const needsKey = await page.evaluate(() => document.body.textContent?.includes("needs an AI key"));
console.log("missing-key notice shown:", needsKey);
if (needsKey) {
  await page.screenshot({ path: `${out}/forge-key.png` });
  await clickText("Try the demo world");
}
await sleep(700);
await page.screenshot({ path: `${out}/forge-progress.png` });
await page.waitForFunction(() => document.body.textContent?.includes("A new world is born"), { timeout: 120000 });
await sleep(800);
await page.screenshot({ path: `${out}/forge-reveal.png`, fullPage: true });
console.log("revealed:", await page.evaluate(() => document.querySelector('input[aria-label="World name"]')?.value));

// Rename the world, then save & play.
await page.click('input[aria-label="World name"]', { clickCount: 3 });
await page.keyboard.type("Pirate Ludo: The Kraken's Gold");
await clickText("SAVE & PLAY");
await page.waitForFunction(() => location.pathname === "/" && document.body.textContent?.includes("Kraken"), { timeout: 30000 });
await sleep(1200);
await page.screenshot({ path: `${out}/forge-home.png` });
console.log("home shows renamed world:", await page.evaluate(() => document.querySelector("h1")?.textContent));

await page.goto(`${base}/?watch=4&seed=4&human=none`, { waitUntil: "networkidle0" });
await sleep(9000);
await page.screenshot({ path: `${out}/forge-game.png` });
console.log("game world:", await page.evaluate(() => window.__ludo?.state().packId));
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no browser errors");
await browser.close();
