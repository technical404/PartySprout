import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

/**
 * Checks that no two cards on a results page are showing the same picture.
 *
 *   node scripts/verify-distinct-images.mjs
 *   PS_BASE=https://hirepartycharacters.com node scripts/verify-distinct-images.mjs
 *
 * Two listings used to be able to share one picture in two ways, and both showed up
 * as a page of near-identical cards: a business with no picture of its own borrowed
 * the category's stock art (132 of them), and several listings pointed at the same
 * photo because their site publishes only that one (a chain's city pages, a franchise
 * under two names). A card is "the same picture" when it shows the same file framed
 * the same way, so the check compares both: the rendered image source and the crop
 * the card applies to it.
 *
 * The framing is derived from the listing id, so a reload must produce the identical
 * crop. A card whose crop changed between visits would read as a glitch, which is why
 * that is asserted too rather than assumed.
 */

const BASE = process.env.PS_BASE || "http://127.0.0.1:8080";

const results = [];
function check(label, ok, detail = "") {
  results.push({ label, ok });
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
}

/**
 * One entry per visible card: the picture file and the crop, which together decide
 * what the visitor actually sees. `variant` is the per-listing framing the card
 * applies when its picture is shared.
 */
const cardPictures = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("article.vendor-card")].map((card) => {
      const image = card.querySelector("img.vendor-image");
      return {
        name: (
          card.querySelector('a[href^="/vendors/"]')?.textContent ||
          card.querySelector("h3, h2")?.textContent ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 40),
        src: image?.getAttribute("src") || "",
        position: image?.style.objectPosition || "",
        zoom: image?.style.getPropertyValue("--variant-zoom") || "",
      };
    }),
  );

const signature = (card) => `${card.src}|${card.position}|${card.zoom}`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  // The default results page mixes listings that have their own photo with ones that
  // do not, which is where both kinds of repetition surfaced.
  const paths = [
    "/search?q=&location=",
    "/category/princesses",
    "/search?q=princess+party+co&location=",
  ];

  for (const path of paths) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("article.vendor-card", { timeout: 30000 }).catch(() => false);
    await page.waitForTimeout(1500);

    const cards = await cardPictures(page);
    if (!cards.length) {
      check(`${path} renders cards to compare`, false, "none found");
      continue;
    }

    // Duplicates are reported as the pair that collides, so a failure names the cards
    // rather than only the count.
    const seen = new Map();
    const collisions = [];
    for (const card of cards) {
      const key = signature(card);
      if (seen.has(key)) collisions.push(`${seen.get(key)} / ${card.name}`);
      else seen.set(key, card.name);
    }
    check(
      `${path} shows ${cards.length} cards with no repeated picture`,
      collisions.length === 0,
      collisions.slice(0, 3).join("; "),
    );

    // Every card should be showing something: a card whose picture failed to load
    // falls back to the category art, which is exactly the repetition being fixed.
    const broken = await page.evaluate(() =>
      [...document.querySelectorAll("article.vendor-card img.vendor-image")]
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => (image.getAttribute("src") || "").split("/").pop().slice(0, 40)),
    );
    check(
      `${path} has no card left without a picture`,
      broken.length === 0,
      broken.slice(0, 3).join(", "),
    );
  }

  // The crop has to be a property of the listing, not of the moment: same cards, same
  // framing, after a reload.
  const sample = "/search?q=&location=";
  await page.goto(`${BASE}${sample}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("article.vendor-card", { timeout: 30000 }).catch(() => false);
  await page.waitForTimeout(1500);
  const first = await cardPictures(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("article.vendor-card", { timeout: 30000 }).catch(() => false);
  await page.waitForTimeout(1500);
  const second = await cardPictures(page);
  const stable =
    first.length === second.length &&
    first.every((card, index) => signature(card) === signature(second[index]));
  check(
    "each card's framing is the same after a reload",
    stable,
    `${first.length} vs ${second.length} cards`,
  );

  // A phone card is short and wide too; the framing must not push the picture out of
  // the frame and leave a blank strip.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${BASE}${sample}`, { waitUntil: "domcontentloaded" });
  await phone.waitForSelector("article.vendor-card", { timeout: 30000 }).catch(() => false);
  await phone.waitForTimeout(1500);
  const blank = await phone.evaluate(
    () =>
      [...document.querySelectorAll("article.vendor-card img.vendor-image")].filter((image) => {
        const box = image.getBoundingClientRect();
        return box.height < 80 || box.width < 80;
      }).length,
  );
  check("@390px every card picture still fills its slot", blank === 0, `${blank} too small`);

  // And at width there must be no sideways scroll, which an oversized crop could cause.
  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check("@390px the page does not scroll sideways", overflow <= 0, `${overflow}px`);

  await browser.close();
  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed  (${BASE})`);
  process.exit(failed.length === 0 ? 0 : 1);
})();
