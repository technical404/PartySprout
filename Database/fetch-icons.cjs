'use strict';

/**
 * Resolves the icon each business uses on its own website and caches the
 * absolute URL in listings.icon_url. Run after Database/import-excel.cjs:
 *
 *   node Database/fetch-icons.cjs              # fetch sites that have no icon yet
 *   node Database/fetch-icons.cjs --force      # refetch every website
 *   node Database/fetch-icons.cjs --limit 20   # small test batch
 *   node Database/fetch-icons.cjs --verbose    # log the choice for every site
 *
 * A site that offers no usable icon is stored as '' ("checked, nothing found")
 * so later runs skip it instead of retrying forever. A site we could not reach
 * is left NULL so the next run retries it. The API maps '' back to null.
 */

const { init, db, close } = require('./index.js');

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8000;
const CONCURRENCY = 12;
const USER_AGENT = 'PartySpark-icon-fetcher/1.0';

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const VERBOSE = argv.includes('--verbose');
const limitArg = argv.indexOf('--limit');
const LIMIT = limitArg !== -1 ? Number(argv[limitArg + 1]) : 0;

/** Accepts "example.com", "https://example.com/x" and everything in between. */
function normalizeWebsite(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Reads at most `limit` bytes of the response. Homepages can be hundreds of
 * kilobytes and every icon we care about lives in <head>.
 */
async function readCapped(res, limit) {
  if (!res.body) return '';
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
  return Buffer.concat(chunks).toString('utf8');
}

async function get(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  if (!match) return '';
  return (match[2] ?? match[3] ?? match[4] ?? '').trim();
}

/** Resolves an href against the page and rejects anything that is not http(s). */
function resolveIconUrl(href, baseUrl) {
  const value = String(href || '').trim();
  if (!value || /^(data|javascript|blob|file|mailto):/i.test(value)) return null;
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const resolved = url.toString();
    return resolved.length <= 2000 ? resolved : null;
  } catch {
    return null;
  }
}

function maxSize(sizes) {
  let best = 0;
  for (const part of String(sizes || '').split(/\s+/)) {
    const n = Number.parseInt(part, 10);
    if (Number.isFinite(n) && n > best) best = n;
  }
  return best;
}

/**
 * Picks the best icon declared in the document. apple-touch-icons are the
 * highest-quality raster option (usually 180x180 PNG), so they win over the
 * tiny 16/32px favicons; `sizes` breaks ties.
 */
function pickDeclaredIcon(html, baseUrl) {
  const found = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rels = attr(tag, 'rel').toLowerCase().split(/\s+/).filter(Boolean);
    const isApple = rels.some((r) => r.startsWith('apple-touch-icon'));
    if (!isApple && !rels.includes('icon')) continue;

    const url = resolveIconUrl(attr(tag, 'href'), baseUrl);
    if (!url) continue;

    const type = attr(tag, 'type').toLowerCase();
    const size = maxSize(attr(tag, 'sizes'));
    // An unsized .ico is almost always the 16px legacy file; rank it last.
    const rank = isApple ? 3 : size > 0 || /svg|png|webp/i.test(type) ? 2 : 1;
    found.push({ url, rank, size });
  }

  found.sort((a, b) => b.rank - a.rank || b.size - a.size);
  return found[0]?.url ?? null;
}

/** Confirms a guessed /favicon.ico actually exists before caching it. */
async function probeIcon(url) {
  try {
    const res = await get(url);
    const type = (res.headers.get('content-type') || '').toLowerCase();
    try {
      await res.body?.cancel();
    } catch {
      /* body already consumed */
    }
    return /^image\//.test(type) || type.includes('octet-stream');
  } catch {
    return false;
  }
}

/** Returns an absolute icon URL, or null when the site offers none. */
async function findIcon(website) {
  const res = await get(website);
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (type && !type.includes('html') && !type.includes('xml')) throw new Error(`not HTML (${type})`);

  const html = await readCapped(res, MAX_BYTES);
  const declared = pickDeclaredIcon(html, res.url || website);
  if (declared) return declared;

  const fallback = new URL('/favicon.ico', res.url || website).toString();
  return (await probeIcon(fallback)) ? fallback : null;
}

/** Runs `worker` over `items` with a fixed number of concurrent workers. */
async function runPool(items, size, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      await worker(items[next++]);
    }
  });
  await Promise.all(runners);
}

async function main() {
  init();

  const rows = db
    .prepare(
      `SELECT website, MAX(icon_url) AS icon_url
         FROM listings
        WHERE status = 'active' AND website IS NOT NULL AND TRIM(website) <> ''
        GROUP BY website
        ORDER BY (icon_url IS NULL) DESC, website`
    )
    .all();

  const pending = rows.filter((row) => FORCE || row.icon_url == null);
  const targets = LIMIT > 0 ? pending.slice(0, LIMIT) : pending;

  console.log(
    `${rows.length} distinct websites, ${pending.length} without an icon yet` +
      (targets.length !== pending.length ? `, processing ${targets.length}` : '')
  );
  if (!targets.length) {
    console.log(`Nothing to do — ${rows.filter((r) => r.icon_url).length} sites already resolved. Use --force to refetch.`);
    close();
    return;
  }

  const update = db.prepare("UPDATE listings SET icon_url = ? WHERE website = ? AND status = 'active'");
  const stats = { found: 0, missing: 0, failed: 0 };
  const failures = [];
  let processed = 0;

  await runPool(targets, CONCURRENCY, async (row) => {
    const url = normalizeWebsite(row.website);
    let icon = null; // null => could not check, leave it for a later run

    if (url) {
      try {
        icon = await findIcon(url);
        stats[icon ? 'found' : 'missing'] += 1;
      } catch (error) {
        stats.failed += 1;
        failures.push(`${row.website} — ${error.message}`);
      }
    } else {
      stats.failed += 1;
      failures.push(`${row.website} — unparseable URL`);
    }

    // '' records "checked, nothing found"; null is not written at all.
    if (icon !== null) update.run(icon, row.website);

    processed += 1;
    if (VERBOSE) console.log(`  [${processed}/${targets.length}] ${icon || '(none)'}  <- ${row.website}`);
    else if (processed % 25 === 0) console.log(`  ${processed}/${targets.length} …`);
  });

  const total = db
    .prepare("SELECT COUNT(*) AS c FROM listings WHERE status = 'active' AND icon_url IS NOT NULL AND icon_url <> ''")
    .get().c;
  console.log('\nDone:', stats, `| active listings with an icon: ${total}`);

  if (failures.length) {
    console.log(`\n${failures.length} site(s) not updated (retried on the next run):`);
    for (const line of failures.slice(0, 15)) console.log(`  ${line}`);
    if (failures.length > 15) console.log(`  … and ${failures.length - 15} more`);
  }

  close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
