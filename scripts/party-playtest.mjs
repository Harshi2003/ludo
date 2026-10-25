// BROWSER_PATH=/path/to/chrome URL=http://localhost:3000 node scripts/party-playtest.mjs
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    window.__PIXI_APP_INIT__ = app => { window.__partyApp = app; };
  });
  const clickText = text => page.evaluate(text => {
    const button = [...document.querySelectorAll("button")].find(button => button.textContent.trim() === text && !button.disabled);
    if (!button) throw new Error(`Missing enabled button: ${text}`);
    button.click();
  }, text);
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(process.env.URL ?? "http://localhost:3000", { waitUntil: "networkidle0" });
  await page.waitForSelector('[aria-label="Worlds"] button[aria-pressed]');
  const selectWorld = name => page.evaluate(name => [...document.querySelectorAll('[aria-label="Worlds"] button[aria-pressed]')].find(button => button.textContent.includes(name)).click(), name);
  await selectWorld("Party Ludo");
  await page.waitForFunction(() => document.querySelector("h1")?.textContent.includes("Party Ludo"));
  await page.screenshot({ path: "/tmp/ludo-worlds.png" });
  assert.equal(new URL(page.url()).pathname, "/");
  await page.evaluate(() => [...document.querySelectorAll('summary')].find(el => el.textContent === 'Play on one device').click());
  await clickText("4 players");
  await clickText("Start local game");
  await page.waitForSelector('[aria-label="Roll the dice"]:not([disabled])', { timeout: 60000 });
  await page.waitForFunction(() => !!window.__partyApp?.stage.children.at(-1)?.children.length);
  for (const viewport of [{ width: 320, height: 667 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }, { width: 1024, height: 1366 }]) {
    await page.setViewport(viewport);
    await page.waitForFunction(portrait => Math.abs(window.__partyApp.stage.children.at(-1).rotation - (portrait ? Math.PI / 2 : 0)) < 0.01, { timeout: 15000 }, viewport.height > viewport.width);
    await sleep(300);
    const geometry = await page.evaluate(() => {
      const world = window.__partyApp.stage.children.at(-1);
      const dock = document.querySelector('[aria-label="Roll the dice"]').getBoundingClientRect();
      return {
        rotation: world.rotation,
        upright: world.children[4].children.every(child => Math.abs(child.rotation + world.rotation) < 0.01),
        dock: { x: dock.x, y: dock.y, right: dock.right, bottom: dock.bottom },
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.ok(Math.abs(geometry.rotation - (viewport.height > viewport.width ? Math.PI / 2 : 0)) < 0.01, JSON.stringify(geometry));
    assert.ok(geometry.upright, "Party tile illustrations rotated sideways");
    assert.ok(!geometry.overflow, "The page overflows horizontally");
    assert.ok(geometry.dock.x >= 0 && geometry.dock.y >= 0 && geometry.dock.right <= viewport.width && geometry.dock.bottom <= viewport.height, JSON.stringify(geometry));
    if (viewport.width === 390 || viewport.width === 1280) await page.screenshot({ path: `/tmp/ludo-party-${viewport.width}.png` });
  }
  await page.setViewport({ width: 390, height: 844 });
  await page.click('[aria-label="Roll the dice"]');
  await page.waitForSelector('section[aria-busy="false"] details summary');
  await page.click('section[aria-busy="false"] details summary');
  await page.click('section[aria-busy="false"] details button:not([disabled])');
  await page.waitForSelector("dialog[open]", { timeout: 30000 });
  for (let i = 0; i < 5; i++) {
    const next = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('dialog[open] button:not([disabled])')];
      const button = buttons.find(b => /Skip \+ random penalty|Lose my next turn|Got it — next player|Continue to next player/.test(b.textContent));
      return button?.textContent.trim();
    });
    if (!next) break;
    await clickText(next);
    await sleep(2500);
    if (!await page.$("dialog[open]")) break;
  }
  await page.waitForSelector('[aria-label="Roll the dice"]:not([disabled])', { timeout: 30000 });
  assert.equal(await page.$("dialog[open]"), null, "The result did not advance to the next player");
  await page.click('[aria-label="Leave game"]');
  await page.waitForSelector('[aria-label="Worlds"] button[aria-pressed="true"]');
  await selectWorld("Magic Ludo");
  await page.evaluate(() => [...document.querySelectorAll('summary')].find(el => el.textContent === 'Play on one device').click());
  await clickText("Start local game");
  await page.waitForSelector('[aria-label="Roll the dice"]:not([disabled])', { timeout: 30000 });
  await page.click('[aria-label="Leave game"]');
  await page.waitForSelector('[aria-label="Worlds"] button[aria-pressed="true"]');
  assert.deepEqual(errors, []);
  console.log("PASS: Magic/Party selection in the Worlds shelf; Party artwork stays upright in five viewports; play and exit return to the selected mode without browser errors.");
} finally {
  await browser.close();
}
