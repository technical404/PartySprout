import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";

const out = path.resolve("playwright-evidence");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 });
await page.goto("http://localhost:8080", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#party-date", { timeout: 30000 });
await page.waitForTimeout(1200);

// Fill so the rendered date text is visible, then blur so no segment is selected.
await page.fill("#party-date", "2026-10-24");
await page.locator("#party-date").blur();
await page.waitForTimeout(500);

const when = page.locator("#party-date").locator("xpath=ancestor::div[contains(@class,'search-field')]");
await when.screenshot({ path: path.join(out, "zoom-when.png") });

const where = page.locator("#hero-location").locator("xpath=ancestor::div[contains(@class,'search-field')]");
await where.screenshot({ path: path.join(out, "zoom-where.png") });

// Pixel-level: where does the first dark pixel of the field content start?
const probe = await page.evaluate(() => {
  const read = (sel, label) => {
    const input = document.querySelector(sel);
    const field = input.closest(".search-field");
    const wrap = input.parentElement;
    const svg = wrap.querySelector("svg");
    const fr = field.getBoundingClientRect();
    const ir = input.getBoundingClientRect();
    const sr = svg ? svg.getBoundingClientRect() : null;
    const ics = getComputedStyle(input);
    return {
      label,
      fieldW: Math.round(fr.width),
      fieldPadLeft: getComputedStyle(field).paddingLeft,
      svgW: sr ? Math.round(sr.width) : 0,
      inputW: Math.round(ir.width),
      inputPadLeft: ics.paddingLeft,
      inputPadRight: ics.paddingRight,
      inputTextAlign: ics.textAlign,
      inputFlex: ics.flex,
      inputMinWidth: ics.minWidth,
      inputWidthStyle: ics.width,
      // px of the input box left of the field's content edge
      inputOffsetInField: Math.round(ir.left - (fr.left + parseFloat(getComputedStyle(field).paddingLeft))),
      // does the input's content overflow its own box?
      scrollW: input.scrollWidth,
      clientW: input.clientWidth,
      contentClipped: input.scrollWidth > input.clientWidth + 1,
      fieldOverflowsRight: Math.round(ir.right - (fr.right - parseFloat(getComputedStyle(field).paddingRight))),
    };
  };
  return [read("#party-date", "When? (date)"), read("#hero-location", "Where? (text)")];
});
console.log(JSON.stringify(probe, null, 2));

await browser.close();
console.log("wrote zoom-when.png, zoom-where.png");
