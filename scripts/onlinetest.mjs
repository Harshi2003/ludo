// Two real browsers play online: host on desktop, guest on a phone viewport.
import puppeteer from "puppeteer-core";
const out = process.argv[2] ?? ".";
const base = process.env.URL ?? "http://localhost:3000";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--use-angle=d3d11"] });
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const watch = (p, tag) => {
  p.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
  p.on("console", (m) => m.type() === "error" && errors.push(`[${tag}] ${m.text()}`));
};
const clickText = (p, t) => p.evaluate((t) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(t) && !b.disabled)?.click(), t);
const state = (p) => p.evaluate(() => { const s = window.__ludo?.state(); return s && { round: s.round, turn: s.turn, phase: s.phase, tiles: s.players.map((x) => x.tile), winner: s.winner }; });

const hostCtx = await browser.createBrowserContext();
const guestCtx = await browser.createBrowserContext();
const host = await hostCtx.newPage();
watch(host, "host");
await host.setViewport({ width: 1280, height: 800 });
await host.goto(`${base}/online`, { waitUntil: "networkidle0" });
await host.waitForFunction(() => document.body.textContent.includes("Connected"), { timeout: 15000 });
await host.type("#name", "Ana");
await clickText(host, "CREATE ROOM");
await host.waitForFunction(() => document.body.textContent.includes("Room code"), { timeout: 15000 });
const code = await host.evaluate(() => [...document.querySelectorAll("div")].find((d) => /^[A-Z2-9]{5}$/.test(d.textContent ?? ""))?.textContent);
console.log("room code:", code);

let guest = await guestCtx.newPage();
watch(guest, "guest");
const phone = { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true };
await guest.setViewport(phone);
await guest.goto(`${base}/online?room=${code}`, { waitUntil: "networkidle0" });
await guest.waitForFunction(() => document.body.textContent.includes("Connected"), { timeout: 15000 });
await guest.type("#name", "Ben");
await clickText(guest, "Join");
await host.waitForFunction(() => document.body.textContent.includes("Ben"), { timeout: 15000 });
await clickText(host, "3 seats");
await sleep(500);
await host.screenshot({ path: `${out}/online-lobby.png`, fullPage: true });
await clickText(host, "START THE BATTLE");
await Promise.all([host, guest].map((p) => p.waitForFunction(() => !!window.__ludo, { timeout: 30000 })));
console.log("both in game");

// Each client plays its own turns: roll when the dice is enabled, pick the first glowing tile.
async function playFor(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    for (const p of [host, guest]) {
      if (p.isClosed()) continue;
      await p.evaluate(() => {
        const btn = document.querySelector('button[aria-label="Roll the dice"]');
        if (btn && !btn.disabled) btn.click();
        else if (document.body.textContent.includes("choose a glowing tile")) window.__ludo?.pick(0);
      }).catch(() => {});
    }
    await sleep(700);
  }
}
await playFor(30000);
const [a, b] = [await state(host), await state(guest)];
console.log("host  ", JSON.stringify(a));
console.log("guest ", JSON.stringify(b));
await host.screenshot({ path: `${out}/online-host.png` });
await guest.screenshot({ path: `${out}/online-guest.png` });

// Guest drops; the bot covers; guest comes back to the same seat.
await guest.close();
await sleep(12000);
const away = await host.evaluate(() => document.body.textContent.includes("AWAY"));
console.log("host sees guest covered by bot:", away);
guest = await guestCtx.newPage();
watch(guest, "guest2");
await guest.setViewport(phone);
await guest.goto(`${base}/online`, { waitUntil: "networkidle0" });
await guest.waitForFunction(() => !!window.__ludo, { timeout: 20000 });
await sleep(4000);
console.log("guest rejoined game:", JSON.stringify(await state(guest)));
console.log("host now:          ", JSON.stringify(await state(host)));
await guest.screenshot({ path: `${out}/online-rejoin.png` });
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no browser errors");
await browser.close();
