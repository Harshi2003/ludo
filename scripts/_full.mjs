// Full-page screenshot of one world's home page. Usage: node scripts/_full.mjs <out.png> <worldId> [w] [h] [path]
import puppeteer from "puppeteer-core";
const [out, id, W = 1440, H = 900, path = "/"] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.setViewport({ width: +W, height: +H, deviceScaleFactor: +W < 600 ? 2 : 1 });
await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });
await page.evaluate((id) => localStorage.setItem("ludo:world", id), id);
await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 2000));
const probe = await page.evaluate(() => {
  const s = [...document.querySelectorAll("span.absolute.top-0")][3];
  return s ? getComputedStyle(s).transform + " " + matchMedia("(prefers-reduced-motion: reduce)").matches : "none";
});
console.log("probe", probe);
await page.screenshot({ path: out, fullPage: true });
console.log(errors.join("\n") || "no errors");
await browser.close();
