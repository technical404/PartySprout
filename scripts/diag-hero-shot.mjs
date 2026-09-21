import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";

const out = path.resolve("playwright-evidence");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:8080", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#party-date", { timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(out, "hero-in-context.png") });
await browser.close();
console.log("wrote hero-in-context.png");
