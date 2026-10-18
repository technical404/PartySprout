/**
 * Focused check of the two things a geometry sweep cannot see: that clicking the date
 * box opens a calendar and that a day can then be picked from it, and that the first
 * question's dropdown is the same size as every other control.
 *
 *   node scripts/verify-date-picker.mjs
 *   PS_BASE=https://hirepartycharacters.com node scripts/verify-date-picker.mjs
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.PS_BASE || "http://127.0.0.1:8080";
const results = [];

function check(label, ok, detail = "") {
  results.push({ label, ok });
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  page.on("pageerror", (error) => console.log("  page error:", error.message));

  await page.goto(`${BASE}/request-quote`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("form select") !== null, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(400);

  /* --- the first question's dropdown, against the rest of the form ------- */
  const select = await page.evaluate(() => {
    const field = document.querySelector("form select");
    const box = field.getBoundingClientRect();
    return { w: Math.round(box.width), h: Math.round(box.height) };
  });
  console.log("event-type select:", JSON.stringify(select));
  check(
    "the dropdown is as wide as the other controls (308px)",
    Math.abs(select.w - 308) <= 2,
    `${select.w}px`,
  );
  check("and the same height (48px)", Math.abs(select.h - 48) <= 2, `${select.h}px`);

  /* --- walk to the date question --------------------------------------- */
  const dialogOrForm = page.locator("form");
  let reached = false;
  for (let step = 0; step < 5 && !reached; step += 1) {
    const question = await dialogOrForm
      .locator("label")
      .first()
      .textContent()
      .catch(() => "");
    if (/when is the party/i.test(question || "")) {
      reached = true;
      break;
    }
    const combo = dialogOrForm.locator('[role="combobox"]:visible').first();
    if (await combo.count()) {
      await combo.click();
      await page.waitForTimeout(250);
      await page.locator('[role="option"]:visible').nth(1).click();
      await page.waitForTimeout(250);
    } else {
      const select = dialogOrForm.locator("select:visible").first();
      if (await select.count()) await select.selectOption({ index: 1 });
      else await dialogOrForm.locator("input:visible").first().fill("Dallas, TX");
    }
    await dialogOrForm.locator('button:has-text("Next")').first().click();
    await page.waitForTimeout(450);
  }
  check("reached the date question", reached);

  const dateField = dialogOrForm.locator('input[placeholder="mm-dd-yyyy"]:visible').first();
  check("the date field is a real field to begin with", (await dateField.count()) > 0);

  // Before the click there should be no calendar on screen.
  const calendarsBefore = await page
    .locator('[role="dialog"]:visible, [role="grid"]:visible')
    .count();

  // A tap in the middle of the box, exactly where a thumb would land.
  await dateField.click();
  await page.waitForTimeout(600);

  const opened = await page.evaluate(() => {
    const popover = document.querySelector("[data-radix-popper-content-wrapper]");
    const grid = document.querySelector('[role="grid"]');
    const field = document.querySelector('input[placeholder="mm-dd-yyyy"]');
    return {
      popover: Boolean(popover && popover.offsetParent !== null),
      grid: Boolean(grid),
      dayButtons: document.querySelectorAll('[role="grid"] button').length,
      focusIsOnField: document.activeElement === field,
    };
  });
  console.log("after clicking the box:", JSON.stringify({ calendarsBefore, ...opened }));
  check(
    "clicking the box opens a calendar",
    opened.grid && opened.dayButtons > 20,
    JSON.stringify(opened),
  );
  check("and the caret stays in the box so typing still works", opened.focusIsOnField);

  // Pick a day and confirm it lands in the field.
  const firstDay = page.locator('[role="grid"] button:not([disabled])').nth(10);
  const dayLabel = (await firstDay.textContent())?.trim();
  await firstDay.click();
  await page.waitForTimeout(400);
  const value = await dateField.inputValue();
  check(
    "choosing a day fills the box",
    /^\d{2}-\d{2}-\d{4}$/.test(value),
    `picked "${dayLabel}" -> "${value}"`,
  );

  await page.screenshot({
    path: ".ps-assets/date-picker-open.png",
    clip: { x: 0, y: 100, width: 390, height: 420 },
  });

  await browser.close();
  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed  (${BASE})`);
  process.exit(failed.length === 0 ? 0 : 1);
})();
