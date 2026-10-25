// BROWSER_PATH=/path/to/chrome node scripts/cameratest.mjs
// Exercises the real Pixi camera through turns, dragging, zooming and resizing.
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    window.__PIXI_APP_INIT__ = (app) => { window.__cameraApp = app; };
  });
  await page.setViewport({ width: 390, height: 1000 });
  await page.goto(`${process.env.URL ?? "http://localhost:3000"}/?watch=4&seed=1`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.__ludo && !!window.__cameraApp, { timeout: 30000 });
  await sleep(500);
  await page.evaluate(() => {
    const app = window.__cameraApp;
    window.__cameraSamples = { maxStartY: -Infinity, maxAutoSpeed: 0, count: 0, manual: false };
    let last;
    app.ticker.add(() => {
      // The route's origin is the starting row; test its screen position rather
      // than the camera's internal target, including every animation frame.
      const world = app.stage.children.find((c) => Math.abs(c.rotation - Math.PI / 2) < 0.01);
      if (!world) { last = undefined; return; }
      const y = world.toGlobal({ x: 0, y: 0 }).y;
      const now = performance.now();
      const samples = window.__cameraSamples;
      samples.maxStartY = Math.max(samples.maxStartY, y);
      samples.count++;
      if (last && !samples.manual && !last.manual && now > last.time) {
        samples.maxAutoSpeed = Math.max(samples.maxAutoSpeed, Math.abs(y - last.y) * 1000 / (now - last.time));
      }
      last = { y, time: now, manual: samples.manual };
    });
  });
  // Pull toward the space before the board. A hard bound must prevent a gap.
  await page.evaluate(() => { window.__cameraSamples.manual = true; });
  await page.mouse.move(195, 400);
  await page.mouse.down();
  await page.mouse.move(195, 750, { steps: 12 });
  await page.mouse.up();
  await sleep(200);
  await page.mouse.move(195, 450);
  await page.mouse.wheel({ deltaY: 180 });
  await sleep(300);
  await page.click('[aria-label="Follow"]');
  await sleep(1500);
  await page.evaluate(() => { window.__cameraSamples.manual = false; });
  console.log("Checking camera bounds during four-player bot turns…");
  await page.waitForFunction(() => window.__ludo.state().events.filter((e) => e.kind === "turn").length >= 6, { timeout: 90000 });
  await sleep(1500);
  const samples = await page.evaluate(() => window.__cameraSamples);
  assert.ok(samples.count > 100, JSON.stringify(samples));
  // The header reserves 126px; the start row has a 43px clearance below it.
  assert.ok(samples.maxStartY <= 170, `Start row dropped below its anchor: ${JSON.stringify(samples)}`);
  assert.ok(samples.maxAutoSpeed <= 170, `Camera moved too fast: ${JSON.stringify(samples)}`);
  await page.screenshot({ path: "/tmp/ludo-camera-turns.png" });
  for (const viewport of [{ width: 320, height: 667 }, { width: 844, height: 390 }, { width: 390, height: 1000 }]) {
    await page.setViewport(viewport);
    await sleep(500);
  }
  assert.deepEqual(errors, []);
  console.log("PASS:", JSON.stringify(samples), "No browser errors.");
} finally {
  await browser.close();
}
