import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";

const out = path.resolve("playwright-evidence");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto("http://localhost:8080", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#party-date", { timeout: 30000 });
await page.waitForTimeout(1200);

const info = await page.evaluate(() => {
  const input = document.querySelector("#party-date");
  const field = input.closest(".search-field");
  const wrap = input.parentElement;
  const svg = wrap.querySelector("svg");
  const cs = getComputedStyle(input);
  const wrapCs = getComputedStyle(wrap);
  const svgCs = svg ? getComputedStyle(svg) : null;
  const ir = input.getBoundingClientRect();
  const fr = field.getBoundingClientRect();
  const sr = svg ? svg.getBoundingClientRect() : null;
  return {
    fieldBox: { left: Math.round(fr.left), width: Math.round(fr.width) },
    inputBox: { left: Math.round(ir.left), width: Math.round(ir.width) },
    inputPaddingLeft: cs.paddingLeft,
    inputPaddingRight: cs.paddingRight,
    inputTextAlign: cs.textAlign,
    inputDirection: cs.direction,
    wrapPosition: wrapCs.position,
    wrapClass: wrap.className,
    svgBox: sr ? { left: Math.round(sr.left), width: Math.round(sr.width) } : null,
    svgPosition: svgCs?.position,
    svgLeft: svgCs?.left,
    svgTransform: svgCs?.transform,
  };
});
console.log("date field geometry:", JSON.stringify(info, null, 2));

// Crop the hero search shell so the alignment is visible.
const shell = page.locator(".search-shell").first();
await shell.screenshot({ path: path.join(out, "hero-search.png") });

const field = page.locator("#party-date").locator("xpath=ancestor::div[contains(@class,'search-field')]");
await field.screenshot({ path: path.join(out, "date-field.png") });

// Also screenshot with a value typed, since that is when alignment matters.
await page.fill("#party-date", "2026-10-24");
await page.waitForTimeout(500);
await field.screenshot({ path: path.join(out, "date-field-filled.png") });
console.log("screenshots: hero-search.png, date-field.png, date-field-filled.png");

await browser.close();
