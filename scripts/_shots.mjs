// Screenshots each world's board (follow + overview) and home page. Usage: node scripts/_shots.mjs <outDir> [w] [h]
import puppeteer from "puppeteer-core";
const [out, W = 1440, H = 900] = process.argv.slice(2);
const url = "http://localhost:3000";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.setViewport({ width: +W, height: +H });
await page.goto(url, { waitUntil: "networkidle0" }); await sleep(1500);
const ids = await page.evaluate(() => ["magic-elements", "fog-city", ...JSON.parse(localStorage.getItem("ludo:worlds") ?? "[]").map((w) => w.pack.id)]);
for (const id of ids) {
  await page.evaluate((id) => localStorage.setItem("ludo:world", id), id);
  await page.goto(url, { waitUntil: "networkidle0" }); await sleep(1800);
  await page.screenshot({ path: `${out}/home-${id}.png` });
  await page.goto(`${url}/?watch=4&seed=5&human=none`, { waitUntil: "networkidle0" }); await sleep(3500);
  await page.screenshot({ path: `${out}/game-${id}.png` });
  await page.click('button[aria-label="Overview"]'); await sleep(1500);
  await page.screenshot({ path: `${out}/over-${id}.png` });
}
console.log(errors.join("\n") || "no errors");
await browser.close();
