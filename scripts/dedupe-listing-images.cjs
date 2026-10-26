"use strict";

/**
 * Stops businesses from sharing a card picture.
 *
 * Two listings can end up with the same image_url for two different reasons:
 *
 *   1. Database/fetch-images.cjs caches one picture per *website*, so several
 *      listings that point at the same site (a chain's city pages, a franchise's
 *      two names) all get whatever image that site's homepage offers. The
 *      16 "Party Characters For Kids" city pages are the clearest case: one
 *      superhero banner across sixteen cards.
 *   2. Two different sites publish the same stock photograph.
 *
 * This script re-reads each colliding listing's own page and gives it a picture
 * the site publishes that no other active listing is using yet. It never invents
 * one and never writes a URL the site does not serve: a listing whose page has
 * nothing unique keeps the picture it has, and the report says so.
 *
 *   node scripts/dedupe-listing-images.cjs --dry-run   # report only (default)
 *   node scripts/dedupe-listing-images.cjs --apply     # write, plus SQL for MySQL
 *   node scripts/dedupe-listing-images.cjs --apply --sql-only
 *
 * Images already chosen are remembered in Database/image-dedupe.json, so a second
 * run is a no-op rather than a reshuffle, and the production MySQL statements can
 * be generated later from the same record.
 */

const fs = require("node:fs");
const path = require("node:path");
const { init, db, close } = require("../Database/index.js");

const REPORT_PATH = path.join(__dirname, "..", "Database", "image-dedupe.json");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const TIMEOUT_MS = 25000;
const CONCURRENCY = 6;
const MAX_BYTES = 2 * 1024 * 1024;
/** Same floor and reject list as Database/fetch-images.cjs: furniture is not a picture. */
const SIZE_FLOOR = 400;
const REJECT_NAME =
  /(logo|icon|sprite|favicon|avatar|placeholder|badge|spinner|loader|pixel|blank|transparent|1x1|spacer)/i;

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const SQL_ONLY = argv.includes("--sql-only");

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  // Entity-decoded, because a src written as `...?fit=1024&ssl=1` in the markup is
  // a different URL from the one the server actually serves when stored raw.
  return (match?.[2] ?? match?.[3] ?? match?.[4] ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&#0*38;/g, "&")
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * The width a CDN URL asks for, when it says so: Wix `w_49,h_34` and the many
 * `?width=1200` / `-1024x683` spellings. Used to reject the blurred placeholders
 * Wix and WordPress put in `src` while the real file sits in `srcset`.
 */
function sizeFromUrl(url) {
  const patterns = [/[?&]w_(\d+)/i, /[?&]width=(\d+)/i, /[?&]w=(\d+)/i, /-(\d{2,4})x\d{2,4}\.\w+/i];
  let largest = 0;
  for (const pattern of patterns) {
    const found = pattern.exec(url);
    if (found) largest = Math.max(largest, parseInt(found[1], 10));
  }
  return largest;
}

/** Two or three `<img>` candidates for the same shot are still one picture. */
function pictureKey(url) {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[?#].*$/, "")
    .replace(/\/v1\/fill\/.*$/, "")
    .replace(/-\d{2,4}x\d{2,4}(?=\.)/, "");
}

/**
 * Every <img> on the page that the site bothered to size, biggest first. The
 * og:image is deliberately not consulted: on these chain sites it is the one
 * shared banner we are trying to get away from.
 */
function photosFrom(html, base) {
  const found = [];
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const src = attr(tag, "data-src") || attr(tag, "data-lazy-src") || attr(tag, "src");
    if (!src) continue;

    // The widest srcset entry is the file the site actually means to show; the plain
    // src is often its blurry stand-in.
    const srcset = attr(tag, "srcset") || attr(tag, "data-srcset");
    let best = null;
    for (const part of srcset.split(",")) {
      const [rawUrl, descriptor] = part.trim().split(/\s+/);
      const declared =
        /(\d+)\s*w\s*$/.exec(descriptor || "") || /(\d+)x\s*$/.exec(descriptor || "");
      if (!rawUrl || !declared) continue;
      const width = parseInt(declared[1], 10);
      if (!best || width > best.width) best = { url: rawUrl, width };
    }

    const url = best?.url ?? src;
    if (REJECT_NAME.test(url) || /blur_/i.test(url)) continue;
    if (!/\.(jpe?g|png|webp|avif|jfif)(\?|#|$)/i.test(url)) continue;

    const width = Math.max(
      parseInt(attr(tag, "width"), 10) || 0,
      best ? best.width : 0,
      sizeFromUrl(url),
    );
    const height = parseInt(attr(tag, "height"), 10) || 0;
    if (width < SIZE_FLOOR) continue;

    try {
      const resolved = new URL(url, base);
      if (resolved.protocol !== "https:") continue;
      found.push({ url: resolved.toString(), area: width * (height || width) });
    } catch {
      /* a malformed src is not a candidate */
    }
  }
  found.sort((a, b) => b.area - a.area);
  // One entry per picture: the same shot at two sizes is not two choices.
  return [...new Map(found.map((entry) => [pictureKey(entry.url), entry])).values()];
}

async function read(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = (res.headers.get("content-type") || "").toLowerCase();
  if (type && !type.includes("html") && !type.includes("xml"))
    throw new Error(`not HTML (${type})`);
  const body = await res.text();
  return { html: body.slice(0, MAX_BYTES), base: res.url || url };
}

async function runPool(items, size, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    }),
  );
}

function loadReport() {
  try {
    return JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
  } catch {
    return { applied: {} };
  }
}

async function main() {
  init();

  const duplicateGroups = db
    .prepare(
      `SELECT image_url, COUNT(*) AS c
         FROM listings
        WHERE status = 'active' AND image_url IS NOT NULL AND image_url <> ''
        GROUP BY image_url HAVING COUNT(*) > 1
        ORDER BY c DESC, image_url`,
    )
    .all();

  const inUse = new Set(
    db
      .prepare(
        "SELECT DISTINCT image_url FROM listings WHERE status = 'active' AND image_url IS NOT NULL AND image_url <> ''",
      )
      .all()
      .map((row) => row.image_url),
  );

  const listings = [];
  for (const group of duplicateGroups) {
    for (const row of db
      .prepare("SELECT id, name, website, image_url FROM listings WHERE image_url = ? ORDER BY id")
      .all(group.image_url)) {
      listings.push({ ...row, sharedBy: group.c });
    }
  }

  console.log(
    `${duplicateGroups.length} pictures shared by ${listings.length} active listings; ` +
      `${inUse.size} pictures already in use across the directory.`,
  );

  const report = loadReport();
  const decisions = [];
  const stats = { reused: 0, none: 0, failed: 0, skipped: 0 };

  await runPool(listings, CONCURRENCY, async (listing) => {
    const remembered = report.applied[listing.id];
    // A remembered pick that still differs from the shared picture is kept, so the
    // second run does not walk the site again or reshuffle what the first run chose.
    if (remembered && remembered.image !== listing.image_url) {
      stats.skipped += 1;
      decisions.push({
        id: listing.id,
        name: listing.name,
        from: listing.image_url,
        to: remembered.image,
        why: "kept from the last run",
      });
      return;
    }

    let candidates;
    try {
      const { html, base } = await read(listing.website);
      candidates = photosFrom(html, base);
    } catch (error) {
      stats.failed += 1;
      console.log(`  #${listing.id} ${listing.name} — could not read site: ${error.message}`);
      return;
    }

    // Prefer a picture nobody shows yet; if the site has nothing new, say so rather
    // than handing two listings the same replacement.
    const pick = candidates.find(
      (candidate) => !inUse.has(candidate.url) && candidate.url !== listing.image_url,
    );
    if (!pick) {
      stats.none += 1;
      console.log(
        `  #${listing.id} ${listing.name} — no unused picture on its own page (${candidates.length} candidates, all already shown)`,
      );
      return;
    }

    inUse.add(pick.url);
    stats.reused += 1;
    decisions.push({
      id: listing.id,
      name: listing.name,
      from: listing.image_url,
      to: pick.url,
      why: "its own page",
    });
    console.log(`  #${listing.id} ${listing.name} — ${pick.url}`);
  });

  decisions.sort((a, b) => a.id - b.id);
  console.log("\nDecisions:", stats);

  if (!APPLY && !SQL_ONLY) {
    console.log("\nDry run — nothing written. Re-run with --apply to write the database.");
    console.log(
      `  ${decisions.filter((d) => d.why === "its own page").length} listing(s) can get a picture of their own.`,
    );
    close();
    return;
  }

  const update = db.prepare("UPDATE listings SET image_url = ? WHERE id = ?");
  for (const decision of decisions) {
    if (decision.why !== "its own page") continue;
    report.applied[decision.id] = { image: decision.to, at: new Date().toISOString() };
    update.run(decision.to, decision.id);
  }
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  // Production is MySQL and ids have drifted from this SQLite copy, so the SQL
  // finds each row by its slug (unique) and only runs when the row still shows the
  // shared picture — a second import of the file changes nothing.
  const sql = [];
  for (const decision of decisions) {
    const slug = db.prepare("SELECT slug FROM listings WHERE id = ?").get(decision.id)?.slug;
    if (!slug) continue;
    sql.push(
      `UPDATE listings SET image_url = '${decision.to.replace(/'/g, "''")}' ` +
        `WHERE slug = '${slug.replace(/'/g, "''")}' AND status = 'active' AND image_url = '${decision.from.replace(/'/g, "''")}';`,
    );
  }
  fs.writeFileSync(
    path.join(__dirname, "..", "Database", "image-dedupe.sql"),
    `-- Generated by scripts/dedupe-listing-images.cjs — one row per listing that shared a picture.\n${sql.join("\n")}\n`,
  );

  const remaining = db
    .prepare(
      `SELECT COUNT(*) AS c FROM (
         SELECT image_url FROM listings
          WHERE status = 'active' AND image_url IS NOT NULL AND image_url <> ''
          GROUP BY image_url HAVING COUNT(*) > 1)`,
    )
    .get().c;
  console.log(`\n${sql.length} SQL statement(s) written to Database/image-dedupe.sql`);
  console.log(`${remaining} picture(s) are still shared (their owners publish nothing else).`);
  close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
