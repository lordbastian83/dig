/* Intel scraper — pulls bloodstock news and keeps only what matters to the
   programme: our radar candidates by name, the target sires, the sale
   houses, and the Dubai pipeline.

   Sources (all fetched tolerantly — a dead feed never kills the run):
     - Thoroughbred Daily News   RSS
     - BloodHorse                RSS (several candidate endpoints tried)
     - Racing Post bloodstock    RSS (tried; may 404)
     - Tattersalls news page     HTML headline scrape

   Output: news.json {generated, items:[{title,url,source,date,matched[]}]}
   published to the bloodstock-data branch; the app's Intel card reads it.

   Environment:
     CANDIDATES  path to candidates.json for name keywords (optional)
     OUT         output path (default news.json)
     MAX_AGE_D   drop items older than this many days (default 14)
     DEMO=1      offline synthetic test */

import { readFileSync, writeFileSync } from 'node:fs';

const OUT = process.env.OUT || 'news.json';
const MAX_AGE_D = +(process.env.MAX_AGE_D || 14);
const DEMO = process.env.DEMO === '1';

const SOURCES = [
  { name: 'TDN', type: 'rss', url: 'https://www.thoroughbreddailynews.com/feed/' },
  { name: 'BloodHorse', type: 'rss', url: 'https://www.bloodhorse.com/rss/latest-news' },
  { name: 'BloodHorse', type: 'rss', url: 'https://www.bloodhorse.com/RSS/latest-news.xml' },
  { name: 'Racing Post', type: 'rss', url: 'https://www.racingpost.com/rss/bloodstock' },
  { name: 'Tattersalls', type: 'html', url: 'https://www.tattersalls.com/news/',
    linkRe: /<a[^>]+href="(https?:\/\/www\.tattersalls\.com\/news\/[^"]+)"[^>]*>([^<]{15,140})<\/a>/gi },
];

const STATIC_TERMS = [
  'tattersalls', 'arqana', 'goffs', 'keeneland', 'horses in training',
  'catalogue', 'catalog', 'godolphin', 'juddmonte', 'shadwell', 'wathnan',
  'sheikh mohammed', 'meydan', 'dubai world cup', 'carnival', 'uae',
  'dubawi', 'night of thunder', 'too darn hot', 'new bay', 'blue point',
  'imperial emperor',
];

const lc = (s) => String(s || '').toLowerCase();
const strip = (s) => String(s || '')
  .replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, "'")
  .replace(/&#8216;|&lsquo;/g, "'").replace(/&#821[12];|&[lr]dquo;/g, '"')
  .replace(/\s+/g, ' ').trim();

// candidate horse names sharpen the match list
let nameTerms = [];
try {
  const c = JSON.parse(readFileSync(process.env.CANDIDATES || 'candidates.json', 'utf8'));
  nameTerms = (c.candidates || []).map((h) => lc(h.name).replace(/\s*\((gb|ire|fr|usa|ger)\)\s*$/i, ''));
} catch { /* no candidates yet */ }
const TERMS = [...new Set([...STATIC_TERMS, ...nameTerms])];

function matchTerms(text) {
  const t = lc(text);
  return TERMS.filter((k) => t.includes(k));
}

function parseRSS(xml, source) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = m[1];
    const title = strip(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
    const link = strip(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]);
    const date = strip(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]);
    if (title && link) items.push({ title, url: link, source, date });
  }
  return items;
}

let collected = [];
if (DEMO) {
  collected = [
    { title: 'Godolphin draft headlines Tattersalls Autumn Horses in Training catalogue', url: 'https://example.test/1', source: 'TDN', date: new Date().toUTCString() },
    { title: 'Unrelated golf story', url: 'https://example.test/2', source: 'TDN', date: new Date().toUTCString() },
  ];
} else {
  for (const s of SOURCES) {
    try {
      const res = await fetch(s.url, { headers: { 'user-agent': 'Mozilla/5.0 (vault-racing-intel)' } });
      if (!res.ok) { console.error(`${s.name}: ${res.status}`); continue; }
      const body = await res.text();
      if (s.type === 'rss') collected.push(...parseRSS(body, s.name));
      else for (const m of body.matchAll(s.linkRe)) {
        collected.push({ title: strip(m[2]), url: m[1], source: s.name, date: '' });
      }
      console.log(`${s.name}: ok (${collected.length} total)`);
    } catch (e) { console.error(`${s.name}: ${e.message}`); }
  }
}

const cutoff = Date.now() - MAX_AGE_D * 86400000;
const seen = new Set();
const items = collected
  .filter((it) => {
    if (it.date) {
      const t = Date.parse(it.date);
      if (Number.isFinite(t) && t < cutoff) return false;
    }
    if (seen.has(it.url)) return false;
    seen.add(it.url);
    it.matched = matchTerms(it.title);
    return it.matched.length > 0;
  })
  .slice(0, 40);

writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), items }, null, 2));
console.log(`${items.length} matched items (of ${collected.length} collected) → ${OUT}`);
