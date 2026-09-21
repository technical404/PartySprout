import { chromium } from "playwright";

const BASE = "http://localhost:8080";
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];

await page.goto(`${BASE}/vendors/a-dash-of-magic-events`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

const openBtn = page.getByRole("button", { name: /^request quote$/i }).first();
await openBtn.click();
await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
console.log("QuoteDialog opened");

const seen = [];
for (let step = 0; step < 12; step++) {
  await page.waitForTimeout(600);
  const dialog = page.locator('[role="dialog"]');
  if ((await dialog.count()) === 0) {
    console.log(`step ${step}: dialog closed`);
    break;
  }
  const text = (await dialog.innerText()).replace(/\s+/g, " ").trim();
  if (/your request has been sent/i.test(text)) {
    console.log(`step ${step}: SUCCESS SCREEN :: ${text.slice(0, 120)}`);
    seen.push("SUCCESS");
    break;
  }
  const heading = (await dialog.locator("h2, h3").first().innerText().catch(() => "")).trim();
  seen.push(heading || text.slice(0, 60));
  console.log(`step ${step}: "${heading}" :: ${text.slice(0, 110)}`);

  // Fill any visible text inputs so a required field does not stall the wizard.
  const inputs = dialog.locator('input:not([type="checkbox"]):not([type="radio"]), textarea');
  for (let i = 0; i < (await inputs.count()); i++) {
    const el = inputs.nth(i);
    if (await el.isVisible().catch(() => false)) {
      const type = await el.getAttribute("type");
      const val = type === "email" ? "wizard@example.com" : type === "tel" ? "5550102030" : "Test value";
      if (!(await el.inputValue().catch(() => ""))) await el.fill(val).catch(() => {});
    }
  }
  // Pick the first option of any select listbox present.
  const combo = dialog.locator('button[role="combobox"]');
  if (await combo.count()) {
    const c = combo.first();
    if (await c.isVisible().catch(() => false)) {
      await c.click().catch(() => {});
      await page.waitForTimeout(300);
      const opt = page.locator('[role="option"]');
      if (await opt.count()) await opt.first().click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  // Advance: prefer an explicit next/continue/submit control. "Done" is
  // deliberately excluded — it is the success screen's dismiss button, and
  // matching it would close the dialog before we can assert on the outcome.
  const next = dialog
    .getByRole("button", { name: /^(next|continue|submit|send|send quote request|request quote|finish)$/i })
    .last();
  if ((await next.count()) === 0) {
    const anyPrimary = dialog.locator("button").last();
    if (await anyPrimary.count()) {
      await anyPrimary.click().catch(() => {});
      continue;
    }
    console.log("no advance control found");
    break;
  }
  await next.click().catch(() => {});
}

const finalText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
const success = /thank|success|sent|received|we'?ll be in touch|request is in|all set/i.test(finalText);
console.log(`\nwizard steps visited: ${seen.length}`);
console.log("reached a success-ish state:", success);
if (seen.length < 2) problems.push("QuoteDialog did not advance past the first step");

await browser.close();
console.log("\nRESULT:", problems.length === 0 ? "QuoteDialog OK" : problems.join("; "));
