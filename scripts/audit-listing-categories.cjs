"use strict";

/**
 * Reads each business's own website and writes down which of the ten categories
 * that site actually offers, into Database/category-audit.json.
 *
 * The category on a listing came from the Google search that found the business,
 * so a company that does princesses, clowns and face painting can be filed under
 * "Superheroes" simply because that search ran first. This crawls the homepage
 * plus up to two in-site pages that look like they list the services, and scores
 * every category from the words on those pages.
 * scripts/apply-category-audit.cjs turns the result into database changes.
 *
 *   node scripts/audit-listing-categories.cjs            # site not audited yet
 *   node scripts/audit-listing-categories.cjs --force    # re-crawl everything
 *   node scripts/audit-listing-categories.cjs --limit 20 # small test batch
 *   node scripts/audit-listing-categories.cjs --only 12,34
 *
 * A site that could not be reached is recorded with its error and is left
 * untouched by the apply script: no evidence means no change.
 */

const fs = require("node:fs");
const path = require("node:path");
const { init, db, close } = require("../Database/index.js");

const REPORT = path.join(__dirname, "..", "Database", "category-audit.json");
const TIMEOUT_MS = 15000;
const MAX_BYTES = 1200 * 1024;
const SUBPAGE_BYTES = 600 * 1024;
const MAX_TEXT = 400000;
const CONCURRENCY = 8;
const SUBPAGE_LIMIT = 2;
const USER_AGENT = "PartySpark-category-audit/1.0";

const argv = process.argv.slice(2);
const FORCE = argv.includes("--force");
const limitArg = argv.indexOf("--limit");
const LIMIT = limitArg !== -1 ? Number(argv[limitArg + 1]) : 0;
const onlyArg = argv.indexOf("--only");
const ONLY =
  onlyArg === -1
    ? null
    : new Set(
        String(argv[onlyArg + 1] || "")
          .split(",")
          .map((value) => Number(value.trim()))
          .filter(Number.isFinite),
      );

/**
 * The words that give each category away. Weight 3 is a named character, 2 a
 * strong service word, 1 a word that is common enough to need company before it
 * counts. Additions are made from a score of 5, so a single weak word is never
 * enough on its own.
 */
const WEIGHTS = {
  superheroes: [
    ["spider-man", 3],
    ["spiderman", 3],
    ["spider man", 3],
    ["batman", 3],
    ["bat man", 3],
    ["superman", 3],
    ["super hero", 2],
    ["superhero", 3],
    ["iron man", 3],
    ["ironman", 3],
    ["captain america", 3],
    ["wonder woman", 3],
    ["avengers", 3],
    ["hulk", 3],
    ["thor", 3],
    ["black panther", 3],
    ["deadpool", 3],
    ["ant-man", 3],
    ["aquaman", 3],
    ["flash", 1],
  ],
  princesses: [
    ["cinderella", 3],
    ["rapunzel", 3],
    ["snow white", 3],
    ["moana", 3],
    ["ariel", 3],
    ["little mermaid", 3],
    ["mermaid", 2],
    ["jasmine", 3],
    ["aurora", 3],
    ["elsa", 3],
    ["sleeping beauty", 3],
    ["tiana", 3],
    ["pocahontas", 3],
    ["mulan", 3],
    ["belle", 2],
    ["princess", 2],
    ["princesses", 2],
    ["princess party", 2],
  ],
  "star-wars": [
    ["star wars", 3],
    ["jedi", 3],
    ["darth vader", 3],
    ["stormtrooper", 3],
    ["storm trooper", 3],
    ["chewbacca", 3],
    ["mandalorian", 3],
    ["grogu", 3],
    ["baby yoda", 3],
    ["lightsaber", 3],
    ["light saber", 3],
    ["skywalker", 3],
    ["clone trooper", 3],
  ],
  mascots: [
    ["mascot", 2],
    ["mascots", 2],
    ["costumed character", 2],
    ["costume character", 2],
    ["walk-around character", 2],
    ["character rental", 2],
    ["party character", 2],
    ["characters for hire", 2],
  ],
  "non-mascots": [
    ["face painting", 3],
    ["face paint", 3],
    ["balloon twisting", 3],
    ["balloon artist", 3],
    ["balloon animals", 3],
    ["balloon animal", 3],
    ["balloon sculpting", 3],
    ["glitter tattoo", 3],
    ["airbrush tattoo", 3],
    ["temporary tattoo", 2],
    ["bubble show", 3],
    ["puppet show", 3],
    ["reptile show", 3],
    ["animal show", 3],
    ["petting zoo", 3],
    ["pony ride", 3],
    ["pony rides", 3],
    ["craft station", 2],
    ["arts and crafts", 2],
    ["photo booth", 3],
    ["balloon twister", 3],
  ],
  clowns: [
    ["clown", 2],
    ["clowns", 2],
    ["clowning", 3],
    ["circus", 2],
    ["juggler", 3],
    ["juggling", 3],
    ["stilt walker", 3],
    ["clown show", 3],
    ["comedy show", 1],
  ],
  pirates: [
    ["pirate", 2],
    ["pirates", 2],
    ["jack sparrow", 3],
    ["captain hook", 3],
    ["swashbuckler", 3],
  ],
  holidays: [
    ["santa claus", 3],
    ["santa", 2],
    ["mrs. claus", 3],
    ["mrs claus", 3],
    ["christmas", 1],
    ["easter bunny", 3],
    ["easter", 1],
    ["elf", 2],
    ["elves", 2],
    ["halloween", 1],
    ["reindeer", 3],
    ["gingerbread", 2],
  ],
  fairy: [
    ["fairy", 2],
    ["fairies", 2],
    ["tinkerbell", 3],
    ["tinker bell", 3],
    ["tooth fairy", 3],
    ["fairy godmother", 3],
    ["fairy party", 2],
  ],
  magicians: [
    ["magician", 3],
    ["magicians", 3],
    ["magic show", 3],
    ["magic shows", 3],
    ["illusionist", 3],
    ["close-up magic", 3],
    ["sleight of hand", 3],
    ["mentalist", 3],
    ["magic", 1],
  ],
};

/** Word-boundary match, so "thor" never fires on "author" and "elf" never on "self". */
function mentions(text, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z])${escaped}(?![a-z])`).test(text);
}

function scoreText(text) {
  const scores = {};
  const evidence = {};
  for (const [slug, entries] of Object.entries(WEIGHTS)) {
    let total = 0;
    const hits = [];
    for (const [phrase, weight] of entries) {
      if (mentions(text, phrase)) {
        total += weight;
        hits.push(phrase);
      }
    }
    scores[slug] = total;
    if (hits.length) evidence[slug] = hits;
  }
  return { scores, evidence };
}

/** Visible words only: scripts and styles carry plenty of false positives. */
function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;?/gi, " ")
    .replace(/&amp;?/gi, "&")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function readCapped(res, limit) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      size += value.length;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* stream already finished */
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function get(url, bytes = MAX_BYTES) {
  const res = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = (res.headers.get("content-type") || "").toLowerCase();
  if (type && !type.includes("html") && !type.includes("text"))
    throw new Error(`not HTML (${type})`);
  return { html: await readCapped(res, bytes), finalUrl: res.url || url };
}

/** Links on the site itself that are most likely to list what it offers. */
const WANTED_LINK =
  /(character|entertain|service|package|theme|princess|superhero|super-hero|clown|magic|show|rental|costume|talent|birthday)/i;
const SKIP_LINK =
  /(cart|checkout|login|sign|account|privacy|terms|policy|contact|blog|faq|tel:|mailto:|javascript:)/i;

function subpageLinks(html, base) {
  const found = [];
  for (const match of html.matchAll(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,80}?)<\/a>/gi,
  )) {
    const href = match[1];
    const label = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!WANTED_LINK.test(href) && !WANTED_LINK.test(label)) continue;
    if (SKIP_LINK.test(href)) continue;
    let url;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    // Same site only: an "our friends" link is not this business's own offer.
    if (url.origin !== new URL(base).origin) continue;
    url.hash = "";
    if (url.href === base || found.includes(url.href)) continue;
    found.push(url.href);
  }
  return found.slice(0, SUBPAGE_LIMIT);
}

/** Homepage, then the two most promising service pages, as one lump of text. */
async function readSite(website) {
  const base = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const home = await get(base);
  let text = textOf(home.html);
  const pages = [home.finalUrl];
  for (const link of subpageLinks(home.html, home.finalUrl)) {
    try {
      const page = await get(link, SUBPAGE_BYTES);
      text += " " + textOf(page.html);
      pages.push(link);
    } catch {
      /* one missing subpage is not fatal */
    }
    if (text.length > MAX_TEXT) break;
  }
  return { text: text.slice(0, MAX_TEXT), pages };
}

function loadReport() {
  if (!fs.existsSync(REPORT)) return {};
  try {
    return JSON.parse(fs.readFileSync(REPORT, "utf8"));
  } catch {
    return {};
  }
}

(async () => {
  init();
  const report = loadReport();

  const rows = db
    .prepare(
      `SELECT l.id, l.name, l.website, c.slug AS primary_category,
              (SELECT GROUP_CONCAT(c2.slug) FROM listing_categories lc
                 JOIN categories c2 ON c2.id = lc.category_id
                WHERE lc.listing_id = l.id) AS linked
         FROM listings l
         JOIN categories c ON c.id = l.category_id
        WHERE l.status = 'active' AND l.website IS NOT NULL AND l.website <> ''
        ORDER BY l.id`,
    )
    .all();

  const todo = rows.filter((row) => {
    if (ONLY) return ONLY.has(row.id);
    return FORCE || !report[row.id];
  });
  console.log(`${rows.length} listings have a website, ${todo.length} to crawl`);
  if (LIMIT) todo.length = Math.min(todo.length, LIMIT);

  let done = 0;
  const queue = [...todo];
  async function worker() {
    while (queue.length) {
      const row = queue.shift();
      let text = "";
      let error = null;
      let pages = [];
      try {
        const result = await readSite(row.website);
        text = result.text;
        pages = result.pages;
      } catch (e) {
        error = e.message;
      }
      const scored = text ? scoreText(text) : { scores: {}, evidence: {} };
      report[row.id] = {
        id: row.id,
        name: row.name,
        website: row.website,
        primary: row.primary_category,
        linked: row.linked ? row.linked.split(",") : [],
        error,
        pages,
        chars: text.length,
        scores: scored.scores,
        evidence: scored.evidence,
      };
      done += 1;
      if (done % 20 === 0) {
        fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));
        console.log(`  ...${done}/${todo.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const ordered = {};
  for (const id of Object.keys(report)
    .map(Number)
    .sort((a, b) => a - b))
    ordered[id] = report[id];
  fs.writeFileSync(REPORT, JSON.stringify(ordered, null, 1));

  const entries = Object.values(ordered);
  const failed = entries.filter((entry) => entry.error);
  const reasons = new Map();
  for (const entry of failed) reasons.set(entry.error, (reasons.get(entry.error) || 0) + 1);
  console.log(`\naudited ${entries.length} listings, ${failed.length} unreachable`);
  console.log(
    "unreachable reasons:",
    JSON.stringify([...reasons.entries()].sort((a, b) => b[1] - a[1])),
  );
  console.log(`report: ${REPORT}`);
  close();
})();
