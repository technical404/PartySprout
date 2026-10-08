'use strict';

/**
 * Caches the picture a business uses for itself on its own homepage, so its card in
 * the directory shows the business rather than a stock photograph of its category.
 * The URL is stored in listings.image_url and hot-linked from there:
 *
 *   node Database/fetch-images.cjs                # sites with no image yet
 *   node Database/fetch-images.cjs --force        # refetch every website
 *   node Database/fetch-images.cjs --limit 20     # small test batch
 *   node Database/fetch-images.cjs --verbose      # log the choice for every site
 *   node Database/fetch-images.cjs --only charactersforparty.com   # one site only
 *
 * Only https URLs are stored. The site itself is served over https, so an http
 * image would be blocked by the browser as mixed content — a card that could never
 * load is worse than one that falls back to the category picture. '' records
 * "checked, nothing usable" so later runs skip the site; a site we could not reach
 * is left NULL so the next run retries it. The API maps '' back to null.
 */

const { init, db, close } = require('./index.js');

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 20000;
const CONCURRENCY = 8;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
/** Declared px floor for an <img>: below this it is furniture, not a picture. */
const SIZE_FLOOR = 400;
/** Anything named like this is chrome — a logo in the header is nobody's card. */
const REJECT_NAME = /(logo|icon|sprite|favicon|avatar|placeholder|badge|spinner|loader|pixel|blank|transparent|1x1|spacer)/i;

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const VERBOSE = argv.includes('--verbose');
const limitArg = argv.indexOf('--limit');
const LIMIT = limitArg !== -1 ? Number(argv[limitArg + 1]) : 0;
/** --only example.com keeps just the websites containing that substring. */
const onlyArg = argv.indexOf('--only');
const ONLY = onlyArg === -1 ? null : String(argv[onlyArg + 1] || '').trim().toLowerCase();

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
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
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

/**
 * Resolves a candidate against the page and keeps only what the site could actually
 * paint: an absolute https URL of something that looks like an image.
 */
function resolveImageUrl(href, baseUrl) {
  const value = String(href || '').trim();
  if (!value || /^(data|javascript|blob|file|mailto):/i.test(value)) return null;
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== 'https:') return null;
    const resolved = url.toString();
    return resolved.length <= 2000 ? resolved : null;
  } catch {
    return null;
  }
}

/** The page's own claim about what represents it: og:image, then twitter:image. */
function pickOpenGraphImage(html, baseUrl) {
  for (const property of ['og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src']) {
    const pattern = new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${property.replace(/[:.]/g, '.')}["'][^>]*>`,
      'i',
    );
    const tag = pattern.exec(html)?.[0];
    if (!tag) continue;
    const url = resolveImageUrl(attr(tag, 'content'), baseUrl);
    if (url) return url;
  }
  return null;
}

/** Dimensions off the tag: width/height attributes, or the widest srcset candidate. */
function imageSize(tag) {
  const width = Number.parseInt(attr(tag, 'width'), 10) || 0;
  const height = Number.parseInt(attr(tag, 'height'), 10) || 0;
  const srcset = attr(tag, 'srcset') || attr(tag, 'data-srcset');
  let widest = 0;
  for (const part of srcset.split(',')) {
    const descriptor = /(\d+)\s*w\s*$/.exec(part.trim());
    if (descriptor) widest = Math.max(widest, Number.parseInt(descriptor[1], 10));
  }
  return { width: Math.max(width, widest), height };
}

/**
 * The biggest honest photograph in the markup, for the many sites that publish no
 * og:image at all. Sized images only: a picture the site bothered to size is a
 * picture it means to show.
 */
function pickLargestImage(html, baseUrl) {
  let best = null;
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const src = attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'src');
    const { width, height } = imageSize(tag);
    if (!src || Math.max(width, height) < SIZE_FLOOR) continue;
    if (REJECT_NAME.test(src)) continue;
    if (!/\.(jpe?g|png|webp|avif|jfif)(\?|#|$)/i.test(src)) continue;
    const url = resolveImageUrl(src, baseUrl);
    if (!url) continue;
    const area = width * (height || width);
    if (!best || area > best.area) best = { url, area };
  }
  return best?.url ?? null;
}

/**
 * Returns an absolute https image URL, or '' when the site was read and offers
 * nothing usable. It throws only when the site could not be read at all, which is
 * what keeps an unreachable site in the queue for the next run.
 */
async function findImage(website) {
  const res = await get(website);
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (type && !type.includes('html') && !type.includes('xml')) throw new Error(`not HTML (${type})`);

  const html = await readCapped(res, MAX_BYTES);
  const base = res.url || website;
  return pickOpenGraphImage(html, base) || pickLargestImage(html, base) || '';
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
      `SELECT website, MAX(image_url) AS image_url
         FROM listings
        WHERE status = 'active' AND website IS NOT NULL AND TRIM(website) <> ''
        GROUP BY website
        ORDER BY (image_url IS NULL) DESC, website`
    )
    .all();

  const matching = ONLY ? rows.filter((row) => String(row.website).toLowerCase().includes(ONLY)) : rows;
  const pending = matching.filter((row) => FORCE || row.image_url == null);
  const targets = LIMIT > 0 ? pending.slice(0, LIMIT) : pending;

  console.log(
    `${rows.length} distinct websites, ${pending.length} without an image yet` +
      (targets.length !== pending.length ? `, processing ${targets.length}` : '')
  );
  if (!targets.length) {
    console.log(`Nothing to do — ${rows.filter((r) => r.image_url).length} sites already resolved. Use --force to refetch.`);
    close();
    return;
  }

  const update = db.prepare("UPDATE listings SET image_url = ? WHERE website = ? AND status = 'active'");
  const stats = { found: 0, missing: 0, failed: 0 };
  const failures = [];
  let processed = 0;

  await runPool(targets, CONCURRENCY, async (row) => {
    const url = normalizeWebsite(row.website);
    let image = null; // null => could not check, leave it for a later run

    if (url) {
      try {
        image = await findImage(url);
        stats[image ? 'found' : 'missing'] += 1;
      } catch (error) {
        stats.failed += 1;
        failures.push(`${row.website} — ${error.message}`);
      }
    } else {
      stats.failed += 1;
      failures.push(`${row.website} — unparseable URL`);
    }

    // '' records "checked, nothing usable"; null is not written at all.
    if (image !== null) update.run(image, row.website);

    processed += 1;
    if (VERBOSE) console.log(`  [${processed}/${targets.length}] ${image || '(none)'}  <- ${row.website}`);
    else if (processed % 25 === 0) console.log(`  ${processed}/${targets.length} …`);
  });

  const total = db
    .prepare("SELECT COUNT(*) AS c FROM listings WHERE status = 'active' AND image_url IS NOT NULL AND image_url <> ''")
    .get().c;
  console.log('\nDone:', stats, `| active listings with their own image: ${total}`);

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
