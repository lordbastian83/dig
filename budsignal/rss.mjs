/* BudSignal RSS wire — fetches public finance RSS feeds server-side (the
   browser cannot: feeds do not send CORS headers), normalizes them to a
   compact JSON the site reads from the budsignal-data branch. Runs on a
   GitHub Actions schedule every 30 minutes; costs no API key.

   Environment:
     RSS_FILE     output path (default wire-rss.json)
     SELF_TEST=1  offline: parse an embedded fixture, print, write nothing

   One dead feed must never kill the run (the Telegram-freeze lesson):
   every feed is fetched and parsed under its own try/catch. */

const RSS_FILE = process.env.RSS_FILE || 'wire-rss.json';
const SELF_TEST = process.env.SELF_TEST === '1';

// Curated, stable finance feeds mapped to this desk's markets. Feeds come
// and go — a feed that errors is logged and skipped, and the workflow's
// output shows per-feed counts so a silently dead feed is visible.
const FEEDS = [
  ['ForexLive', 'https://www.forexlive.com/feed/news'],
  ['FXStreet', 'https://www.fxstreet.com/rss/news'],
  ['CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/'],
  ['OilPrice', 'https://oilprice.com/rss/main'],
  ['MarketWatch', 'https://feeds.content.dowjones.io/public/rss/mw_topstories'],
  ['CNBC', 'https://www.cnbc.com/id/100003114/device/rss/rss.html'],
  ['Yahoo Finance', 'https://finance.yahoo.com/news/rssindex'],
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#039': "'" };
const decode = (s) => String(s)
  .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
  .replace(/&(#?\w+);/g, (m, e) => {
    if (ENTITIES[e] != null) return ENTITIES[e];
    if (e.startsWith('#x') || e.startsWith('#X')) return String.fromCodePoint(parseInt(e.slice(2), 16)) || m;
    if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10)) || m;
    return m;
  })
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Minimal RSS 2.0 / Atom item extractor. Regex is acceptable here because
// the shape is fixed (title/link/pubDate per item) and a malformed feed
// simply yields fewer items — it can never break the run.
export function parseFeed(xml, site) {
  const items = [];
  const blocks = xml.match(/<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/g) || [];
  for (const b of blocks.slice(0, 25)) {
    const title = decode((b.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '');
    if (!title) continue;
    let url = ((b.match(/<link[^>]*>([\s\S]*?)<\/link>/) || [])[1] || '').trim();
    if (!url) url = (b.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    url = decode(url);
    const when = (b.match(/<(?:pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/) || [])[1] || '';
    const t = Date.parse(when.trim());
    items.push({
      title: title.slice(0, 200),
      url: /^https?:\/\//.test(url) ? url.slice(0, 400) : null,
      site,
      t: Number.isFinite(t) ? t : Date.now(),
    });
  }
  return items;
}

async function fetchFeed(site, url) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; BudSignalRSS/1.0; +https://lordbastian83.github.io/dig/)',
      accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseFeed(await r.text(), site);
}

const FIXTURE = `<rss><channel>
<item><title>Gold surges to record as <![CDATA[Fed &amp; markets]]> weigh cuts</title><link>https://example.com/a</link><pubDate>Fri, 26 Sep 2026 10:00:00 GMT</pubDate></item>
<item><title>Crude falls 2.1% after OPEC signal</title><link>https://example.com/b</link><pubDate>Fri, 26 Sep 2026 09:30:00 GMT</pubDate></item>
<item><title>Gold surges to record as Fed &amp; markets weigh cuts</title><link>https://example.com/dupe</link><pubDate>Fri, 26 Sep 2026 08:00:00 GMT</pubDate></item>
</channel></rss>`;

async function main() {
  let all = [];
  const counts = [];
  if (SELF_TEST) {
    all = parseFeed(FIXTURE, 'Fixture');
    counts.push(`Fixture=${all.length}`);
  } else {
    for (const [site, url] of FEEDS) {
      try {
        const items = await fetchFeed(site, url);
        counts.push(`${site}=${items.length}`);
        all.push(...items);
      } catch (e) {
        counts.push(`${site}=ERR(${String(e.message).slice(0, 40)})`);
      }
    }
  }
  // dedupe on normalized title (same key the browser pipeline uses)
  const seen = new Set();
  const items = [];
  for (const it of all.sort((a, b) => b.t - a.t)) {
    const key = it.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(it);
    if (items.length >= 100) break;
  }
  const out = { updated: Date.now(), sources: FEEDS.length, items };
  console.log(`feeds: ${counts.join(' · ')}`);
  console.log(`kept ${items.length} of ${all.length} (deduped)`);
  if (SELF_TEST) {
    if (items.length !== 2 || !items[0].title.includes('Gold surges')) {
      console.error('SELF_TEST FAILED', JSON.stringify(items, null, 2));
      process.exit(1);
    }
    console.log('self-test OK');
    return;
  }
  if (!items.length) {
    console.error('every feed failed — keeping the previous wire file');
    process.exit(1); // workflow shows red; the old JSON stays on the branch
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(RSS_FILE, JSON.stringify(out));
  console.log(`wrote ${RSS_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
