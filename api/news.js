// NFL player news from public RSS feeds, merged and trimmed to headline, short summary and link.
// Each item credits its source and links to the full story; nothing is republished in full.
// Response: { at, items: [{ source, title, summary, url, at }] }. Cached at the edge for 10 minutes.
const FEEDS = [
  ["RotoWire", ["https://www.rotowire.com/rss/news.php?sport=NFL"]],
  ["ESPN", ["https://www.espn.com/espn/rss/nfl/news"]],
  // FantasyPros' feed address isn't documented; try the likely ones and skip if none answer
  ["FantasyPros", ["https://www.fantasypros.com/nfl/rss/player-news.php", "https://www.fantasypros.com/rss/nfl-news.xml"]],
];

const decode = (s) => String(s ?? "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, " ").trim();
const tag = (xml, name) => { const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(xml); return m ? decode(m[1]) : ""; };
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);

export function parseFeed(xml, source) {
  return [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(([item]) => {
    const title = tag(item, "title"), url = tag(item, "link") || tag(item, "guid");
    const when = Date.parse(tag(item, "pubDate") || tag(item, "dc:date")) || null;
    return title && url ? { source, title: clip(title, 160), summary: clip(tag(item, "description"), 240), url, at: when } : null;
  }).filter(Boolean);
}

async function load(source, urls) {
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "SourcesFantasy/1.0 (+https://sources-orpin.vercel.app)" }, signal: AbortSignal.timeout(5000) });
      if (!r.ok) continue;
      const items = parseFeed(await r.text(), source);
      if (items.length) return items;
    } catch { /* next */ }
  }
  return [];
}

export default async function handler(req, res) {
  const lists = await Promise.all(FEEDS.map(([s, urls]) => load(s, urls)));
  const seen = new Set();
  const items = lists.flat().filter((i) => { const k = i.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 300);
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
  res.status(200).json({ at: Date.now(), sources: FEEDS.map(([s], i) => ({ source: s, count: lists[i].length })), items });
}
