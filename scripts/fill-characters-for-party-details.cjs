'use strict';

/**
 * Fills description and price_from for the "Party Characters For Kids" city
 * listings added by scripts/add-characters-for-party.cjs.
 *
 * Database/fetch-about.cjs looks for an /about page on each listing's origin.
 * Every one of these listings shares the charactersforparty.com origin, so that
 * would write the same company blurb into all 16 rows. Each city page instead
 * carries its own local copy — performer counts, suburbs, parks, pricing — so
 * this reads the listing's own page and keeps that city's block.
 *
 * `about_fetched_at` is stamped so a later fetch-about run treats these rows as
 * already done rather than replacing the local text with the generic blurb.
 *
 *   node scripts/fill-characters-for-party-details.cjs          # dry run
 *   node scripts/fill-characters-for-party-details.cjs apply    # write
 */

const { init, db, close } = require('../Database/index.js');

const APPLY = process.argv.slice(2).includes('apply');
const TIMEOUT_MS = 20000;
const USER_AGENT = 'PartySpark-about-fetcher/1.0 (+https://anuranjanv14.sg-host.com)';
/** The city block opens with this sentence on every page, then runs for two more. */
const BLOCK_START = /family-owned character rental service/i;
const BLOCK_PARAGRAPHS = 3;

const ENTITIES = [
  [/&#8217;|&rsquo;|&lsquo;|&#8216;/g, "'"],
  [/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"'],
  [/&#8211;|&ndash;/g, '-'],
  [/&#8212;|&mdash;/g, '-'],
  [/&nbsp;/g, ' '],
  [/&amp;/g, '&'],
];

const BOILERPLATE =
  /©|all rights reserved|copyright|privacy policy|terms of (use|service|sale)|cookie (policy|notice)|we use cookies|follow us|subscribe|newsletter|sign ?in|log ?in|add to cart|back to top|loading|enable javascript/i;

/** Same shape as Database/fetch-about.cjs: keep lines that read like prose. */
function htmlToParagraphs(html) {
  let text = html;
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  text = text.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, ' ');
  text = text.replace(
    /<(script|style|noscript|svg|iframe|template|form|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    ' '
  );
  text = text.replace(/<br\b[^>]*>/gi, '\n');
  text = text.replace(/<\/(p|div|li|ul|ol|h[1-6]|section|article|tr|td|blockquote|figcaption|span)\s*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, ' ');
  for (const [pattern, value] of ENTITIES) text = text.replace(pattern, value);
  text = text.replace(/&#[0-9]+;|&[a-z]+;/gi, ' ');

  const out = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.replace(/[ \t\u00a0]+/g, ' ').trim();
    if (line.length < 25) continue;
    if (BOILERPLATE.test(line)) continue;
    if (!/[a-z]{3}/i.test(line)) continue;
    const words = line.split(/\s+/).length;
    if (!/[.!?:]$/.test(line) && words < 9 && line.length < 60) continue;
    if (out[out.length - 1] === line) continue;
    out.push(line);
  }
  return out;
}

async function readCity(website) {
  const res = await fetch(website, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const lines = htmlToParagraphs(html);
  const start = lines.findIndex((line) => BLOCK_START.test(line));
  if (start === -1) throw new Error('city description block not found');
  const description = lines.slice(start, start + BLOCK_PARAGRAPHS).join(' ').trim();

  // The block quotes the city's starting price, e.g. "across Dallas from $255"
  // or "across San Francisco starting at $255".
  const priceMatch = description.match(/(?:from|starting at) \$?\s?([0-9][0-9,]*)/i);
  const price = priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : null;
  return { description, price };
}

async function main() {
  init();

  const rows = db
    .prepare(
      `SELECT id, name, website, description, price_from
         FROM listings
        WHERE slug LIKE 'party-characters-for-kids-%'
        ORDER BY id`
    )
    .all();

  if (!rows.length) {
    console.log('No listings found — run scripts/add-characters-for-party.cjs apply first.');
    close();
    return;
  }
  console.log(`${rows.length} listing(s) to fill${APPLY ? '' : ' [dry run]'}`);

  const update = db.prepare(
    "UPDATE listings SET description = ?, price_from = ?, about_fetched_at = datetime('now') WHERE id = ?"
  );

  let filled = 0;
  const failures = [];
  for (const row of rows) {
    try {
      const { description, price } = await readCity(row.website);
      console.log(
        `  #${row.id} ${row.name}\n      ${description.length} chars, price_from=${price}\n      ${description.slice(0, 120)}…`
      );
      if (APPLY) update.run(description, price, row.id);
      filled += 1;
    } catch (error) {
      failures.push(`#${row.id} ${row.website} — ${error.message}`);
      console.log(`  #${row.id} ${row.name}\n      FAILED: ${error.message}`);
    }
    // Space the requests out: 16 pages on one origin in a burst is rude.
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  console.log(`\nfilled ${filled}/${rows.length}${APPLY ? '' : ' (nothing written)'}`);
  if (failures.length) {
    console.log('not filled:');
    for (const failure of failures) console.log(`  ${failure}`);
  }

  if (APPLY) {
    const done = db
      .prepare(
        "SELECT COUNT(*) AS c, COUNT(price_from) AS priced FROM listings WHERE slug LIKE 'party-characters-for-kids-%' AND description IS NOT NULL AND about_fetched_at IS NOT NULL"
      )
      .get();
    console.log(`listings with description and price: ${done.c} (priced: ${done.priced})`);
  }

  close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
