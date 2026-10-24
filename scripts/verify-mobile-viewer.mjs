import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

/**
 * Checks the viewer on a phone: the header's call button, the menu sheet, the size of
 * every control in the quote form, the listing page's own buttons and the city a quote
 * form opens with.
 *
 *   node scripts/verify-mobile-viewer.mjs
 *   PS_BASE=https://hirepartycharacters.com node scripts/verify-mobile-viewer.mjs
 *
 * Measurements are asserted, not eyeballed, because the failures this guards against were
 * all a few pixels or one missing event: a number that would not fit beside the logo, a
 * menu that stayed open over the page it had just opened, one dropdown narrower than the
 * rest of its form, and a quote form that asked where the party was without answering.
 * The live site's bundle arrives over the network, so run it against a built or live site
 * rather than mid-HMR.
 */

const BASE = process.env.PS_BASE || "http://127.0.0.1:8080";
const VENDOR = process.env.PS_VENDOR || "/vendors/party-characters-for-hire";
const SEARCH_CITY = "Dallas";

const results = [];
function check(label, ok, detail = "") {
  results.push({ label, ok });
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
}

/** Radix only puts data-state on the trigger once React has taken over. */
const ready = (page) =>
  page
    .waitForFunction(
      () =>
        Boolean(
          document.querySelector('header [aria-label="Open menu"]')?.hasAttribute("data-state"),
        ),
      null,
      { timeout: 30000 },
    )
    .then(() => true)
    .catch(() => false);

const headerButton = (page) =>
  page.evaluate(() => {
    const button = document.querySelector('header a[href^="tel:"]');
    if (!button) return null;
    const box = button.getBoundingClientRect();
    const brand = document.querySelector('header a[href="/"]')?.getBoundingClientRect() ?? null;
    return {
      label: button.textContent.replace(/\s+/g, " ").trim(),
      width: Math.round(box.width),
      left: Math.round(box.left),
      right: Math.round(box.right),
      brandRight: brand ? Math.round(brand.right) : null,
      overlapsBrand: brand ? box.left < brand.right : null,
      overflows: box.left < 0 || box.right > window.innerWidth,
    };
  });

const menuState = (page) =>
  page.evaluate(() => ({
    trigger: document.querySelector('header [aria-label="Open menu"]')?.getAttribute("data-state"),
    panels: document.querySelectorAll('[role="dialog"]').length,
    hasCallUs: /call us/i.test(document.querySelector('[role="dialog"]')?.textContent ?? ""),
  }));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  page.on("pageerror", (error) => console.log("  page error:", error.message));

  /* --- the header's call button ---------------------------------------- */
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  check("the home page hydrates", await ready(page));
  await page.waitForTimeout(300);

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(350);
    const button = await headerButton(page);
    console.log(`  @${width}px call button: ${JSON.stringify(button)}`);
    check(
      `@${width}px the call button carries a phone number`,
      /\d[\d\s().-]{8,}\d/.test(button?.label ?? ""),
      button?.label,
    );
    check(`@${width}px it clears the logo`, button?.overlapsBrand === false);
    check(`@${width}px it stays on screen`, button?.overflows === false);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);

  /* --- the menu sheet --------------------------------------------------- */
  let opened = false;
  for (let attempt = 0; attempt < 3 && !opened; attempt += 1) {
    if ((await menuState(page)).trigger === "open") opened = true;
    else {
      await page.click('header [aria-label="Open menu"]');
      await page.waitForTimeout(500);
    }
  }
  const sheet = await menuState(page);
  check("the menu opens", sheet.trigger === "open", JSON.stringify(sheet));
  check("the menu offers a Call us button too", sheet.hasCallUs);

  await page.click('[role="dialog"] a[href="/explore"]');
  await page.waitForTimeout(120);
  const leaving = await menuState(page);
  await page.waitForTimeout(800);
  const gone = await menuState(page);
  const landed = await page.evaluate(() => location.pathname);
  console.log(
    `  on the way out: ${JSON.stringify(leaving)} -> ${JSON.stringify(gone)} (${landed})`,
  );
  check(
    "the menu starts closing as the next page opens",
    leaving.trigger === "closed" || leaving.panels === 0,
    JSON.stringify(leaving),
  );
  check("and it is gone once the page has arrived", gone.panels === 0, JSON.stringify(gone));

  /* --- the quote form's controls --------------------------------------- */
  /** Fills whatever the current step is asking for, then moves on. Uses real
   * interactions: setting .value on a React-controlled field does nothing, which is how
   * an earlier version of this check sat on step one and called it a walk. */
  async function fillStep(scope) {
    const combo = scope.locator('[role="combobox"]:visible').first();
    if (await combo.count()) {
      await combo.click();
      await page.waitForTimeout(250);
      await page.locator('[role="option"]:visible').nth(1).click();
      await page.waitForTimeout(250);
      return "combobox";
    }
    const select = scope.locator("select:visible").first();
    if (await select.count()) {
      await select.selectOption({ index: 1 });
      return "select";
    }
    const field = scope.locator("input:visible, textarea:visible").first();
    if (!(await field.count())) return "nothing";
    const type = await field.getAttribute("type");
    const inputMode = await field.getAttribute("inputmode");
    const placeholder = (await field.getAttribute("placeholder")) || "";
    if (placeholder.includes("mm-dd-yyyy")) await field.fill("12-25-2026");
    else if (type === "email") await field.fill("viewer@example.test");
    else if (type === "tel") await field.fill("5550102030");
    else if (inputMode === "numeric") await field.fill("10");
    else await field.fill("Dallas, TX");
    return `input:${type || placeholder}`;
  }

  const questionOf = (scope) =>
    scope
      .locator("label:visible")
      .first()
      .textContent()
      .then((text) => text.replace(/\s+/g, " ").trim().slice(0, 44))
      .catch(() => "");

  await page.goto(`${BASE}/request-quote`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.waitForFunction(() => document.querySelector("form select") !== null, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(300);

  const form = page.locator("form");
  const outliers = [];
  const seen = new Set();
  let sent = false;
  for (let step = 0; step < 12; step += 1) {
    const question = await questionOf(form);
    if (seen.has(question)) {
      console.log(`  (back on an earlier question: "${question}")`);
      break;
    }
    seen.add(question);

    const controls = await page.evaluate(() => {
      // The hidden native selects behind a Radix combobox are 1px; the visible control is
      // the one that matters.
      const nodes = [
        ...document.querySelectorAll(
          'form input, form select, form textarea, form [role="combobox"]',
        ),
      ];
      return nodes
        .filter((node) => node.offsetParent !== null && node.getBoundingClientRect().height > 4)
        .map((node) => {
          const box = node.getBoundingClientRect();
          return {
            tag: node.tagName.toLowerCase(),
            height: Math.round(box.height),
            width: Math.round(box.width),
            placeholder: node.getAttribute("placeholder") || "",
          };
        });
    });
    console.log(
      `  step ${step} "${question}": ${controls.map((c) => `${c.tag} ${c.width}x${c.height}`).join(", ") || "(none)"}`,
    );
    for (const control of controls) {
      const label = `step ${step} ${control.tag}${control.placeholder ? ` [${control.placeholder}]` : ""}`;
      // A textarea is a box of prose, not a one-line field: only its width is comparable.
      if (control.tag !== "textarea" && control.height !== 48)
        outliers.push(`${label} height ${control.height}`);
      // The tel field measured 20px wider than the rest on a page whose scrollbar had
      // gone; a couple of pixels of slack keeps this about the odd one out.
      if (control.width < 300 || control.width > 330)
        outliers.push(`${label} width ${control.width}`);
    }

    await fillStep(form);
    const action = form
      .locator('button:has-text("Send quote request"), button:has-text("Next")')
      .first();
    await action.click();
    await page.waitForTimeout(450);
    if ((await form.locator('button:has-text("Send quote request")').count()) > 0) {
      const heading = await page.evaluate(() => document.body.innerText.slice(0, 120));
      sent = /review|send|confirm/i.test(heading);
      console.log("  (reached the last step)");
      break;
    }
  }
  check("every control in the quote form is one size", outliers.length === 0, outliers.join("; "));
  check(
    "the form was walked to its last step",
    seen.size >= 9,
    `${seen.size} questions seen: ${[...seen].join(" / ")}`,
  );
  void sent;

  /* --- category headings, and the card's own button -------------------- */
  // The slug is the URL; the heading and the title are the label. "superheroes" as an
  // H1 was the slug leaking into the page.
  for (const [slug, expected] of [
    ["superheroes", "Superheroes"],
    ["star-wars", "Star Wars"],
    ["non-mascots", "Non Mascots"],
  ]) {
    await page.goto(`${BASE}/category/${slug}`, { waitUntil: "domcontentloaded" });
    await ready(page);
    await page.waitForTimeout(700);
    const heading = (
      await page
        .locator("h1")
        .first()
        .textContent()
        .catch(() => "")
    )?.trim();
    const title = await page.title();
    check(
      `/category/${slug} is headed "${expected}"`,
      heading === expected,
      JSON.stringify(heading),
    );
    check(`/category/${slug} is titled in the same case`, title.startsWith(expected), title);
  }

  // Measure the card on a category that certainly has results, rather than on whichever
  // page the loop happened to finish on.
  await page.goto(`${BASE}/category/superheroes`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.waitForTimeout(700);
  // The listings arrive from the API after the page hydrates, so wait for a card rather
  // than for a fixed number of milliseconds — on the live site that fetch is a round trip.
  await page
    .locator('button:has-text("Request quote")')
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => {});

  const cardAsk = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((node) =>
      /request quote/i.test(node.textContent || ""),
    );
    if (!button) return null;
    const box = button.getBoundingClientRect();
    return {
      width: Math.round(box.width),
      height: Math.round(box.height),
      font: getComputedStyle(button).fontSize,
    };
  });
  console.log(`  card Request quote button: ${JSON.stringify(cardAsk)}`);
  check(
    "the card's Request quote button is a comfortable tap target (>=40px)",
    (cardAsk?.height ?? 0) >= 40,
    JSON.stringify(cardAsk),
  );

  /* --- a listing's own buttons, and the city it opens with -------------- */
  await page.goto(`${BASE}/search?location=${SEARCH_CITY}`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.waitForTimeout(700);
  await page.goto(`${BASE}${VENDOR}`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.waitForTimeout(800);

  const ask = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button, a")].find((node) =>
      /request quote/i.test(node.textContent || ""),
    );
    if (!button) return null;
    const box = button.getBoundingClientRect();
    return { height: Math.round(box.height), width: Math.round(box.width) };
  });
  // The listing's own city, as printed in its hero. The quote banner used to repeat this
  // even after the visitor had said where the party was.
  const listingCity = await page.evaluate(() => {
    const spans = [...document.querySelectorAll("main section span")];
    return (
      spans
        .map((node) => node.textContent.trim())
        .find((text) => /^[A-Za-z .'-]+, [A-Z]{2}$/.test(text)) ?? null
    );
  });
  console.log(`  listing city: ${JSON.stringify(listingCity)}`);
  console.log(`  listing Request quote button: ${JSON.stringify(ask)}`);
  check(
    "the listing's Request quote button is a comfortable tap target (>=44px)",
    (ask?.height ?? 0) >= 44,
    JSON.stringify(ask),
  );

  await page.click('button:has-text("Request quote")');
  await page.waitForTimeout(900);
  const dialog = page.locator('[role="dialog"]');
  let city = null;
  for (let attempt = 0; attempt < 6 && city === null; attempt += 1) {
    const question = await questionOf(dialog);
    if (/where is the party/i.test(question)) {
      city = await dialog
        .locator("input:visible")
        .first()
        .inputValue()
        .catch(() => null);
      break;
    }
    await fillStep(dialog);
    await dialog.locator('button:has-text("Next")').first().click();
    await page.waitForTimeout(450);
  }
  check(
    "the listing's quote form opens with the city the visitor searched",
    (city ?? "").toLowerCase().includes(SEARCH_CITY.toLowerCase()),
    JSON.stringify(city),
  );

  // The visitor answers "Where is the party?" in front of this box, so the box has to
  // follow that answer rather than repeating the listing's own city — a Houston party
  // announced as Los Angeles is the bug this checks for.
  const NOT_THE_PARTY_CITY = "Houston, TX";
  const cityInput = dialog.locator("input:visible").first();
  await cityInput.fill(NOT_THE_PARTY_CITY);
  await page.waitForTimeout(400);
  const banner = await dialog.evaluate((node) => node.innerText.replace(/\s+/g, " "));
  console.log(
    `  banner after typing ${NOT_THE_PARTY_CITY}: ${JSON.stringify(banner.slice(0, 160))}`,
  );
  check(
    "the quote banner shows the city the visitor filed",
    /requesting a quote from/i.test(banner) && banner.includes(NOT_THE_PARTY_CITY),
    banner.slice(0, 160),
  );
  if (listingCity && listingCity !== NOT_THE_PARTY_CITY) {
    check(
      `the banner no longer repeats the listing's city (${listingCity})`,
      !banner.includes(listingCity),
      banner.slice(0, 160),
    );
  }
  // The header used to say "This goes straight to X in <listing city>", which read as a
  // claim about where the party was.
  check(
    "the dialog header makes no claim about the party city",
    !listingCity || !banner.includes(`in ${listingCity}`),
    banner.slice(0, 160),
  );

  // The search page carried `pb-24` on its <main> as well as on the footer, so 96px of
  // page background sat below the dark panel at every width — a band of nothing under a
  // footer that already clears the mobile nav itself. Compare the page height with where
  // the footer ends: any daylight below it is that leftover padding.
  for (const path of ["/search?q=&location=", "/", "/category/superheroes"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await ready(page);
    // The results (and the footer under them) arrive with the search query, not with the
    // route, so wait for the footer itself rather than for a fixed delay.
    await page
      .waitForFunction(() => Boolean(document.querySelector("footer")), null, { timeout: 30000 })
      .catch(() => false);
    await page.waitForTimeout(400);
    const footer = await page.evaluate(() => {
      const element = document.querySelector("footer");
      if (!element) return null;
      const box = element.getBoundingClientRect();
      const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
      const lastLink = [...element.querySelectorAll("a")].pop()?.getBoundingClientRect() ?? null;
      return {
        belowFooter: Math.round(document.documentElement.scrollHeight - (box.bottom + scrollY)),
        lastLinkClearance: lastLink
          ? Math.round(box.bottom + scrollY - (lastLink.bottom + scrollY))
          : null,
        navHeight: nav ? Math.round(nav.getBoundingClientRect().height) : 0,
        navVisible: nav ? getComputedStyle(nav).display !== "none" : false,
      };
    });
    console.log(`  ${path}: ${JSON.stringify(footer)}`);
    check(
      `${path} has no band of page below its footer`,
      footer?.belowFooter === 0,
      String(footer?.belowFooter),
    );
    check(
      `${path} keeps its last footer link clear of the mobile nav`,
      !footer || footer.lastLinkClearance === null || footer.lastLinkClearance > footer.navHeight,
      `${footer?.lastLinkClearance}px vs ${footer?.navHeight}px nav`,
    );
  }

  await browser.close();
  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed  (${BASE})`);
  process.exit(failed.length === 0 ? 0 : 1);
})();
