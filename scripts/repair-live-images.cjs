"use strict";

/**
 * Fixes card pictures that are broken or that two listings share.
 *
 * A stored `image_url` can stop working without anyone touching the database: the
 * business redesigns its site and the file moves, hotlink protection starts answering
 * 403 to requests from another domain, or the domain lapses. The card then falls back
 * to the category illustration, which is the same picture every other unphotographed
 * business in that category shows — the duplication this directory exists to avoid.
 *
 * Two listings can also end up with one picture after the fact, when a picture chosen
 * for one of them was already in use live and the choice was made from a stale copy of
 * the data.
 *
 * Both are the same repair, so this script checks the live site and, for every listing
 * whose picture is broken or shared, picks a different picture from that business's own
 * website: a file that answers with an image, and that no other live listing shows.
 *
 *   node scripts/repair-live-images.cjs                     # report only
 *   node scripts/repair-live-images.cjs --apply             # write SQL
 *   node scripts/repair-live-images.cjs --apply --against Database/live-images.json
 *
 * The live snapshot is what is checked, because this copy of the database can lag:
 *
 *   ssh <host> 'php tools/dump-live-images.php' > Database/live-images.json
 *
 * Nothing is invented: a business whose site publishes nothing usable keeps its current
 * picture and is listed in the report as unrepaired.
 */

const fs = require("node:fs");
const path = require("node:path");
const { init, db, close } = require("../Database/index.js");
const {
  photosFrom,
  isImage,
  claimCandidate,
  pictureKey,
  read,
} = require("./dedupe-listing-images.cjs");

const SNAPSHOT = path.join(__dirname, "..", "Database", "live-images.json");
const REPORT = path.join(__dirname, "..", "Database", "image-repair.json");
const SQL_OUT = path.join(__dirname, "..", "Database", "image-repair.sql");

const CONCURRENCY = 8;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
/** Second page to try when a homepage has nothing usable, all on the business's own site. */
const SECONDARY_PATHS = ["gallery", "photos", "characters", "about", "services"];

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const at = argv.indexOf("--against");
const AGAINST = at === -1 ? SNAPSHOT : argv[at + 1];

/** True when the URL answers with an image — the same bar a visitor's browser applies. */
async function loads(url) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    const type = (res.headers.get("content-type") || "").toLowerCase();
    // The body is drained so the connection is released whether or not it is an image.
    await res.arrayBuffer().catch(() => {});
    return res.ok && type.startsWith("image/");
  } catch {
    return false;
  }
}

async function runPool(items, size, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    }),
  );
}

async function main() {
  init();

  const live = JSON.parse(fs.readFileSync(AGAINST, "utf8"));
  const listings = db
    .prepare("SELECT id, slug, name, website FROM listings WHERE status = 'active'")
    .all();
  const bySlug = new Map(listings.map((row) => [row.slug, row]));

  // The live picture is the one a visitor's browser asks for, so that is what is probed —
  // this copy may still hold a picture production replaced long ago.
  const toCheck = live
    .filter((row) => row.image_url)
    .map((row) => {
      const local = bySlug.get(row.slug);
      return local ? { ...local, image_url: row.image_url } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);

  console.log(`Checking ${toCheck.length} live pictures against ${AGAINST}.`);

  // A picture is a problem whether the browser cannot load it or two cards show it.
  const counts = new Map();
  for (const row of toCheck) {
    const key = pictureKey(row.image_url);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const broken = [];
  await runPool(toCheck, CONCURRENCY, async (row) => {
    const shared = (counts.get(pictureKey(row.image_url)) || 0) > 1;
    if (!shared && (await loads(row.image_url))) return;
    broken.push({ ...row, why: shared ? "shared with another listing" : "does not load" });
  });
  broken.sort((a, b) => a.id - b.id);
  console.log(`\n${broken.length} picture(s) need replacing:`);
  for (const row of broken) {
    console.log(`  #${row.id} ${row.name.slice(0, 40)} — ${row.why}`);
  }

  // Everything the live site already shows, so a replacement is never a picture another
  // card is using. The listing's own current picture is released, since it is being
  // replaced (and does not load anyway).
  // Keyed by picture, not URL: a Wix asset at another crop is the same photograph on
  // screen, and handing it out again would recreate the duplicate being repaired.
  const inUse = new Set(
    live
      .map((row) => row.image_url)
      .filter(Boolean)
      .map(pictureKey),
  );

  const repairs = [];
  const unrepaired = [];
  await runPool(broken, CONCURRENCY, async (row) => {
    // The current picture stays reserved: a listing must not be handed the very picture
    // it is being moved off, and for a shared picture that would undo the repair.
    if (!row.website) {
      unrepaired.push({ ...row, why: "no website to look at" });
      return;
    }

    let candidates = [];
    try {
      const page = await read(row.website);
      candidates = photosFrom(page.html, page.base);
    } catch (error) {
      unrepaired.push({ ...row, why: `could not read its site: ${error.message}` });
      return;
    }

    let pick = await claimCandidate(candidates, inUse, row.image_url);
    if (!pick) {
      for (const extra of SECONDARY_PATHS) {
        try {
          const page = await read(new URL(extra, row.website).toString());
          pick = await claimCandidate(photosFrom(page.html, page.base), inUse, row.image_url);
        } catch {
          /* a page that does not exist is not a failure of the listing */
        }
        if (pick) break;
      }
    }

    if (!pick) {
      unrepaired.push({
        ...row,
        why: `its site publishes nothing usable (${candidates.length} candidates)`,
      });
      return;
    }
    repairs.push({ id: row.id, slug: row.slug, name: row.name, from: row.image_url, to: pick.url });
  });

  repairs.sort((a, b) => a.id - b.id);
  console.log(`\n${repairs.length} can be repaired, ${unrepaired.length} cannot:`);
  for (const row of unrepaired) console.log(`  ${row.name.slice(0, 44)} — ${row.why}`);

  if (!APPLY) {
    for (const r of repairs) console.log(`  ${r.slug.slice(0, 40)} -> ${r.to.slice(0, 80)}`);
    console.log("\nDry run — nothing written. Re-run with --apply to write the SQL.");
    close();
    return;
  }

  // Guard each statement with the picture the live site shows now, so importing the file
  // can only replace the broken picture and never a choice made after this run.
  const guardFor = (from) =>
    from === null || from === undefined || from === ""
      ? "(image_url IS NULL OR image_url = '')"
      : `image_url = '${String(from).replace(/'/g, "''")}'`;

  const sql = repairs.map(
    (r) =>
      `UPDATE listings SET image_url = '${r.to.replace(/'/g, "''")}' ` +
      `WHERE slug = '${r.slug.replace(/'/g, "''")}' AND status = 'active' AND ${guardFor(r.from)};`,
  );
  fs.writeFileSync(
    SQL_OUT,
    "-- Generated by scripts/repair-broken-images.cjs — replaces pictures that no longer load.\n" +
      "-- Each statement runs only while the row still shows the broken picture.\n" +
      `${sql.join("\n")}\n`,
  );
  fs.writeFileSync(
    REPORT,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), against: AGAINST, repairs, unrepaired }, null, 2)}\n`,
  );
  console.log(`\n${sql.length} statement(s) written to Database/image-repair.sql`);
  close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
