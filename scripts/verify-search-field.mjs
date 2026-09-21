import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";

const out = path.resolve("playwright-evidence");
fs.mkdirSync(out, { recursive: true });
const BASE = "http://localhost:8080";
const problems = [];
const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  problems.push(m);
};

const probe = (page) =>
  page.evaluate(() => {
    const shell = document.querySelector(".search-shell");
    const sb = shell.getBoundingClientRect();
    const fields = [...shell.querySelectorAll(".search-field")].map((f) => {
      const wrap = f.querySelector(":scope > div");
      const svg = wrap.querySelector("svg");
      const input = wrap.querySelector("input");
      const fr = f.getBoundingClientRect();
      const ir = input.getBoundingClientRect();
      const sr = svg ? svg.getBoundingClientRect() : null;
      return {
        label: f.querySelector("label")?.textContent ?? "?",
        type: input.getAttribute("type") || "text",
        fieldW: Math.round(fr.width),
        fieldLeft: Math.round(fr.left),
        fieldRight: Math.round(fr.right),
        svgW: sr ? Math.round(sr.width) : 0,
        // distance from the field's content edge to the input's box
        textOffset: Math.round(ir.left - (fr.left + parseFloat(getComputedStyle(f).paddingLeft))),
        clipped: input.scrollWidth > input.clientWidth + 1,
      };
    });
    const button = shell.querySelector("button");
    const br = button.getBoundingClientRect();
    const cs = getComputedStyle(shell);
    // the grid's usable content box
    const contentRight = sb.right - parseFloat(cs.paddingRight);
    const contentLeft = sb.left + parseFloat(cs.paddingLeft);
    const last = fields.at(-1);
    return {
      shellLeft: Math.round(sb.left),
      shellRight: Math.round(sb.right),
      contentWidth: Math.round(contentRight - contentLeft),
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
      fields,
      lastFieldRight: Math.round(last.fieldRight),
      trailingGap: Math.round(contentRight - last.fieldRight),
      button: { w: Math.round(br.width), left: Math.round(br.left), top: Math.round(br.top) },
      hasChips: Boolean(shell.querySelector(".col-span-full")),
    };
  });

const browser = await chromium.launch({ headless: true, channel: "msedge" });

// ---------- 1. desktop hero ----------
console.log("\n[1] hero search bar @1440");
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#party-date", { timeout: 30000 });
  await page.waitForTimeout(1000);
  const d = await probe(page);

  const date = d.fields.find((f) => f.type === "date");
  for (const f of d.fields) {
    if (f.svgW < 14) bad(`"${f.label}" icon is ${f.svgW}px (expected >= 14)`);
  }
  if (d.fields.every((f) => f.svgW >= 14)) ok("all 4 field icons render at full size");

  const offsets = d.fields.map((f) => f.textOffset);
  const spread = Math.max(...offsets) - Math.min(...offsets);
  if (spread > 2) bad(`field text offsets differ by ${spread}px: ${offsets.join(", ")}`);
  else ok(`every field's text starts at the same offset (${offsets.join(", ")}px)`);

  if (date.clipped) bad("the date input's content is clipped");
  else ok(`date input has room (${date.fieldW}px field, not clipped)`);

  if (d.trailingGap > 20) bad(`dead space at the right of the field row: ${d.trailingGap}px`);
  else ok(`no dead space at the right of the row (${d.trailingGap}px = shell padding)`);

  if (Math.abs(d.button.w - d.contentWidth) > 2)
    bad(`submit button is ${d.button.w}px, expected full width ${d.contentWidth}px`);
  else ok(`submit button spans the full row (${d.button.w}px)`);

  if (d.docOverflow > 1) bad(`page overflows horizontally by ${d.docOverflow}px`);
  else ok("no horizontal overflow");

  await page.locator(".search-shell").first().screenshot({ path: path.join(out, "search-desktop.png") });
  await page.close();
}

// ---------- 2. chips state (the case I touched) ----------
console.log("\n[2] hero search bar with result chips @1440");
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#hero-query", { timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.fill("#hero-query", "superhero");
  await page.waitForTimeout(700);
  const d = await probe(page);
  console.log("     chips rendered:", d.hasChips);
  if (d.hasChips) {
    if (Math.abs(d.button.w - d.contentWidth) > 2)
      bad(`with chips, button is ${d.button.w}px, expected full width ${d.contentWidth}px`);
    else ok(`with chips, button still spans the full row (${d.button.w}px)`);
    if (d.button.top <= d.fields.at(-1).fieldRight * 0) ok("button sits below the fields");
  } else {
    console.log("     (no chips for this query; skipping)");
  }
  await page.locator(".search-shell").first().screenshot({ path: path.join(out, "search-chips.png") });
  await page.close();
}

// ---------- 3. mobile ----------
console.log("\n[3] hero search bar @390");
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#party-date", { timeout: 30000 });
  await page.waitForTimeout(1000);
  const d = await probe(page);
  const r = await page.evaluate(() => {
    const s = document.querySelector(".search-shell").getBoundingClientRect();
    const f = [...document.querySelectorAll(".search-shell .search-field")].map((x) => {
      const b = x.getBoundingClientRect();
      return { l: Math.round(b.left), w: Math.round(b.width), r: Math.round(b.right) };
    });
    return { shell: { l: Math.round(s.left), r: Math.round(s.right) }, f };
  });
  console.log("     fields:", JSON.stringify(r.f));
  for (const f of d.fields) if (f.clipped) bad(`@390 "${f.label}" input is clipped`);
  const allStacked = r.f.every((x, i) => i === 0 || x.l === r.f[0].l);
  if (allStacked) ok("fields stack full-width on mobile");
  else bad("mobile fields are not stacked");
  if (d.docOverflow > 1) bad(`@390 horizontal overflow ${d.docOverflow}px`);
  else ok("no horizontal overflow on mobile");
  await page.locator(".search-shell").first().screenshot({ path: path.join(out, "search-mobile.png") });
  await page.close();
}

// ---------- 4. Explore compact bar (must be untouched) ----------
console.log("\n[4] explore page compact search bar @1440");
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE + "/explore", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const found = await page.locator(".search-shell-compact").count();
  if (found === 0) {
    console.log("     (no compact shell on /explore; skipping)");
  } else {
    const r = await page.locator(".search-shell-compact").first().evaluate((shell) => {
      const sb = shell.getBoundingClientRect();
      const btn = shell.querySelector("button");
      const br = btn.getBoundingClientRect();
      const kids = [...shell.children].map((c) => {
        const b = c.getBoundingClientRect();
        return { tag: c.tagName.toLowerCase(), l: Math.round(b.left), w: Math.round(b.width), t: Math.round(b.top) };
      });
      return { shellW: Math.round(sb.width), buttonW: Math.round(br.width), kids };
    });
    console.log("     compact shell:", JSON.stringify(r));
    // In compact mode the button is its own auto column, NOT a full-width row.
    const fullWidth = Math.abs(r.buttonW - r.shellW) < 3;
    if (fullWidth) bad("compact search button is full-width; compact layout regressed");
    else ok(`compact layout intact (button ${r.buttonW}px in a ${r.shellW}px bar)`);
  }
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (ov > 1) bad(`/explore horizontal overflow ${ov}px`);
  else ok("/explore has no horizontal overflow");
  await page.close();
}

await browser.close();
console.log("\n================ RESULT ================");
if (problems.length === 0) console.log("SEARCH BAR OK");
else problems.forEach((p) => console.log("PROBLEM: " + p));
process.exit(problems.length ? 1 : 0);
