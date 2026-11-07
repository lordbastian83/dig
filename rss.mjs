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
const RSS_PREV = process.env.RSS_PREV || '';
const SELF_TEST = process.env.SELF_TEST === '1';

// Article pages fetched per run to resolve og:image for feeds whose RSS
// carries no picture (CNBC, OilPrice, ForexLive). The previous publish
// seeds a url→img cache, so each story's page is fetched at most once.
const OG_BUDGET = 10;

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
    // story image: media RSS extensions first, then enclosure, then the
    // first <img> in the description — hot-linked by the site, hidden on error
    let img = (b.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+)"/) || [])[1]
      || (b.match(/<enclosure[^>]*type="image[^"]*"[^>]*url="([^"]+)"/) || [])[1]
      || (b.match(/<enclosure[^>]*url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i) || [])[1]
      || (b.match(/<img[^>]*src=["']([^"']+)["']/i) || [])[1] || null;
    if (img) img = decode(img);
    if (img && !/^https:\/\//.test(img)) img = null;
    items.push({
      title: title.slice(0, 200),
      url: /^https?:\/\//.test(url) ? url.slice(0, 400) : null,
      site,
      t: Number.isFinite(t) ? t : Date.now(),
      img: img ? img.slice(0, 400) : null,
    });
  }
  return items;
}

// og:image / twitter:image out of an article's <head>, either attribute order
export function ogImage(html) {
  const h = String(html).slice(0, 120000);
  const m = h.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/i)
    || h.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image(?::src)?)["']/i);
  if (!m) return null;
  const img = m[1].replace(/&amp;/g, '&').trim();
  return /^https:\/\//.test(img) ? img.slice(0, 400) : null;
}

async function fetchOgImage(url) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; BudSignalRSS/1.0; +https://lordbastian83.github.io/dig/)',
      accept: 'text/html,*/*',
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return ogImage(await r.text());
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
<item><title>Crude falls 2.1% after OPEC signal</title><link>https://example.com/b</link><pubDate>Fri, 26 Sep 2026 09:30:00 GMT</pubDate><media:content url="https://example.com/pic.jpg" /></item>
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
  console.log(`feeds: ${counts.join(' · ')}`);
  console.log(`kept ${items.length} of ${all.length} (deduped)`);
  if (SELF_TEST) {
    if (items.length !== 2 || !items[0].title.includes('Gold surges') || items[1].img !== 'https://example.com/pic.jpg') {
      console.error('SELF_TEST FAILED', JSON.stringify(items, null, 2));
      process.exit(1);
    }
    const og = ogImage('<html><head><meta property="og:image" content="https://example.com/og.jpg?w=1200&amp;h=630"/></head>');
    const ogRev = ogImage('<meta content="https://example.com/tw.png" name="twitter:image">');
    if (og !== 'https://example.com/og.jpg?w=1200&h=630' || ogRev !== 'https://example.com/tw.png' || ogImage('<p>no meta</p>') !== null) {
      console.error('SELF_TEST FAILED (ogImage)', { og, ogRev });
      process.exit(1);
    }
    console.log('self-test OK');
    return;
  }
  // fill missing images: previous publish first (free), then up to
  // OG_BUDGET article-page fetches for stories the cache has never seen.
  // Every step is best-effort — an image is decoration, never worth a red run.
  const { readFileSync, writeFileSync } = await import('node:fs');
  // cache entries: img url, or noimg:1 = page was fetched and had none
  // (never refetch); an item missed only by the budget carries neither
  // marker and is retried next run.
  const prevImg = new Map();
  if (RSS_PREV) {
    try {
      for (const it of JSON.parse(readFileSync(RSS_PREV, 'utf8')).items || []) {
        if (it.url && (it.img || it.noimg)) prevImg.set(it.url, it.img || null);
      }
    } catch (e) { /* first run or unreadable — cache stays empty */ }
  }
  let ogFetched = 0, ogHits = 0, cacheHits = 0;
  for (const it of items) {
    if (it.img || !it.url) continue;
    if (prevImg.has(it.url)) {
      const cached = prevImg.get(it.url);
      if (cached) { it.img = cached; } else { it.noimg = 1; }
      cacheHits++;
      continue;
    }
    if (ogFetched >= OG_BUDGET) continue;
    ogFetched++;
    try {
      it.img = await fetchOgImage(it.url);
      if (it.img) ogHits++; else it.noimg = 1;
    } catch (e) { it.img = null; /* transient failure: no marker, retry next run */ }
  }
  console.log(`images: ${items.filter((i) => i.img).length}/${items.length} (${cacheHits} from cache, ${ogHits}/${ogFetched} og fetches)`);
  const out = { updated: Date.now(), sources: FEEDS.length, items };
  if (!items.length) {
    console.error('every feed failed — keeping the previous wire file');
    process.exit(1); // workflow shows red; the old JSON stays on the branch
  }
  writeFileSync(RSS_FILE, JSON.stringify(out));
  console.log(`wrote ${RSS_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
