/**
 * Drives the quote wizard in a real browser against a private dev server and
 * checks the three things that changed:
 *   1. "What type of event are you planning?" is the first question, with the
 *      grouped Popular / All events list.
 *   2. The entertainment categories are now their own question.
 *   3. "Where is the party?" suggests cities, and "When is the party?" opens its
 *      picker from anywhere in the box.
 * It then finishes the wizard and reads the submitted row back out of SQLite, so
 * the answer is proven to survive the whole trip. The probe row is deleted.
 *
 * Run: node scripts/verify-quote-form-live.mjs
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const PORT = 8787;
const BASE = `http://localhost:${PORT}`;
const PROBE_EMAIL = `event-type-ui-${Date.now()}@example.test`;

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const server = spawn(`npx vite dev --port ${PORT} --strictPort`, { shell: true, stdio: "ignore" });

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const res = await fetch(`${BASE}/request-quote`);
      if (res.ok) return true;
    } catch {
      /* not listening yet */
    }
    await sleep(1000);
  }
  return false;
}

async function main() {
  if (!(await waitForServer())) throw new Error(`dev server never answered on ${BASE}`);
  console.log(`dev server up on ${BASE}\n`);

  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  // Record whether the click handler asked the browser for the picker.
  await page.addInitScript(() => {
    window.__pickerCalls = 0;
    const original = HTMLInputElement.prototype.showPicker;
    HTMLInputElement.prototype.showPicker = function patched(...args) {
      window.__pickerCalls += 1;
      try {
        return original.apply(this, args);
      } catch {
        return undefined;
      }
    };
  });

  await page.goto(`${BASE}/request-quote`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("form", { timeout: 30000 });
  page.setDefaultTimeout(10000);

  const heading = () =>
    page
      .locator("form label")
      .first()
      .innerText()
      .then((text) => text.trim());

  // --- 1. the event question, with the grouped list ------------------------
  const first = await heading();
  check(
    'the first question is "What type of event are you planning?"',
    first === "What type of event are you planning?",
    first,
  );

  const select = page.locator("form select");
  check("the first question is a grouped select", (await select.count()) === 1);
  const groups = await select
    .locator("optgroup")
    .evaluateAll((nodes) => nodes.map((node) => node.label));
  check(
    "it has the Popular and All events groups",
    groups.join("|") === "Popular|All events",
    groups.join("|"),
  );
  const popular = await select
    .locator('optgroup[label="Popular"] option')
    .evaluateAll((nodes) => nodes.map((n) => n.value));
  const all = await select
    .locator('optgroup[label="All events"] option')
    .evaluateAll((nodes) => nodes.map((n) => n.value));
  check(
    "Popular holds the 15 options from the screenshot",
    popular.length === 15 &&
      popular[0] === "Birthday (Adult)" &&
      popular.includes("Personal Occasion") &&
      popular.includes("Wedding Reception"),
    `${popular.length} options`,
  );
  check(
    "All events is alphabetical and complete",
    all.length === 28 &&
      all[0] === "Anniversary Party" &&
      all.includes("Baby Shower") &&
      all.includes("Prom"),
    `${all.length} options`,
  );

  await select.selectOption("Birthday (Child)");
  await page.getByRole("button", { name: /^next$/i }).click();
  await page.waitForTimeout(500);

  // --- 2. the entertainment question on its own ----------------------------
  const second = await heading();
  check(
    "the categories now have their own question",
    second === "What kind of entertainment are you looking for?",
    second,
  );
  const combo = page.locator('button[role="combobox"]').first();
  await combo.click();
  await page.waitForTimeout(400);
  const options = await page.locator('[role="option"]').allInnerTexts();
  check(
    "it lists the real entertainment categories",
    options.length >= 8 &&
      options.some((text) => /superhero/i.test(text)) &&
      options.some((text) => /magician/i.test(text)),
    options
      .map((t) => t.trim())
      .join(", ")
      .slice(0, 90),
  );
  await page
    .locator('[role="option"]', { hasText: /superhero/i })
    .first()
    .click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^next$/i }).click();
  await page.waitForTimeout(500);

  // --- 3. city suggestions -------------------------------------------------
  const cityHeading = await heading();
  check(
    'the third question is still "Where is the party?"',
    /^where is the party\?$/i.test(cityHeading),
    cityHeading,
  );
  const cityInput = page.locator("form input").first();
  await cityInput.fill("dal");
  await page.waitForTimeout(900);
  const suggestions = await page.locator(".search-suggest button").allInnerTexts();
  check(
    "typing a city shows a suggestion list",
    suggestions.length > 0,
    suggestions
      .map((t) => t.replace(/\s+/g, " ").trim())
      .slice(0, 3)
      .join(" | "),
  );
  check(
    "the suggestions carry a business count",
    suggestions.length > 0 && /business/i.test(suggestions[0]),
    suggestions[0]?.replace(/\s+/g, " "),
  );
  const chosen = suggestions[0]
    ?.replace(/\s+/g, " ")
    .trim()
    .replace(/\s*\d+ businesses?$/, "")
    .trim();
  await page.locator(".search-suggest button").first().click();
  await page.waitForTimeout(300);
  const cityValue = await cityInput.inputValue();
  check(
    "picking a suggestion fills the field",
    cityValue === chosen,
    `"${cityValue}" vs "${chosen}"`,
  );
  await page.getByRole("button", { name: /^next$/i }).click();
  await page.waitForTimeout(500);

  // --- 4. the date box opens the picker -----------------------------------
  const dateHeading = await heading();
  check(
    'the fourth question is still "When is the party?"',
    /^when is the party\?$/i.test(dateHeading),
    dateHeading,
  );
  const dateInput = page.locator('form input[type="date"]');
  check(
    "the date input carries the .date-field hook",
    (await dateInput.getAttribute("class"))?.includes("date-field") === true,
    await dateInput.getAttribute("class"),
  );
  const cursor = await dateInput.evaluate((node) => getComputedStyle(node).cursor);
  check("the whole box shows a pointer cursor", cursor === "pointer", cursor);
  const rule = await page.evaluate(() =>
    [...document.styleSheets].some((sheet) => {
      try {
        return [...sheet.cssRules].some(
          (r) =>
            r.cssText.includes("date-field") && r.cssText.includes("calendar-picker-indicator"),
        );
      } catch {
        return false;
      }
    }),
  );
  check("the calendar glyph is stretched over the field", rule);
  await dateInput.fill("2026-12-05");
  const valueBefore = await dateInput.inputValue();
  await dateInput.click();
  await page.waitForTimeout(300);
  const pickerCalls = await page.evaluate(() => window.__pickerCalls);
  check("clicking the box asks for the picker", pickerCalls > 0, `${pickerCalls} call(s)`);
  check(
    "the date value is unchanged by the click",
    (await dateInput.inputValue()) === valueBefore,
    valueBefore,
  );
  await page.getByRole("button", { name: /^next$/i }).click();
  await page.waitForTimeout(400);

  // --- 5. finish the wizard -----------------------------------------------
  // Walk whatever is left the way scripts/verify-quote-dialog.mjs does: answer
  // every control the current step shows, then advance.
  for (let step = 0; step < 14; step++) {
    if (/your request is in/i.test(await page.locator("body").innerText())) break;

    const answerSelect = page.locator("form select");
    if ((await answerSelect.count()) > 0 && !(await answerSelect.first().inputValue())) {
      const value = await answerSelect
        .first()
        .locator("option:not([disabled])")
        .first()
        .getAttribute("value");
      if (value) await answerSelect.first().selectOption(value);
    }

    const combo = page.locator('form button[role="combobox"]');
    if ((await combo.count()) > 0) {
      await combo
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(250);
      const option = page.locator('[role="option"]');
      if ((await option.count()) > 0)
        await option
          .first()
          .click()
          .catch(() => {});
    }

    const inputs = page.locator("form input, form textarea");
    for (let index = 0; index < (await inputs.count()); index++) {
      const field = inputs.nth(index);
      if (!(await field.isVisible().catch(() => false))) continue;
      if (await field.inputValue().catch(() => "")) continue;
      const type = await field.getAttribute("type");
      const value =
        type === "email"
          ? PROBE_EMAIL
          : type === "tel"
            ? "5550102030"
            : type === "date"
              ? "2026-12-05"
              : type === "number"
                ? "15"
                : "Test value";
      await field.fill(value).catch(() => {});
    }

    await page.waitForTimeout(250);
    const advance = page.getByRole("button", { name: /^(next|send quote request)$/i }).last();
    if ((await advance.count()) === 0) {
      check(
        "every step offered a way forward",
        false,
        (await page.locator("body").innerText()).slice(0, 160),
      );
      break;
    }
    await advance.click().catch(() => {});
    await page.waitForTimeout(700);
  }

  const submitted = /your request is in/i.test(await page.locator("body").innerText());
  check("the wizard still submits end to end", submitted);
  if (!submitted) {
    console.log(
      `  page said: ${(await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300)}`,
    );
    console.log(`  page errors: ${pageErrors.join(" | ") || "none"}`);
  }

  // The party builder asks the same "When is the party?" question, so its date
  // box gets the same treatment.
  await page.goto(`${BASE}/party-builder`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const builderDate = page.locator('input[type="date"]').first();
  check(
    "the party builder's date box is clickable end to end",
    ((await builderDate.getAttribute("class")) ?? "").includes("date-field") &&
      (await builderDate.evaluate((node) => getComputedStyle(node).cursor)) === "pointer",
    await builderDate.getAttribute("class"),
  );

  check("no uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
  await browser.close();

  // --- 6. what actually landed in the database -----------------------------
  // The dev server writes to the same SQLite file, so read it directly.
  const { db, close } = require("../Database/index.js");
  const row = db.prepare("SELECT * FROM quote_requests WHERE email = ?").get(PROBE_EMAIL);
  check("the submitted row exists", Boolean(row), row ? `id ${row.id}` : "missing");
  check(
    "it stored the event type chosen in the browser",
    row?.event_type === "Birthday (Child)",
    `event_type=${JSON.stringify(row?.event_type)}`,
  );
  check(
    "it stored the suggested city",
    /dallas/i.test(row?.city ?? ""),
    `city=${JSON.stringify(row?.city)}`,
  );
  check(
    "it stored the category and the date",
    row?.category_slug === "superheroes" && row?.event_date === "2026-12-05",
    `category=${row?.category_slug} date=${row?.event_date}`,
  );
  // Sweep by pattern rather than by the exact email the form was filled with, so
  // no probe row from any run of this script survives into the next one. Clicking
  // the last step twice can leave a second POST in flight, so let the dust settle
  // and look again rather than reading the table the instant the browser closes.
  const sweep = () =>
    db.prepare("DELETE FROM quote_requests WHERE email LIKE 'event-type-%@example.test'").run();
  const probesLeft = () =>
    db
      .prepare(
        "SELECT COUNT(*) AS total FROM quote_requests WHERE email LIKE 'event-type-%@example.test'",
      )
      .get().total;
  await sleep(2000);
  sweep();
  await sleep(1500);
  sweep();
  const left = probesLeft();
  check("the probe row was removed again", left === 0, `${left} probe row(s) left`);
  close();
}

main()
  .catch((error) => {
    console.error(`\n${error.stack || error}`);
    process.exitCode = 1;
  })
  .finally(() => {
    const failed = checks.filter((item) => !item.ok);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
    const code = failed.length > 0 || process.exitCode ? 1 : 0;
    process.exitCode = code;
    // Kill the dev server tree, then leave: a lingering child handle would hang
    // the run (there is no browser left to talk to at this point).
    if (server.pid)
      spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    setTimeout(() => process.exit(code), 1500);
  });
