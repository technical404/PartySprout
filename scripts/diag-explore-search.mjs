import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";

const out = path.resolve("playwright-evidence");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: "msedge" });
for (const [w, h, tag] of [
  [1440, 900, "desktop"],
  [390, 844, "mobile"],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto("http://localhost:8080/explore", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const shell = page.locator(".search-shell").first();
  if ((await shell.count()) === 0) {
    console.log(`${tag}: no search shell on /explore`);
    await page.close();
    continue;
  }
  const info = await shell.evaluate((s) => {
    const b = s.getBoundingClientRect();
    return {
      w: Math.round(b.width),
      h: Math.round(b.height),
      rows: new Set([...s.children].map((c) => Math.round(c.getBoundingClientRect().top))).size,
      fields: [...s.querySelectorAll(".search-field")].map((f) => {
        const i = f.querySelector("input");
        const svg = f.querySelector("svg");
        return {
          label: f.querySelector("label")?.textContent,
          w: Math.round(f.getBoundingClientRect().width),
          iconW: svg ? Math.round(svg.getBoundingClientRect().width) : 0,
          clipped: i ? i.scrollWidth > i.clientWidth + 1 : false,
        };
      }),
    };
  });
  console.log(`${tag}: shell ${info.w}x${info.h}, ${info.rows} row(s)`);
  for (const f of info.fields) console.log(`   ${f.label}  w=${f.w} icon=${f.iconW} clipped=${f.clipped}`);
  await shell.screenshot({ path: path.join(out, `explore-search-${tag}.png`) });
  await page.close();
}
await browser.close();
console.log("wrote explore-search-desktop.png, explore-search-mobile.png");
