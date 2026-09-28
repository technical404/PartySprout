'use strict';

/**
 * Fills listings.description with the text of each business's own "about" page,
 * replacing the Google-derived placeholders ("Children's party service · 1381
 * Google reviews") that the import left behind.
 *
 *   node Database/fetch-about.cjs --limit 8 --dry-run --verbose
 *   node Database/fetch-about.cjs                # everything not yet fetched
 *   node Database/fetch-about.cjs --force        # refetch every website
 *
 * A successful fetch stamps about_fetched_at, so later runs only retry the
 * sites that failed. Originals are backed up to a JSON file before the first
 * write, so a run can be undone.
 *
 * Note: this copies third-party marketing copy into the directory. Keep the
 * excerpts short enough to sit inside fair-use / fair-dealing territory, and
 * keep the backup so any site that objects can be reverted individually.
 */

const fs = require('node:fs');
const path = require('node:path');
const { init, db, close } = require('./index.js');

const MAX_BYTES = 2 * 1024 * 1024;
const SITEMAP_BYTES = 1024 * 1024;
const ROBOTS_BYTES = 64 * 1024;
const TIMEOUT_MS = 12000;
const CONCURRENCY = 6;
const USER_AGENT = 'PartySpark-about-fetcher/1.0 (+https://anuranjanv14.sg-host.com)';

/** Below this the "about" page is really a nav shell; try the next candidate. */
const MIN_CHARS = 160;
const DEFAULT_MAX_CHARS = 20000;

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const VERBOSE = argv.includes('--verbose');
const DRY_RUN = argv.includes('--dry-run');
const num = (name, fallback) => {
  const i = argv.indexOf(name);
  const value = i === -1 ? Number.NaN : Number(argv[i + 1]);
  return Number.isFinite(value) ? value : fallback;
};
const LIMIT = num('--limit', 0);
const MAX_CHARS = num('--max-chars', DEFAULT_MAX_CHARS);

/** --only 12,34 refetches just those listing ids, stamps and all. */
const onlyArg = argv.indexOf('--only');
const ONLY =
  onlyArg === -1
    ? null
    : new Set(
        String(argv[onlyArg + 1] || '')
          .split(',')
          .map((s) => Number(s.trim()))
          .filter(Number.isFinite)
      );

/** Common about-page paths, tried after any link the homepage itself exposes. */
const GUESS_PATHS = [
  'about',
  'about-us',
  'aboutus',
  'about-us.html',
  'about.html',
  'about_us',
  'about-me',
  'about-me.html',
  'our-story',
  'our-story.html',
  'our-company',
  'story',
  'who-we-are',
  'company',
  'pages/about',
  'pages/about-us',
  'pages/about-me',
];

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

/** Resolves href against base and rejects anything that is not http(s). */
function resolveUrl(href, baseUrl) {
  const value = String(href || '').trim();
  if (!value || /^(data|javascript|blob|file|mailto|tel|#):/i.test(value)) return null;
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString().length <= 2000 ? url.toString() : null;
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

async function get(url, bytes = MAX_BYTES, lenient = false) {
  const res = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = (res.headers.get('content-type') || '').toLowerCase();
  // Sitemaps are occasionally served as octet-stream, so `lenient` callers skip
  // the content-type gate.
  if (!lenient && type && !type.includes('html') && !type.includes('xml') && !type.includes('text')) {
    throw new Error(`not HTML (${type})`);
  }
  const html = await readCapped(res, bytes);
  return { html, finalUrl: res.url || url };
}

/* --- robots.txt --------------------------------------------------------- */

const robotsCache = new Map();

/** Minimal robots.txt support: Disallow prefixes and any Sitemap: pointers. */
function parseRobots(text) {
  const disallow = [];
  const sitemaps = [];
  let applies = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    // Take everything after the *first* colon: a Sitemap value is itself a URL.
    const value = line.slice(sep + 1).trim();
    if (key === 'user-agent') applies = value === '*' || /partyspark/i.test(value);
    else if (key === 'disallow' && applies && value) disallow.push(value);
    else if (key === 'sitemap' && value) sitemaps.push(value);
  }
  return { disallow, sitemaps };
}

/** Cached per origin: { disallow, sitemaps }, or null when there is no robots.txt. */
async function robotsInfo(origin) {
  if (!robotsCache.has(origin)) {
    robotsCache.set(
      origin,
      (async () => {
        try {
          const res = await fetch(new URL('/robots.txt', origin), {
            headers: { 'user-agent': USER_AGENT, accept: 'text/plain,*/*' },
            redirect: 'follow',
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!res.ok) return null; // no robots.txt => nothing is disallowed
          return parseRobots(await readCapped(res, ROBOTS_BYTES));
        } catch {
          return null; // unreachable robots.txt must not block the run
        }
      })()
    );
  }
  return robotsCache.get(origin);
}

/** True when robots.txt permits fetching `rawUrl`. */
async function robotsAllows(rawUrl) {
  const url = new URL(rawUrl);
  const info = await robotsInfo(url.origin);
  if (!info || info.disallow.length === 0) return true;
  return !info.disallow.some((prefix) => url.pathname.startsWith(prefix));
}

/* --- sitemap ------------------------------------------------------------ */

/**
 * How strongly a URL path looks like the company's about page. 0 means "not an
 * about page". Scoring rather than a yes/no test matters because the sitemap
 * order is arbitrary: without it a /post/we-are-hiring-team-members job advert
 * can be picked ahead of the real /about page.
 */
const ABOUT_PHRASES = /our[-_]?(story|team|company)|who[-_]?we[-_]?are|about[-_]?us|meet[-_]?the[-_]?team/i;
// Blog posts, job adverts and product pages can mention "team" or "about".
const NOT_ABOUT = /(blog|post|news|article|job|career|hiring|employment|vacanc|press|gallery|faq|shop|product|pricing)/i;

function aboutScore(pathname) {
  const path = pathname.toLowerCase();
  let score;
  if (ABOUT_PHRASES.test(path)) score = 100;
  else if (/(^|[^a-z])about([^a-z]|$)/.test(path)) score = 90;
  else if (/(^|[^a-z])(company|mission|bio)([^a-z]|$)/.test(path)) score = 60;
  else if (/(^|[^a-z])team([^a-z]|$)/.test(path)) score = 40;
  else return 0;

  if (NOT_ABOUT.test(path)) score -= 60;
  // Shallower paths are more likely to be the main about page.
  score -= path.split('/').filter(Boolean).length * 5;
  return score > 0 ? score : 0;
}

/**
 * About-ish page URLs named in the site's sitemap. This is what makes
 * JavaScript-rendered sites work at all: their homepage HTML contains almost no
 * links, but the sitemap still lists every page.
 */
async function sitemapAboutLinks(origin) {
  const info = await robotsInfo(origin);
  const queue = [...(info?.sitemaps ?? [])];
  queue.push(new URL('/sitemap.xml', origin).toString());
  queue.push(new URL('/sitemap_index.xml', origin).toString());

  const found = new Set();
  const tried = new Set();
  let fetches = 0;

  while (queue.length && fetches < 4 && found.size < 8) {
    const next = queue.shift();
    if (tried.has(next)) continue;
    tried.add(next);
    fetches += 1;
    try {
      const res = await get(next, SITEMAP_BYTES, true);
      const locs = [...res.html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
      for (const loc of locs) {
        // A sitemap index points at more sitemaps rather than at pages.
        if (/\.xml(\.gz)?$/i.test(loc)) {
          if (queue.length < 6) queue.push(loc);
          continue;
        }
        if (aboutScore(new URL(loc).pathname) > 0 && new URL(loc).origin === origin) found.add(loc.split('#')[0]);
      }
    } catch {
      /* no sitemap here, or unreadable */
    }
  }
  return [...found];
}

/* --- HTML to text ------------------------------------------------------- */

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  rsquo: '\u2019',
  lsquo: '\u2018',
  ldquo: '\u201c',
  rdquo: '\u201d',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  bull: '\u2022',
  middot: '\u00b7',
  laquo: '\u00ab',
  raquo: '\u00bb',
  plusmn: '\u00b1',
  times: '\u00d7',
  divide: '\u00f7',
  deg: '\u00b0',
  euro: '\u20ac',
  pound: '\u00a3',
  yen: '\u00a5',
  cent: '\u00a2',
  sect: '\u00a7',
  para: '\u00b6',
  micro: '\u00b5',
  frac12: '\u00bd',
  frac14: '\u00bc',
  frac34: '\u00be',
  sup2: '\u00b2',
  sup3: '\u00b3',
  dagger: '\u2020',
  permil: '\u2030',
  prime: '\u2032',
  minus: '\u2212',
  sbquo: '\u201a',
  bdquo: '\u201e',
  larr: '\u2190',
  rarr: '\u2192',
  harr: '\u2194',
  // Accented Latin-1 letters turn up in business names and place names.
  agrave: '\u00e0',
  aacute: '\u00e1',
  acirc: '\u00e2',
  atilde: '\u00e3',
  auml: '\u00e4',
  aring: '\u00e5',
  aelig: '\u00e6',
  ccedil: '\u00e7',
  egrave: '\u00e8',
  eacute: '\u00e9',
  ecirc: '\u00ea',
  euml: '\u00eb',
  igrave: '\u00ec',
  iacute: '\u00ed',
  icirc: '\u00ee',
  iuml: '\u00ef',
  ntilde: '\u00f1',
  ograve: '\u00f2',
  oacute: '\u00f3',
  ocirc: '\u00f4',
  otilde: '\u00f5',
  ouml: '\u00f6',
  oslash: '\u00f8',
  ugrave: '\u00f9',
  uacute: '\u00fa',
  ucirc: '\u00fb',
  uuml: '\u00fc',
  yacute: '\u00fd',
  szlig: '\u00df',
  Agrave: '\u00c0',
  Aacute: '\u00c1',
  Acirc: '\u00c2',
  Auml: '\u00c4',
  Aring: '\u00c5',
  Ccedil: '\u00c7',
  Egrave: '\u00c8',
  Eacute: '\u00c9',
  Ecirc: '\u00ca',
  Euml: '\u00cb',
  Iacute: '\u00cd',
  Ntilde: '\u00d1',
  Oacute: '\u00d3',
  Ouml: '\u00d6',
  Oslash: '\u00d8',
  Uacute: '\u00da',
  Uuml: '\u00dc',
};

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) return String.fromCodePoint(code);
      return match;
    }
    // Exact match first so &Aacute; keeps its capital, then a case-insensitive
    // lookup for oddities like &AMP;.
    if (Object.prototype.hasOwnProperty.call(ENTITIES, body)) return ENTITIES[body];
    const lower = ENTITIES[body.toLowerCase()];
    return lower !== undefined ? lower : match;
  });
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  if (!match) return '';
  return (match[2] ?? match[3] ?? match[4] ?? '').trim();
}

/** Chrome and menus, dropped line by line once the tags are gone. */
const BOILERPLATE =
  /\u00a9|all rights reserved|copyright|privacy policy|terms of (use|service|sale)|cookie (policy|notice)|we use cookies|follow us|subscribe|newsletter|sign ?in|log ?in|add to cart|back to top|skip to (content|main)|loading|enable javascript/i;

/**
 * Turns a page into candidate paragraph lines. Not a full parser: it drops the
 * usual non-content regions, breaks on block-level tags, then keeps only lines
 * that look like prose.
 */
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
  // A page that is cut off mid-<style>, or that never closes the tag, would
  // otherwise leak raw CSS or JavaScript into the text.
  text = text.replace(/<(script|style|noscript|svg|iframe|template)\b[^>]*>[\s\S]*$/gi, ' ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeEntities(text);

  const out = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.replace(/[ \t\u00a0]+/g, ' ').trim();
    if (line.length < 25) continue;
    if (BOILERPLATE.test(line)) continue;
    if (!/[a-z]{3}/i.test(line)) continue;
    const words = line.split(/\s+/).length;
    // Short lines that are not sentences are almost always menu items/buttons.
    const looksLikeProse = /[.!?:]$/.test(line) || words >= 9;
    if (!looksLikeProse && line.length < 60) continue;
    if (out[out.length - 1] === line) continue;
    out.push(line);
  }
  return out;
}

/** Wording that only ever turns up on a party/entertainment business site. */
const ON_TOPIC = /\b(party|parties|character|entertain|birthday|kids|children|mascot|clown|princess|balloon|performer|celebrat|costume|event)\b/i;

/**
 * Domains lapse and get re-registered, so HTTP 200 alone proves nothing:
 * aprincesslikemenyc.com now serves an Indonesian gambling page. Only keep text
 * that actually reads like a children's-entertainment business.
 */
function isOnTopic(text) {
  return ON_TOPIC.test(text);
}

function toText(paragraphs) {
  return paragraphs.join('\n\n').trim();
}

/** About-ish links the homepage points at, same host only. */
function discoverAboutLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const found = [];
  for (const tag of html.match(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi) || []) {
    const href = attr(tag, 'href');
    if (!href) continue;
    const abs = resolveUrl(href, baseUrl);
    if (!abs || new URL(abs).origin !== base.origin) continue;
    if (/\.(pdf|jpg|jpeg|png|gif|zip|docx?)$/i.test(new URL(abs).pathname)) continue;

    const label = tag.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const labelMatch = /about|our story|who we are|our team|our company|meet the|mission/i.test(label);
    if (!labelMatch && aboutScore(new URL(abs).pathname) === 0) continue;
    found.push(abs.split('#')[0]);
  }
  return [...new Set(found)];
}

/**
 * Returns { text, source, truncated } for one listing, or throws when no real
 * about page could be read. Homepages and meta descriptions are deliberately
 * not used as a fallback: they are usually keyword-stuffed menus rather than
 * prose, and read worse than the placeholder they would replace.
 */
async function findAbout(website) {
  if (!(await robotsAllows(website))) throw new Error('robots.txt disallows crawling');

  const home = await get(website);
  const base = home.finalUrl || website;
  const origin = new URL(base).origin;

  // The sitemap is often the only usable index: JavaScript-rendered sites ship
  // a homepage with a handful of links, but still publish every page there.
  const fromSitemap = await sitemapAboutLinks(origin);
  const candidates = [
    ...fromSitemap,
    ...discoverAboutLinks(home.html, base),
    ...GUESS_PATHS.map((p) => resolveUrl(`/${p}`, base)).filter(Boolean),
  ];

  // Try the most about-like URLs first, whatever order they were discovered in.
  const ranked = [...new Set(candidates)].sort(
    (a, b) => aboutScore(new URL(b).pathname) - aboutScore(new URL(a).pathname)
  );

  let attempts = 0;
  for (const candidate of ranked) {
    if (attempts >= 8) break;
    attempts += 1;
    try {
      if (!(await robotsAllows(candidate))) continue;
      const page = await get(candidate);
      const text = toText(htmlToParagraphs(page.html));
      if (text.length >= MIN_CHARS && isOnTopic(text)) {
        return { text, source: candidate, truncated: false };
      }
    } catch {
      /* try the next candidate */
    }
  }

  throw new Error('no about page found');
}

/* --- runner ------------------------------------------------------------- */

async function runPool(items, size, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      await worker(items[next++]);
    }
  });
  await Promise.all(runners);
}

function backupPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(__dirname, `description-backup-${stamp}.json`);
}

async function main() {
  init();

  const rows = db
    .prepare(
      `SELECT id, name, website, description, about_fetched_at
         FROM listings
        WHERE status = 'active' AND website IS NOT NULL AND TRIM(website) <> ''
        ORDER BY (about_fetched_at IS NULL) DESC, id`
    )
    .all();

  const pending = ONLY
    ? rows.filter((row) => ONLY.has(row.id))
    : rows.filter((row) => FORCE || row.about_fetched_at == null);
  const targets = ONLY || LIMIT === 0 ? pending : pending.slice(0, LIMIT);

  console.log(
    `${rows.length} active listings with a website, ${pending.length} still to fetch` +
      (targets.length !== pending.length ? `, processing ${targets.length}` : '') +
      (DRY_RUN ? ' [dry run]' : '')
  );
  if (!targets.length) {
    console.log('Nothing to do. Use --force to refetch everything.');
    close();
    return;
  }

  if (!DRY_RUN) {
    const file = backupPath();
    fs.writeFileSync(
      file,
      JSON.stringify(
        targets.map((row) => ({ id: row.id, website: row.website, description: row.description })),
        null,
        1
      )
    );
    console.log(`Backup of ${targets.length} current descriptions: ${file}`);
  }

  const update = db.prepare(
    "UPDATE listings SET description = ?, about_fetched_at = datetime('now') WHERE id = ?"
  );
  const stats = { found: 0, truncated: 0, failed: 0 };
  const failures = [];
  let processed = 0;

  await runPool(targets, CONCURRENCY, async (row) => {
    const url = normalizeWebsite(row.website);
    let text = null;
    let source = '';

    if (!url) {
      stats.failed += 1;
      failures.push(`#${row.id} ${row.website} — unparseable URL`);
    } else {
      try {
        const result = await findAbout(url);
        text = result.text;
        source = result.source;
        if (text.length > MAX_CHARS) {
          text = `${text.slice(0, MAX_CHARS).trimEnd()}\u2026`;
          stats.truncated += 1;
        }
        stats.found += 1;
      } catch (error) {
        stats.failed += 1;
        failures.push(`#${row.id} ${row.website} — ${error.message}`);
      }
    }

    if (text !== null && !DRY_RUN) update.run(text, row.id);

    processed += 1;
    if (VERBOSE) {
      const shown = text === null ? '(failed)' : text.slice(0, 110).replace(/\s+/g, ' ');
      console.log(`  [${processed}/${targets.length}] #${row.id} ${source || row.website}\n      ${shown}`);
    } else if (processed % 25 === 0) {
      console.log(`  ${processed}/${targets.length} \u2026`);
    }
  });

  const done = db.prepare('SELECT COUNT(*) AS c FROM listings WHERE about_fetched_at IS NOT NULL').get().c;
  console.log('\nDone:', stats, `| listings with fetched about text: ${done}`);

  if (failures.length) {
    console.log(`\n${failures.length} site(s) not updated (retried on the next run):`);
    for (const line of failures.slice(0, 20)) console.log(`  ${line}`);
    if (failures.length > 20) console.log(`  \u2026 and ${failures.length - 20} more`);
  }

  close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
