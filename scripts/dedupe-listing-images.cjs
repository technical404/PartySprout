"use strict";

/**
 * Stops businesses from sharing a card picture.
 *
 * Three listings can end up looking identical on a results page:
 *
 *   1. Database/fetch-images.cjs caches one picture per *website*, so several
 *      listings that point at the same site (a chain's city pages, a franchise's
 *      two names) all get whatever image that site's homepage offers. The
 *      16 "Party Characters For Kids" city pages are the clearest case: one
 *      superhero banner across sixteen cards.
 *   2. Two different sites publish the same stock photograph.
 *   3. The listing has no picture at all, so mapVendor() falls back to the
 *      category's stock art — the same illustration on every unphotographed
 *      business in that category. 135 active listings are in this state, 102 of
 *      them with a website to look at.
 *
 * This script re-reads each such listing's own page and gives it a picture the site
 * publishes that no other active listing is using yet. It never invents one and never
 * writes a URL the site does not serve: a listing whose page has nothing unique keeps
 * what it has, and the report says which ones had nowhere to look.
 *
 *   node scripts/dedupe-listing-images.cjs --dry-run   # report only (default)
 *   node scripts/dedupe-listing-images.cjs --apply     # write, plus SQL for MySQL
 *   node scripts/dedupe-listing-images.cjs --apply --sql-only
 *   node scripts/dedupe-listing-images.cjs --apply --sql-only --against prod.json
 *
 * Images already chosen are remembered in Database/image-dedupe.json, so a second
 * run is a no-op rather than a reshuffle, and the production MySQL statements can
 * be generated later from the same record.
 *
 * `--against <file>` reads a JSON array of `{slug, image_url}` for the live site, written
 * by `deploy/tools/dump-live-images.php`. It matters because production is imported
 * wholesale and can lag this copy: the guard for each statement is then the picture
 * production really shows, and a picture that production already uses elsewhere is
 * rejected, so the import cannot create a new duplicate. Without it the guards come from
 * this database and the statements are only as accurate as the last export.
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
/**
 * The smallest a picture may be when the site refused to declare any size at all. This
 * is much lower than SIZE_FLOOR because publishers size with CSS, and a real photograph
 * serves several times this. It only has to separate a photograph from a spacer, and
 * isImage() confirms the served file afterwards.
 */
const UNKNOWN_SIZE_MIN_BYTES = 15000;

/**
 * Hosts whose pictures are never a business's own photograph, or will not survive:
 *
 *   - tracking pixels and analytics counters
 *   - YouTube thumbnails (a video still, not the business's own gallery)
 *   - Facebook / Instagram / CDN assets: their URLs carry an expiry (oe=, oh=) and the
 *     Instagram `/rsrc.php` files are the site's own chrome, not the customer's photos
 *
 * A franchise chain's own CDN is deliberately NOT rejected: several listings sharing one
 * parent site have no other source of pictures, and taking a *different* picture from it
 * for each is exactly the improvement wanted. Uniqueness is enforced by the in-use set.
 */
const REJECT_HOST =
  /(^|\.)(statcounter|google-analytics|doubleclick|googletagmanager|ytimg|youtube|fbcdn|cdninstagram|instagram|facebook|tiktok|pinterest|twitter)\./i;
/** A URL that must be fetched before it can be shown will expire. Never write one. */
const SIGNED_URL = /[?&](oe|oh|_nc_ohc|x-expires|expires|signature|token|policy|key-pair-id)=/i;
const REJECT_NAME =
  /(logo|icon|sprite|favicon|avatar|placeholder|badge|spinner|loader|pixel|blank|transparent|1x1|spacer)/i;
/**
 * Where to look when a business's homepage has nothing we can use. These are pages on
 * the business's *own* site, so a picture from one is still its own photograph rather
 * than borrowed art — which is the whole point.
 */
const SECONDARY_PATHS = ["gallery", "photos", "characters", "about", "services", "packages"];

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const SQL_ONLY = argv.includes("--sql-only");
const AGAINST = (() => {
  const at = argv.indexOf("--against");
  return at === -1 ? null : argv[at + 1];
})();

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
 * The width a CDN URL asks for, when it says so: Wix `w_49`, `?width=1200`, and the
 * pagecloud `=/1600x0/` spelling. Used to reject the blurred stand-ins Wix and WordPress
 * leave in `src` while the real file sits in `srcset`, and — just as importantly — to see
 * that `w_27` is a 27-pixel icon and not a photograph.
 */
function sizeFromUrl(url) {
  const patterns = [
    /[?&/,]w_(\d+)/i,
    /[?&]width=(\d+)/i,
    /[?&]w=(\d+)/i,
    /=\/?(\d{2,4})x\d{0,4}\//i,
    /-(\d{2,4})x\d{2,4}\.\w+/i,
  ];
  let largest = 0;
  for (const pattern of patterns) {
    const found = pattern.exec(url);
    if (found) largest = Math.max(largest, parseInt(found[1], 10));
  }
  return largest;
}

/**
 * Two or three `<img>` candidates for the same shot are still one picture.
 *
 * The WordPress and Instagram spellings put the size in a filename suffix (`-1024x683`)
 * or a query string, so those are stripped. Wix is different: one asset is served as
 * `/media/<asset>/v1/fill/w_245,h_410/…` and `/media/<asset>/v1/crop/x_0,y_166/…`, which
 * are the same photograph at other sizes and crops, so the asset is taken as the identity.
 *
 * Only Wix is treated this way. Cutting at `/v1/` for every URL looked equivalent and was
 * not: Squarespace writes `/content/v1/<site>/<image>/<name>`, where `/v1/` is part of the
 * path rather than a transform, and the whole catalogue's Squarespace pictures collapsed
 * onto one key — 28 different photographs read as a single repeated one.
 */
function pictureKey(url) {
  const clean = url.replace(/^https?:\/\//, "").replace(/[?#].*$/, "");
  const wix = /^(static\.wixstatic\.com\/media\/[^/]+)/.exec(clean);
  if (wix) return wix[1];
  return clean.replace(/-\d{2,4}x\d{2,4}(?=\.)/, "");
}

/**
 * The size a builder wrote into its own attribute instead of onto the element.
 * Squarespace puts `data-image-dimensions="1500x1000"` on the block, and reads it in
 * preference to anything else because a builder page has no width/height at all.
 */
function declaredDimensionWidth(tag, wantHeight = false) {
  const declared = attr(tag, "data-image-dimensions");
  const found = /^(\d+)\s*x\s*(\d+)$/.exec(declared);
  if (!found) return 0;
  return parseInt(wantHeight ? found[2] : found[1], 10) || 0;
}

/**
 * Every <img> on the page that the site bothered to size, biggest first. The
 * og:image is deliberately not consulted: on these chain sites it is the one
 * shared banner we are trying to get away from.
 */
function photosFrom(html, base) {
  const found = [];
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const src =
      attr(tag, "data-src") ||
      attr(tag, "data-lazy-src") ||
      attr(tag, "data-srclazy") ||
      attr(tag, "data-original") ||
      attr(tag, "data-lazy") ||
      attr(tag, "src");
    if (!src) continue;

    // The widest srcset entry is the file the site actually means to show; the plain
    // src is often its blurry stand-in. A descriptor can be missing (Wix writes a list
    // of URLs with none), in which case the URL's own `w_1600` still says how wide it is.
    //
    // The list is split on the comma that separates entries — one followed by whitespace
    // and a URL — rather than on every comma, because a Wix path is itself full of them
    // (`w_245,h_410,al_c,q_80`). Splitting naively cut those URLs into fragments that were
    // then stored as pictures.
    const srcset = attr(tag, "srcset") || attr(tag, "data-srcset");
    let best = null;
    for (const part of srcset.split(/,\s+(?=https?:\/\/|\/\/|\/)/)) {
      const [rawUrl, descriptor] = part.trim().split(/\s+/);
      if (!rawUrl) continue;
      const declared =
        /(\d+)\s*w\s*$/.exec(descriptor || "") || /(\d+)x\s*$/.exec(descriptor || "");
      const width = declared ? parseInt(declared[1], 10) : sizeFromUrl(rawUrl);
      if (!width) continue;
      if (!best || width > best.width) best = { url: rawUrl, width };
    }

    const url = best?.url ?? src;
    if (REJECT_NAME.test(url) || /blur_/i.test(url)) continue;
    // A data: URI is a placeholder — the lazy-loaders here put a 1x1 gif in `src` and the
    // real file in an attribute we may not know. Never a candidate.
    if (/^data:/i.test(url)) continue;
    if (SIGNED_URL.test(url)) continue;
    let host = "";
    try {
      host = new URL(url, base).hostname;
    } catch {
      continue;
    }
    if (REJECT_HOST.test(host)) continue;
    // Most sites end the file with an extension, but modern CDNs do not: Squarespace
    // serves `/…/magician+in+Austin` and BigCommerce `/images/stencil/…`. Those are
    // still photographs, so the extension is not required — isImage() confirms each
    // pick really answers with an image before it is written.

    const width = Math.max(
      parseInt(attr(tag, "width"), 10) || 0,
      best ? best.width : 0,
      sizeFromUrl(url),
      declaredDimensionWidth(tag),
    );
    const height = parseInt(attr(tag, "height"), 10) || declaredDimensionWidth(tag, true);
    // A site that declares a size must clear SIZE_FLOOR; one that leaves it to CSS is
    // ranked below those and proven by its bytes in isImage() instead.
    if (width > 0 && width < SIZE_FLOOR) continue;

    try {
      const resolved = new URL(url, base);
      if (resolved.protocol !== "https:") continue;
      // Undeclared sizes sort last, but they are kept: their bytes decide in isImage().
      found.push({
        url: resolved.toString(),
        area: width * (height || width),
        declared: width > 0,
      });
    } catch {
      /* a malformed src is not a candidate */
    }
  }
  found.sort((a, b) => Number(b.declared) - Number(a.declared) || b.area - a.area);
  // One entry per picture: the same shot at two sizes is not two choices.
  return [...new Map(found.map((entry) => [pictureKey(entry.url), entry])).values()];
}

/**
 * Takes the first candidate that is unused, confirms it really serves a picture, and
 * reserves it in `inUse` so no other listing can take it.
 *
 * The reservation is made *before* the await on purpose: several listings are examined at
 * once, and JavaScript only guarantees that the lines between two awaits run without
 * interference. Checking `inUse` and then awaiting `isImage()` would let two franchises on
 * one chain site both pass the check and both be handed the same photograph.
 */
async function claimCandidate(candidates, inUse, current) {
  const currentKey = current ? pictureKey(current) : null;
  for (const candidate of candidates) {
    const key = pictureKey(candidate.url);
    if (inUse.has(key) || key === currentKey) continue;
    inUse.add(key);
    if (await isImage(candidate.url)) return candidate;
    inUse.delete(key);
  }
  return null;
}

/** Confirms a URL really answers with an image, and is big enough to be a photograph. */
async function isImage(url) {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "user-agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const type = (res.headers.get("content-type") || "").toLowerCase();
    if (!type.startsWith("image/")) return false;
    if (/svg/i.test(type)) return false;
    const length = parseInt(res.headers.get("content-length") || "0", 10);
    // A 1-2 KB "image" is a spacer, an icon or a placeholder, not a photograph.
    return !length || length > UNKNOWN_SIZE_MIN_BYTES;
  } catch {
    return false;
  }
}

async function read(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      // A bare user-agent gets a 403 from the CDNs that guard small business sites. These
      // are the headers a browser sends for a top-level navigation; nothing is spoofed
      // beyond what any visitor's browser already says.
      "sec-ch-ua": '"Chromium";v="141", "Not?A_Brand";v="8"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
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

  // Keyed by picture rather than by URL, so the same asset at another size or crop still
  // counts as taken — that is what stops two cards being handed one Wix photograph.
  const inUse = new Set(
    db
      .prepare(
        "SELECT DISTINCT image_url FROM listings WHERE status = 'active' AND image_url IS NOT NULL AND image_url <> ''",
      )
      .all()
      .map((row) => pictureKey(row.image_url)),
  );

  const listings = [];
  for (const group of duplicateGroups) {
    for (const row of db
      .prepare("SELECT id, name, website, image_url FROM listings WHERE image_url = ? ORDER BY id")
      .all(group.image_url)) {
      listings.push({ ...row, sharedBy: group.c, kind: "shared" });
    }
  }

  // A listing with no picture shows the category illustration, so every unphotographed
  // business in a category looks the same. Those are the second half of the problem, and
  // most of them have a website that publishes photographs.
  const blankRows = db
    .prepare(
      `SELECT id, name, website, image_url
         FROM listings
        WHERE status = 'active' AND (image_url IS NULL OR image_url = '')
          AND website IS NOT NULL AND website <> ''
        ORDER BY id`,
    )
    .all();
  for (const row of blankRows) listings.push({ ...row, sharedBy: 0, kind: "blank" });

  const blankNoSite = db
    .prepare(
      `SELECT COUNT(*) AS c FROM listings
        WHERE status = 'active' AND (image_url IS NULL OR image_url = '')
          AND (website IS NULL OR website = '')`,
    )
    .get().c;

  console.log(
    `${duplicateGroups.length} pictures shared by ${listings.length - blankRows.length} active listings; ` +
      `${inUse.size} pictures already in use.`,
  );
  console.log(
    `${blankRows.length} listings have no picture but do have a website; ` +
      `${blankNoSite} more have neither and keep the category art.`,
  );

  const report = loadReport();
  const decisions = [];
  const stats = { reused: 0, none: 0, failed: 0, skipped: 0, blankFilled: 0, blankNoPhoto: 0 };

  await runPool(listings, CONCURRENCY, async (listing) => {
    const remembered = report.applied[listing.id];
    if (remembered?.image) {
      // Already applied and still in place: nothing to do, and nothing to re-decide.
      if (remembered.image === listing.image_url) {
        stats.skipped += 1;
        return;
      }
      // Remembered but the row no longer shows it (it was reverted): re-apply the known
      // choice rather than walking the site again and picking something different.
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
    // than handing two listings the same replacement. Each candidate is confirmed to
    // answer with an image, so a stale path or a hotlink-protected file cannot be
    // written into the database.
    let pick = await claimCandidate(candidates, inUse, listing.image_url);

    // Homepages often carry only a hero banner that another listing already uses. A
    // business's own gallery or characters page is part of its own site, so try a
    // second page before giving up.
    if (!pick) {
      for (const page of SECONDARY_PATHS) {
        try {
          const { html, base } = await read(new URL(page, listing.website).toString());
          pick = await claimCandidate(photosFrom(html, base), inUse, listing.image_url);
        } catch {
          /* a page that does not exist is not a failure of the listing */
        }
        if (pick) break;
      }
    }

    if (!pick) {
      if (listing.kind === "blank") {
        stats.blankNoPhoto += 1;
        console.log(
          `  #${listing.id} ${listing.name} — its site publishes nothing usable (${candidates.length} candidates)`,
        );
      } else {
        stats.none += 1;
        console.log(
          `  #${listing.id} ${listing.name} — no unused picture on its own page (${candidates.length} candidates, all already shown)`,
        );
      }
      return;
    }

    inUse.add(pictureKey(pick.url));
    if (listing.kind === "blank") stats.blankFilled += 1;
    else stats.reused += 1;
    decisions.push({
      id: listing.id,
      name: listing.name,
      from: listing.image_url,
      to: pick.url,
      why: listing.kind === "blank" ? "its own site (had none)" : "its own page",
    });
    console.log(`  #${listing.id} ${listing.name} — ${pick.url}`);
  });

  decisions.sort((a, b) => a.id - b.id);
  console.log("\nDecisions:", stats);

  if (!APPLY && !SQL_ONLY) {
    console.log("\nDry run — nothing written. Re-run with --apply to write the database.");
    console.log(
      `  ${decisions.filter((d) => d.why !== "kept from the last run").length} listing(s) can get a picture of their own.`,
    );
    close();
    return;
  }

  const update = db.prepare("UPDATE listings SET image_url = ? WHERE id = ?");
  for (const decision of decisions) {
    if (decision.why === "kept from the last run") {
      report.applied[decision.id] ??= { image: decision.to, at: new Date().toISOString() };
      continue;
    }
    report.applied[decision.id] = {
      image: decision.to,
      from: decision.from,
      at: new Date().toISOString(),
    };
    update.run(decision.to, decision.id);
  }
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  // The SQL is built from the whole record rather than this run's decisions, because
  // the choices accumulate: a listing fixed three runs ago is no longer "shared" and
  // would drop out of `decisions`, yet production still shows the old picture.
  let live = null;
  if (AGAINST) {
    live = new Map(
      JSON.parse(fs.readFileSync(AGAINST, "utf8")).map((row) => [row.slug, row.image_url || null]),
    );
    console.log(`\nChecking against ${live.size} live listings from ${AGAINST}.`);
  }

  const guardFor = (from) =>
    from === null || from === undefined || from === ""
      ? "(image_url IS NULL OR image_url = '')"
      : `image_url = '${String(from).replace(/'/g, "''")}'`;

  // Which pictures the live site shows, so a choice cannot collide with one already
  // there that this copy does not know about. Counted by picture, because a Wix asset
  // served at another crop is still the same photograph on screen.
  const liveUse = new Map();
  if (live) {
    for (const [, url] of live) {
      if (!url) continue;
      const key = pictureKey(url);
      liveUse.set(key, (liveUse.get(key) || 0) + 1);
    }
  }

  const sql = [];
  const emitted = new Set();
  let skippedAlready = 0;
  let skippedClash = 0;
  let droppedDead = 0;
  for (const [id, entry] of Object.entries(report.applied)) {
    if (!entry.image) continue;
    const slug = db.prepare("SELECT slug FROM listings WHERE id = ?").get(Number(id))?.slug;
    if (!slug) continue;

    // A picture that has since stopped loading must not be written: it would replace a
    // working card with a broken one, and the card would drop to the category art. The
    // choice is forgotten so a later run picks a fresh one from the business's site.
    if (live && !(await isImage(entry.image))) {
      delete report.applied[id];
      droppedDead += 1;
      console.log(`  dropped: ${slug} — the picture chosen earlier no longer loads`);
      continue;
    }

    // The guard is the picture the live site shows now, which is the only value the
    // UPDATE can rely on. If it already shows our choice there is nothing to do.
    const from = live ? live.get(slug) : entry.from;
    if (live) {
      if (live.get(slug) === entry.image) {
        skippedAlready += 1;
        continue;
      }
      // Another live listing already shows the picture we picked: taking it too would
      // create exactly the duplicate this script exists to remove. A picture already
      // given to an earlier statement counts the same way, because these statements land
      // together and two of them naming one photograph is the fault being fixed.
      const key = pictureKey(entry.image);
      const own = pictureKey(live.get(slug) || "") === key ? 1 : 0;
      if ((liveUse.get(key) || 0) > own || emitted.has(key)) {
        skippedClash += 1;
        console.log(`  clash: ${slug} would show a picture another card already has`);
        continue;
      }
      emitted.add(key);
    }

    sql.push(
      `UPDATE listings SET image_url = '${entry.image.replace(/'/g, "''")}' ` +
        `WHERE slug = '${slug.replace(/'/g, "''")}' AND status = 'active' AND ${guardFor(from)};`,
    );
  }
  if (live) {
    console.log(
      `  ${skippedAlready} already live, ${skippedClash} dropped as a clash, ` +
        `${droppedDead} dropped as no longer loading.`,
    );
    // The memory is rewritten because entries may have been dropped above, or the next
    // run would emit the same statements again.
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  }

  fs.writeFileSync(
    path.join(__dirname, "..", "Database", "image-dedupe.sql"),
    `-- Generated by scripts/dedupe-listing-images.cjs — one statement per listing whose card\n` +
      `-- picture this script chose. Each runs only while the row still shows the picture the\n` +
      `-- live site had when the file was generated, so importing the file twice changes\n` +
      `-- nothing${live ? ", and it was checked against the live site" : ""}.\n${sql.join("\n")}\n`,
  );

  const remaining = db
    .prepare(
      `SELECT COUNT(*) AS c FROM (
         SELECT image_url FROM listings
          WHERE status = 'active' AND image_url IS NOT NULL AND image_url <> ''
          GROUP BY image_url HAVING COUNT(*) > 1)`,
    )
    .get().c;
  const stillBlank = db
    .prepare(
      "SELECT COUNT(*) AS c FROM listings WHERE status = 'active' AND (image_url IS NULL OR image_url = '')",
    )
    .get().c;
  console.log(`\n${sql.length} SQL statement(s) written to Database/image-dedupe.sql`);
  console.log(
    `${remaining} picture(s) are still shared, ${stillBlank} listing(s) still have no picture of their own.`,
  );
  close();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { photosFrom, isImage, claimCandidate, pictureKey, sizeFromUrl, read };
