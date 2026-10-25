import puppeteer from "puppeteer-core";
const out = process.argv[2]; const url = "http://localhost:3000";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--use-angle=d3d11","--ignore-gpu-blocklist"] });
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [vw, vh, tag] of [[1440, 900, "d"], [390, 844, "m"]]) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
  await page.setViewport({ width: vw, height: vh, deviceScaleFactor: tag === "m" ? 2 : 1 });
  await page.goto(url, { waitUntil: "networkidle0" }); await sleep(1500);
  const worlds = await page.evaluate(() => JSON.parse(localStorage.getItem("ludo:worlds") ?? "[]").map((w) => w.pack.id));
  for (const id of ["magic-elements", "fog-city", ...worlds]) {
    await page.evaluate((id) => localStorage.setItem("ludo:world", id), id);
    await page.goto(url, { waitUntil: "networkidle0" }); await sleep(1500);
    await page.screenshot({ path: `${out}/${tag}-home-${id}.png`, fullPage: true });
    await page.goto(`${url}/?watch=4&seed=5&human=none`, { waitUntil: "networkidle0" }); await sleep(3000);
    await page.screenshot({ path: `${out}/${tag}-game-${id}.png` });
  }
  for (const p of ["create", "lab", "online"]) {
    await page.goto(`${url}/${p}`, { waitUntil: "networkidle0" }); await sleep(1500);
    await page.screenshot({ path: `${out}/${tag}-${p}.png`, fullPage: true });
  }
  await page.close();
}
console.log(errors.join("\n") || "no errors");
await browser.close();
