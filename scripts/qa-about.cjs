'use strict';

/**
 * Quality audit over the descriptions written by Database/fetch-about.cjs.
 * Flags anything that looks like leaked code, an undecoded entity, gambling or
 * pill spam, a duplicate of another listing, or keyword stuffing.
 *
 *   node scripts/qa-about.cjs
 */

const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(path.join(__dirname, '..', 'Database', 'directory.db'));
const rows = db
  .prepare('SELECT id, name, website, description FROM listings WHERE about_fetched_at IS NOT NULL ORDER BY id')
  .all();

const CODE = /[{}]|@font-face|function\s*\(|:\s*root\b|var\(--|!important/i;
const ENTITY = /&[a-z]{2,8};/i;
const SPAM = /\b(slot|gacor|rtp|togel|judi|sbobet|maxwin|casino|poker|viagra|cialis)\b/i;
const ON_TOPIC = /\b(party|parties|character|entertain|birthday|kids|children|mascot|clown|princess|balloon|performer|celebrat|costume|event)\b/i;

const seen = new Map();
const flags = { leakedCode: [], entity: [], spam: [], offTopic: [], duplicate: [], short: [], keywordSoup: [] };

for (const row of rows) {
  const d = row.description || '';
  const tag = `#${row.id} ${row.name}`;
  if (CODE.test(d)) flags.leakedCode.push(tag);
  if (ENTITY.test(d)) flags.entity.push(`${tag} -> ${(d.match(ENTITY) || [])[0]}`);
  if (SPAM.test(d)) flags.spam.push(`${tag} -> ${(d.match(SPAM) || [])[0]}`);
  if (!ON_TOPIC.test(d)) flags.offTopic.push(tag);
  if (d.length < 200) flags.short.push(`${tag} (${d.length})`);

  // Keyword stuffing: many commas packed into little text.
  const commas = (d.match(/,/g) || []).length;
  if (d.length > 0 && (commas / d.length) * 100 > 4) {
    flags.keywordSoup.push(`${tag} (${commas} commas / ${d.length} chars)`);
  }

  const key = d.trim();
  if (seen.has(key)) flags.duplicate.push(`${tag} == ${seen.get(key)}`);
  else seen.set(key, tag);
}

const lens = rows.map((r) => (r.description || '').length).sort((a, b) => a - b);
const pct = (p) => lens[Math.floor((lens.length - 1) * p)] ?? 0;

console.log(`audited ${rows.length} listings\n`);
console.log(`length  min ${lens[0]}  p25 ${pct(0.25)}  median ${pct(0.5)}  p75 ${pct(0.75)}  max ${lens[lens.length - 1]}`);

for (const [key, list] of Object.entries(flags)) {
  console.log(`\n${key}: ${list.length}`);
  for (const line of list.slice(0, 12)) console.log(`   ${line}`);
  if (list.length > 12) console.log(`   … and ${list.length - 12} more`);
}
