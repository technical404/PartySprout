import path from "node:path";
import fs from "node:fs";

const { chromium } = await import("playwright");

const out = path.resolve("playwright-evidence");
fs.mkdirSync(out, { recursive: true });
const BASE = process.env.APP_URL || "http://localhost:8080";

async function launch() {
  for (const channel of ["msedge", "chrome", undefined]) {
    try {
      const browser = await chromium.launch(channel ? { headless: true, channel } : { headless: true });
      console.log("launched browser channel:", channel ?? "bundled chromium");
      return browser;
    } catch (e) {
      console.log("channel failed:", channel ?? "bundled", "-", e.message.split("\n")[0]);
    }
  }
  throw new Error("no browser available");
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];

/* 1. Homepage loads and data-driven sections appear ------------------------ */
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".flip-card", { timeout: 30000 });
await page.waitForSelector(".marquee-track", { timeout: 30000 });
console.log("home: flip cards + marquee track rendered");

const headingCounts = await page.evaluate(() => ({
  flipCards: document.querySelectorAll(".flip-card").length,
  marqueeItems: document.querySelectorAll(".marquee-item").length,
  journeyPanels: document.querySelectorAll(".journey-panel").length,
  cityLinks: [...document.querySelectorAll("a[href^='/search']")].length,
  testimonials: document.querySelectorAll("figure blockquote").length,
  bookWithConfidence: document.body.innerText.includes("Book with confidence"),
  browseByCategory: document.body.innerText.includes("Browse by category"),
  browseByCity: document.body.innerText.includes("Browse by city"),
}));
console.log("counts:", headingCounts);
if (headingCounts.flipCards === 0) problems.push("no flip cards");
if (headingCounts.journeyPanels !== 5) problems.push(`expected 5 journey panels, got ${headingCounts.journeyPanels}`);
if (headingCounts.testimonials === 0) problems.push("no testimonials");
if (headingCounts.bookWithConfidence) problems.push("Book with confidence still present");
if (headingCounts.browseByCategory) problems.push("Browse by category still present");
if (!headingCounts.browseByCity) problems.push("Browse by city missing");

/* 2. Flip card shows subcategories ---------------------------------------- */
const card = page.locator(".flip-card").first();
const frontName = await card.locator("h3").first().innerText();
await card.locator(".flip-front button").click();
await page.waitForTimeout(900);
const flipped = await card.getAttribute("data-flipped");
const backText = await card.locator(".flip-back").innerText();
console.log(`flip: "${frontName}" data-flipped=${flipped}`);
console.log("flip back content:", backText.replace(/\s+/g, " ").slice(0, 140));
if (flipped !== "true") problems.push("flip card did not flip");
const chipCount = await card.locator(".flip-back li").count();
if (chipCount === 0) problems.push("flip card back has no subcategories");
console.log("subcategory chips:", chipCount);

/* 3. Carousel actually animates ------------------------------------------- */
const anim = await page.evaluate(() => {
  const track = document.querySelector(".marquee-track");
  if (!track) return null;
  const style = getComputedStyle(track);
  return {
    name: style.animationName,
    duration: style.animationDuration,
    items: document.querySelectorAll(".marquee-item").length,
    width: track.getBoundingClientRect().width,
  };
});
console.log("carousel:", anim);
if (!anim || anim.name === "none") problems.push("carousel not animating");
if (anim && anim.items < 2) problems.push("carousel not duplicated for seamless loop");

await page.screenshot({ path: path.join(out, "home-top.png") });

/* 4. Sticky stack scales panels as you scroll ----------------------------- */
const sectionTop = await page.evaluate(() => {
  const panel = document.querySelector(".journey-panel");
  return panel ? window.scrollY + panel.getBoundingClientRect().top - 200 : null;
});
if (sectionTop == null) problems.push("journey panel not found for scroll test");
else {
  await page.evaluate((y) => window.scrollTo(0, y), sectionTop);
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => document.querySelector(".journey-panel")?.style.transform ?? "");
  await page.evaluate((y) => window.scrollTo(0, y + 2200), sectionTop);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => document.querySelector(".journey-panel")?.style.transform ?? "");
  console.log(`sticky stack: before="${before}" after="${after}"`);
  if (before === after) problems.push("journey panel transform did not change on scroll");
  await page.screenshot({ path: path.join(out, "journey.png") });
}

/* 5. Quote form validation + submission ---------------------------------- */
await page.goto(`${BASE}/request-quote`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("form", { timeout: 30000 });

await page.getByRole("button", { name: /send quote request/i }).click();
await page.waitForTimeout(700);
const validationText = await page.locator("form").innerText();
const showedErrors = /Please enter your name|Please enter your email|Which city|budget|at least 10/i.test(validationText);
console.log("empty-submit validation shown:", showedErrors);
if (!showedErrors) problems.push("form did not show validation errors on empty submit");

// Radix Select renders its listbox in a portal; click the trigger then prefer a
// real option click, falling back to keyboard selection.
async function pickSelect(index) {
  await page.locator('button[role="combobox"]').nth(index).click();
  await page.waitForTimeout(600);
  const options = page.locator('[role="option"]');
  const count = await options.count();
  if (count > 0) {
    const label = await options.first().innerText();
    await options.first().click();
    await page.waitForTimeout(400);
    return `click:${label.trim()}`;
  }
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  return "keyboard";
}

await page.locator('input[autocomplete="name"]').fill("Browser Check");
await page.locator('input[autocomplete="email"]').fill("browser@example.com");
await page.locator('input[placeholder="Dallas, TX"]').fill("Chicago, IL");
await page.locator('input[placeholder="15"]').fill("12");
await page.locator("textarea").fill("End-to-end browser verification of the quote request form.");
console.log("picked category via:", await pickSelect(0));
console.log("picked budget via:", await pickSelect(1));
await page.waitForTimeout(400);

await page.getByRole("button", { name: /send quote request/i }).click();
await page.waitForTimeout(2500);
const afterSubmit = await page.locator("main").innerText();
const succeeded = /Your request is in/i.test(afterSubmit);
console.log("quote form submitted successfully:", succeeded);
if (!succeeded) {
  problems.push("quote form did not reach success state");
  console.log("  page text:", afterSubmit.replace(/\s+/g, " ").slice(0, 300));
}
await page.screenshot({ path: path.join(out, "quote-success.png") });

/* 6. Vendor-prefilled quote page ----------------------------------------- */
await page.goto(`${BASE}/request-quote?vendor=a-dash-of-magic-events`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const prefilled = await page.locator("main").innerText();
const hasVendor = /A Dash of Magic Events/i.test(prefilled);
console.log("vendor prefill shown:", hasVendor);
if (!hasVendor) problems.push("vendor prefill not shown");

/* 7. Footer pages navigate ------------------------------------------------ */
for (const route of ["/about", "/contact", "/how-it-works", "/terms", "/privacy"]) {
  await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
  const bad = await page.evaluate(() =>
    /This page didn't load|Page not found/i.test(document.body.innerText)
  );
  const h1 = await page.locator("h1").first().innerText().catch(() => "(none)");
  console.log(`  ${route} -> ${bad ? "ERROR" : "ok"} | h1: ${h1}`);
  if (bad) problems.push(`${route} rendered an error state`);
}

/* 8. Footer link navigation from home ------------------------------------- */
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector("footer", { timeout: 20000 });
await page.locator('footer a[href="/about"]').first().click();
await page.waitForTimeout(1200);
console.log("footer -> about URL:", new URL(page.url()).pathname);
if (!page.url().endsWith("/about")) problems.push("footer About link did not navigate");

await browser.close();

console.log("\n================ RESULT ================");
if (problems.length === 0) console.log("ALL CHECKS PASSED");
else problems.forEach((p) => console.log("PROBLEM: " + p));
console.log(`screenshots in ${out}`);
process.exit(problems.length === 0 ? 0 : 1);
