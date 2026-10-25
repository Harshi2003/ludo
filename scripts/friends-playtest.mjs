// BROWSER_PATH=/path/to/chrome WS_TEST_PORT=8797 node scripts/friends-playtest.mjs
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { tmpdir } from 'node:os';
const shots = process.env.SHOTS_DIR ?? tmpdir();
const base = process.env.URL ?? 'http://localhost:3000';
const browser = await puppeteer.launch({ executablePath: process.env.BROWSER_PATH ?? '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const clickText = async (page, text) => {
  await page.waitForFunction(text => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === text && !b.disabled), {}, text);
  await page.evaluate(text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled).click(), text);
};
const selectWorld = (page, name) => page.evaluate(name => [...document.querySelectorAll('[aria-label="Worlds"] button[aria-pressed]')].find(b => b.textContent.includes(name)).click(), name);
async function prepare(context, width) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width, height: width > 1000 ? 800 : 844 });
  await page.evaluateOnNewDocument(port => {
    window.__roomState = null;
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url, protocols) {
        const endpoint = new URL(url);
        if (port && !endpoint.pathname.includes('_next') && (endpoint.port === '8787' || endpoint.pathname.endsWith('/party'))) endpoint.port = port;
        super(endpoint.toString(), protocols);
        this.addEventListener('message', event => {
          try {
            const message = JSON.parse(event.data);
            if (message.t === 'feed') { window.__roomFeed = message.feed; window.__roomState = message.feed.state; }
            if (message.t === 'start' || message.t === 'update' || message.t === 'welcome' && message.state) window.__roomState = message.state;
          } catch {}
        });
      }
    };
  }, process.env.WS_TEST_PORT ?? '');
  return page;
}
async function entry(page, name, profile) {
  await page.waitForFunction(() => document.body.textContent.includes('Connected'));
  await page.type('#player-name', name);
  await page.evaluate(() => [...document.querySelectorAll('summary')].find(s => s.textContent === 'Choose your profile').click());
  await page.click(`button[aria-label="${profile}"]`);
}
try {
  for (const world of (process.env.WORLD ? [process.env.WORLD] : ['Magic Ludo', 'Party Ludo'])) {
    const contexts = await Promise.all([browser.createBrowserContext(), browser.createBrowserContext()]);
    let host, guest;
    try {
      host = await prepare(contexts[0], 1280); guest = await prepare(contexts[1], 390);
      await host.goto(base, { waitUntil: 'networkidle0' });
      await host.waitForSelector('[aria-label="Worlds"] button[aria-pressed]');
      const shelf = await host.$$eval('[aria-label="Worlds"] button[aria-pressed]', buttons => buttons.map(b => b.textContent));
      assert.ok(['Magic Ludo', 'Party Ludo'].every(name => shelf.some(t => t.includes(name))), `shelf: ${shelf.join(', ')}`);
      await selectWorld(host, world);
      await host.screenshot({ path: `${shots}/ludo-${world.startsWith('Party') ? 'party' : 'magic'}-home.png` });
      await host.click('[aria-label="Play selected world"] a:first-of-type');
      await entry(host, 'Alex', 'Cat');
      await clickText(host, 'Create room');
      await host.waitForSelector('output[aria-label="Room code"]');
      const code = await host.$eval('output[aria-label="Room code"]', el => el.textContent);
      await host.waitForFunction(() => document.querySelector('input[aria-label="Invite link"]')?.value);
      const invite = await host.$eval('input[aria-label="Invite link"]', el => el.value);
      assert.ok(invite.includes('/online?world='));
      assert.equal(await host.$$eval('[aria-label="Room players"] li', rows => rows.length), 1);
      assert.ok(await host.$eval('button', () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Start game').disabled));
      await guest.goto(base, { waitUntil: 'networkidle0' });
      await guest.waitForSelector('[aria-label="Worlds"] button[aria-pressed]');
      await selectWorld(guest, world === 'Party Ludo' ? 'Magic Ludo' : 'Party Ludo');
      await guest.click('[aria-label="Play selected world"] a:last-of-type');
      await entry(guest, 'Júlia', 'Panda');
      await guest.type('input[aria-label="Invite link or room code"]', world === 'Party Ludo' ? code : invite);
      assert.equal(await guest.$eval('input[aria-label="Invite link or room code"]', el => el.value), world === 'Party Ludo' ? code : invite);
      await clickText(guest, 'Join room');
      await Promise.all([host, guest].map(page => page.waitForFunction(() => document.querySelectorAll('[aria-label="Room players"] li').length === 2)));
      assert.ok((await guest.$eval('h1', el => el.textContent)).includes('Your room'));
      assert.ok((await host.$eval('[aria-label="Room players"]', el => el.textContent)).includes('Júlia'));
      assert.ok(await host.$('[aria-label="Alex\'s Cat profile"]'));
      assert.ok(await guest.$('[aria-label="Júlia\'s Panda profile"]'));
      // Reconnect in the lobby: keep the profile, name and seat, and clear ready flags.
      await clickText(host, "I'm ready");
      await guest.reload({ waitUntil: 'networkidle0' });
      await guest.waitForSelector('output[aria-label="Room code"]');
      await host.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === "I'm ready"));
      await Promise.all([clickText(host, "I'm ready"), clickText(guest, "I'm ready")]);
      await guest.setViewport({ width: 320, height: 667 });
      await guest.screenshot({ path: `${shots}/ludo-${world.startsWith('Party') ? 'party' : 'magic'}-lobby-mobile.png` });
      assert.ok(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile lobby overflows');
      await host.screenshot({ path: `${shots}/ludo-${world.startsWith('Party') ? 'party' : 'magic'}-lobby-desktop.png` });
      for (const page of [host, guest]) assert.ok(await page.$eval('[aria-label="Game controls"]', el => { const rect = el.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; }), 'Ready/start controls should stay visible');
      await clickText(host, 'Start game');
      await Promise.all([host, guest].map(page => page.waitForFunction(() => window.__roomState?.phase === 'roll')));
      const states = await Promise.all([host, guest].map(page => page.evaluate(() => window.__roomState)));
      assert.equal(states[0].players.length, 2);
      assert.equal(states[0].rng, states[1].rng);
      if (world === 'Magic Ludo') assert.ok(states[0].players.every(player => !player.bot));
      await Promise.all([host, guest].map(page => page.waitForSelector('[aria-label="Roll the dice"]', { timeout: 60000 })));
      const deadline = Date.now() + 60000;
      let actor;
      while (!actor && Date.now() < deadline) {
        for (const page of [host, guest]) if (await page.$('[aria-label="Roll the dice"]:not([disabled])')) { actor = page; break; }
        if (!actor) await new Promise(resolve => setTimeout(resolve, 250));
      }
      assert.ok(actor, 'No human can roll');
      await actor.click('[aria-label="Roll the dice"]');
      await Promise.all([host, guest].map(page => page.waitForFunction(() => window.__roomState?.phase === 'move')));
      const rolled = await Promise.all([host, guest].map(page => page.evaluate(() => ({ roll: window.__roomState.roll, rng: window.__roomState.rng }))));
      assert.deepEqual(rolled[0], rolled[1]);
      await guest.reload({ waitUntil: 'networkidle0' });
      await guest.waitForFunction(() => window.__roomState?.phase === 'move');
      assert.deepEqual(await guest.evaluate(() => ({ roll: window.__roomState.roll, rng: window.__roomState.rng })), rolled[0]);
      console.log(`PASS: ${world}: cross-world invite, shared profiles, ready checks, human-only start, synchronized dice and lobby/in-game reconnect.`);
    } catch (error) {
      for (const [label, page] of [['host', host], ['guest', guest]]) if (page && !page.isClosed()) {
        console.log(label, await page.evaluate(() => ({ text: document.body.innerText, url: location.href, names: window.__roomFeed?.names, input: document.querySelector('input[aria-label="Invite link or room code"]')?.value })));
        await page.screenshot({ path: `${shots}/ludo-friends-failure-${label}.png` });
      }
      throw error;
    } finally { await Promise.all(contexts.map(context => context.close())); }
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
