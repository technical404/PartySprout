import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const out = path.resolve("playwright-evidence");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const base = process.env.APP_URL || "http://localhost:8080";

async function shot(name, url) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, name), fullPage: true });
}

const home = await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
console.log("home", home?.status());
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(out, "01-home.png"), fullPage: true });

const api = await page.evaluate(async () => {
  const cats = await fetch("/api/categories").then((r) => r.json());
  const listings = await fetch("/api/listings?pageSize=5").then((r) => r.json());
  return { catCount: cats.length, listingTotal: listings.total, first: listings.items?.[0]?.name };
});
console.log("api", api);

await page.goto(`${base}/search`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1200);
const before = await page.evaluate(() => ({ y: window.scrollY, h: document.documentElement.scrollHeight }));
await page.mouse.wheel(0, 1800);
await page.waitForTimeout(400);
const after = await page.evaluate(() => ({ y: window.scrollY, h: document.documentElement.scrollHeight }));
console.log("scroll", { before, after });
await page.screenshot({ path: path.join(out, "02-search.png"), fullPage: true });

await shot("03-explore.png", `${base}/explore`);

const html = await page.content();
console.log("lovable-in-html", /lovable/i.test(html));

await browser.close();
if (!api.listingTotal) process.exit(1);
if (after.y <= before.y && after.h <= 1000) process.exit(2);
console.log("ok", out);
