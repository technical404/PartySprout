"use strict";

/**
 * Applies Database/category-audit.json (see scripts/audit-listing-categories.cjs)
 * to the directory:
 *
 *   - a listing whose current category is not supported anywhere on its own
 *     website is relabelled with the category the site is mostly about;
 *   - every category the site clearly offers is added, so the business also
 *     shows up on that category page.
 *
 * Nothing is ever removed. "The site never prints the word" is weak evidence of
 * absence - a costume shop may sell superhero costumes without naming a hero -
 * so a category page can only gain businesses, never lose them.
 *
 *   node scripts/apply-category-audit.cjs            # write the local SQLite DB
 *   node scripts/apply-category-audit.cjs --dry-run  # report only
 *   node scripts/apply-category-audit.cjs --sql      # production MySQL statements
 *   node scripts/apply-category-audit.cjs --verbose  # every change by name
 *
 * Re-running is safe: the audit is the source of truth, so a second run finds
 * nothing left to change.
 */

const fs = require("node:fs");
const path = require("node:path");
const { init, db, close } = require("../Database/index.js");

const REPORT = path.join(__dirname, "..", "Database", "category-audit.json");

/** A category counts as offered from this score up: three named characters, or one service term plus context. */
const MIN_SCORE = 5;
/** Relabel only when the category in place has no real support (0-2) on the site. */
const PRIMARY_GUARD = 2;

const argv = process.argv.slice(2);
const SQL = argv.includes("--sql");
const DRY = argv.includes("--dry-run");
const VERBOSE = argv.includes("--verbose");

function loadReport() {
  if (!fs.existsSync(REPORT)) {
    console.error(`missing ${REPORT} - run scripts/audit-listing-categories.cjs first`);
    process.exit(1);
  }
  return Object.values(JSON.parse(fs.readFileSync(REPORT, "utf8"))).sort((a, b) => a.id - b.id);
}

/**
 * Works out the changes without touching anything, so --dry-run and --sql show
 * exactly what a real run would do. The current category of every listing is
 * read from the database, not from the report, which keeps a second run honest:
 * once applied, the same report proposes nothing further.
 */
function plan(entries, categoryId, current) {
  const relabels = [];
  const additions = [];
  let unreachable = 0;
  let noEvidence = 0;

  for (const entry of entries) {
    if (entry.error) {
      unreachable += 1;
      continue;
    }
    const listing = current.get(entry.id);
    if (!listing) continue;
    const scores = entry.scores || {};
    const linked = listing.linked;

    let best = null;
    for (const [slug, score] of Object.entries(scores)) {
      if (score > (best ? best.score : 0)) best = { slug, score };
    }
    if (!best || best.score < MIN_SCORE) {
      noEvidence += 1;
      continue;
    }

    const currentScore = scores[listing.primary] || 0;
    if (best.slug !== listing.primary && currentScore <= PRIMARY_GUARD) {
      relabels.push({
        id: entry.id,
        name: entry.name,
        website: entry.website,
        from: listing.primary,
        to: best.slug,
        score: best.score,
        previousScore: currentScore,
      });
    }

    for (const [slug, score] of Object.entries(scores)) {
      if (score < MIN_SCORE || linked.has(slug)) continue;
      if (!categoryId.has(slug)) continue;
      additions.push({
        id: entry.id,
        name: entry.name,
        slug,
        score,
        evidence: (entry.evidence || {})[slug] || [],
      });
    }
  }

  additions.sort((a, b) => a.id - b.id || b.score - a.score || a.slug.localeCompare(b.slug));
  return { relabels, additions, unreachable, noEvidence };
}

/** The category each listing carries right now, so the report stays evidence only. */
function currentState() {
  const rows = db
    .prepare(
      `SELECT l.id, c.slug AS primary_slug,
              (SELECT GROUP_CONCAT(c2.slug) FROM listing_categories lc
                 JOIN categories c2 ON c2.id = lc.category_id
                WHERE lc.listing_id = l.id) AS linked
         FROM listings l
         JOIN categories c ON c.id = l.category_id`,
    )
    .all();
  return new Map(
    rows.map((row) => [
      row.id,
      { primary: row.primary_slug, linked: new Set(row.linked ? row.linked.split(",") : []) },
    ]),
  );
}

(async () => {
  init();

  const categoryId = new Map(
    db
      .prepare("SELECT slug, id FROM categories")
      .all()
      .map((row) => [row.slug, row.id]),
  );
  const entries = loadReport();
  const { relabels, additions, unreachable, noEvidence } = plan(
    entries,
    categoryId,
    currentState(),
  );

  const touched = new Set([...relabels.map((r) => r.id), ...additions.map((a) => a.id)]);
  console.log(`audited listings in report : ${entries.length}`);
  console.log(`left alone (unreachable)   : ${unreachable}`);
  console.log(`left alone (no clear offer): ${noEvidence}`);
  console.log(`listings to relabel        : ${relabels.length}`);
  console.log(
    `categories to add          : ${additions.length} across ${new Set(additions.map((a) => a.id)).size} listings`,
  );
  console.log(`listings touched in total  : ${touched.size}`);

  const perCategory = new Map();
  for (const add of additions) perCategory.set(add.slug, (perCategory.get(add.slug) || 0) + 1);
  console.log("\nadded per category:");
  for (const [slug, n] of [...perCategory.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ${slug}: ${n}`);

  if (VERBOSE) {
    console.log("\nrelabels:");
    for (const r of relabels)
      console.log(`  #${r.id} ${r.name}: ${r.from}(${r.previousScore}) -> ${r.to}(${r.score})`);
    console.log("\nadditions:");
    for (const a of additions)
      console.log(`  #${a.id} ${a.name}: +${a.slug}(${a.score}) <- ${a.evidence.join(" ")}`);
  } else {
    console.log("\nfirst 10 relabels:");
    for (const r of relabels.slice(0, 10))
      console.log(`  #${r.id} ${r.name}: ${r.from} -> ${r.to} (${r.score})`);
  }

  if (SQL) {
    const lines = [];
    lines.push(
      "-- Category audit: relabel listings whose own site does not support their category,",
    );
    lines.push("-- and add the categories each site does show. Generated by");
    lines.push("-- scripts/apply-category-audit.cjs --sql. No category is ever removed.");
    lines.push("");
    lines.push("SET NAMES utf8mb4;");
    lines.push("");
    for (const r of relabels) {
      lines.push(`-- ${r.name}`);
      lines.push(`UPDATE listings SET category_id = ${categoryId.get(r.to)} WHERE id = ${r.id};`);
      lines.push(
        `INSERT IGNORE INTO listing_categories (listing_id, category_id) VALUES (${r.id}, ${categoryId.get(r.to)});`,
      );
    }
    lines.push("");
    for (const a of additions) {
      lines.push(
        `INSERT IGNORE INTO listing_categories (listing_id, category_id) VALUES (${a.id}, ${categoryId.get(a.slug)}); -- ${a.name} +${a.slug}`,
      );
    }
    lines.push("");
    process.stdout.write(lines.join("\n"));
    close();
    return;
  }

  if (DRY) {
    console.log("\n--dry-run: nothing written");
    close();
    return;
  }

  const setPrimary = db.prepare("UPDATE listings SET category_id = ? WHERE id = ?");
  const addLink = db.prepare(
    "INSERT OR IGNORE INTO listing_categories (listing_id, category_id) VALUES (?, ?)",
  );
  let relabelled = 0;
  let added = 0;
  db.exec("BEGIN");
  try {
    for (const r of relabels) {
      relabelled += setPrimary.run(categoryId.get(r.to), r.id).changes;
      added += addLink.run(r.id, categoryId.get(r.to)).changes;
    }
    for (const a of additions) added += addLink.run(a.id, categoryId.get(a.slug)).changes;
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  console.log(`\napplied: ${relabelled} listings relabelled, ${added} category links added`);
  close();
})();
