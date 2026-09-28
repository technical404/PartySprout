'use strict';

/**
 * Diagnostic: for sites Database/fetch-about.cjs could not read an about page
 * from, show what the homepage actually links to and whether the site publishes
 * a sitemap that names an about page.
 *
 *   node scripts/probe-about-links.cjs example.com other.example.org
 */

const UA = 'PartySpark-about-fetcher/1.0 (+https://anuranjanv14.sg-host.com)';

async function get(url, bytes = 400000) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.5' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  const text = (await res.text()).slice(0, bytes);
  return { status: res.status, finalUrl: res.url, text, type: res.headers.get('content-type') || '' };
}

async function probe(site) {
  const url = /^https?:\/\//i.test(site) ? site : `https://${site}`;
  console.log('\n================', url);
  let home;
  try {
    home = await get(url);
  } catch (error) {
    console.log('  homepage fetch FAILED:', error.message);
    return;
  }
  console.log('  status', home.status, '| final', home.finalUrl, '| bytes', home.text.length, '|', home.type);

  const hrefs = new Set();
  const matches = [];
  for (const tag of home.text.match(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi) || []) {
    const m = tag.match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!m) continue;
    const href = (m[2] ?? m[3] ?? m[4] ?? '').trim();
    const label = tag.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!href || /^(#|javascript|mailto|tel|data)/i.test(href)) continue;
    hrefs.add(href);
    if (/about|story|who|team|company|mission|bio/i.test(`${href} ${label}`)) {
      matches.push(`      MATCH href=${href}  label="${label.slice(0, 40)}"`);
    }
  }
  console.log('  hrefs on homepage:', hrefs.size, '| about-ish:', matches.length);
  for (const line of matches.slice(0, 8)) console.log(line);

  try {
    const robots = await get(new URL('/robots.txt', home.finalUrl).toString(), 50000);
    const sitemaps = (robots.text.match(/^\s*sitemap:\s*(\S+)/gim) || []).map((s) => s.split(/:\s*/)[1]);
    console.log('  robots.txt', robots.status, '| Sitemap:', sitemaps.length ? sitemaps.join(', ') : '(none)');
  } catch (error) {
    console.log('  robots.txt failed:', error.message);
  }

  for (const path of ['/sitemap.xml', '/sitemap_index.xml', '/page-sitemap.xml']) {
    try {
      const sm = await get(new URL(path, home.finalUrl).toString(), 400000);
      if (sm.status !== 200) {
        console.log(`  ${path}: status ${sm.status}`);
        continue;
      }
      const locs = [...sm.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
      const aboutish = locs.filter((u) => /about|our-story|who-we-are|story|team|company|mission/i.test(u));
      console.log(`  ${path}: 200, ${locs.length} <loc>, about-ish ${aboutish.length}`);
      for (const u of aboutish.slice(0, 8)) console.log('      ', u);
      break;
    } catch (error) {
      console.log(`  ${path}: ${error.message}`);
    }
  }
}

(async () => {
  const sites = process.argv.slice(2);
  if (!sites.length) {
    console.error('usage: node scripts/probe-about-links.cjs <site> [site...]');
    process.exit(1);
  }
  for (const site of sites) await probe(site);
})().catch((error) => {
  console.error('ERR', error);
  process.exitCode = 1;
});
