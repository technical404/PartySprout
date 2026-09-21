import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:8080", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#hero-query", { timeout: 30000 });
await page.waitForTimeout(1200);
await page.fill("#hero-query", "superhero");
await page.waitForTimeout(700);

const measure = () =>
  page.locator(".search-shell").first().evaluate((s) => {
    const sb = s.getBoundingClientRect();
    const b = s.querySelector("button").getBoundingClientRect();
    return {
      chips: Boolean(s.querySelector(".col-span-full")),
      buttonW: Math.round(b.width),
      contentW: Math.round(sb.width - parseFloat(getComputedStyle(s).paddingLeft) * 2),
    };
  });

const now = await measure();
console.log("with my fix:      ", JSON.stringify(now));

// Simulate the old rule, where the button had no explicit full-width declaration.
await page.addStyleTag({ content: ".search-shell > button { grid-column: auto !important; }" });
await page.waitForTimeout(300);
const before = await measure();
console.log("without that rule:", JSON.stringify(before));

await browser.close();
