import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
const page = await browser.newPage();
await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.setItem("ludo:world", "candy-kingdom-war-mvn2aphw"));
await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1500));
console.log(await page.evaluate(() => {
  const names = [];
  for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) if (r.type === 7) names.push(r.name); } catch {} }
  const s = [...document.querySelectorAll("span")].find((x) => x.style.animation.includes("fall"));
  return JSON.stringify({ names, anim: s?.style.animation, comp: s && getComputedStyle(s).animationName, t: s && getComputedStyle(s).transform });
}));
await browser.close();
