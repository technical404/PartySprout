import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";

const out = path.resolve("playwright-evidence");
fs.mkdirSync(out, { recursive: true });
const BASE = "http://localhost:8080";

const browser = await chromium.launch({ headless: true, channel: "msedge" });
const problems = [];

for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".journey-panel", { timeout: 30000 });
  await page.waitForTimeout(1200);

  // The CTA lives in the journey section, after the sticky stack.
  const btn = page.locator('section:has(.journey-panel) a[href="/request-quote"]');
  await btn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);

  const info = await btn.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const section = el.closest("section").getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      href: el.getAttribute("href"),
      w: Math.round(r.width),
      h: Math.round(r.height),
      fontSize: cs.fontSize,
      center: Math.round(r.left + r.width / 2),
      sectionCenter: Math.round(section.left + section.width / 2),
      nestedInButton: Boolean(el.closest("button")),
    };
  });

  const offset = Math.abs(info.center - info.sectionCenter);
  console.log(`\n@${width}px  <${info.tag} href="${info.href}">  ${info.w}x${info.h}px  font=${info.fontSize}`);
  console.log(`   centre: element=${info.center} section=${info.sectionCenter} drift=${offset}px`);
  console.log(`   nested inside a <button>: ${info.nestedInButton}`);

  if (info.tag !== "a") problems.push(`@${width}: CTA is not an anchor (got <${info.tag}>)`);
  if (info.nestedInButton) problems.push(`@${width}: anchor is nested inside a button`);
  if (info.href !== "/request-quote") problems.push(`@${width}: href is ${info.href}`);
  if (offset > 2) problems.push(`@${width}: button is off-centre by ${offset}px`);
  if (info.h < 50) problems.push(`@${width}: button is only ${info.h}px tall`);

  if (width === 1440) {
    await page.locator("section:has(.journey-panel)").screenshot({
      path: path.join(out, "journey-cta.png"),
    });
  }
  await page.close();
}

// Clicking it must still navigate.
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".journey-panel", { timeout: 30000 });
await page.waitForTimeout(1200);
await page.locator('section:has(.journey-panel) a[href="/request-quote"]').click();
await page.waitForTimeout(1500);
const path1 = new URL(page.url()).pathname;
console.log(`\nclick navigated to: ${path1}`);
if (path1 !== "/request-quote") problems.push(`clicking the CTA went to ${path1}`);

await browser.close();
console.log("\n================ RESULT ================");
if (problems.length === 0) console.log("CTA OK");
else problems.forEach((p) => console.log("PROBLEM: " + p));
process.exit(problems.length === 0 ? 0 : 1);
