// Loads the Balance Lab, waits for the auto-run, re-runs with a tweak, screenshots.
import puppeteer from "puppeteer-core";
const out = process.argv[2] ?? ".";
const base = process.env.URL ?? "http://localhost:3000";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--use-angle=d3d11"] });
const errors = [];
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.setViewport({ width: 1440, height: 1000 });
await page.goto(`${base}/lab`, { waitUntil: "networkidle0" });
const doneRun = () => page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^Run [\d,]+ games$/.test(b.textContent ?? "")), { timeout: 180000 });
const t0 = Date.now();
await doneRun();
console.log(`first run ${(Date.now() - t0) / 1000}s`);
// Tweak: Zephyr ability power slider to max, then re-run.
await page.evaluate(() => {
  const sliders = [...document.querySelectorAll('input[type="range"]')];
  const s = sliders[11];
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  set.call(s, "150");
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Re-run with tuning").click());
await new Promise((r) => setTimeout(r, 500));
await doneRun();
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${out}/lab-desktop.png`, fullPage: true });
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${out}/lab-phone.png` });
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no browser errors");
await browser.close();
