// NFL player news from public feeds, trimmed to headline, short excerpt and link.
// Each item credits its source and links to the full story; nothing is republished in full.
//
//   GET /api/news                                        newest 300 stories league-wide
//   GET /api/news?name=Josh+Allen&team=BUF&pos=QB&espn=3918298
//                                                        stories about one player, newest first
//
// Response: { at, player?, sources: [{ source, count }], items: [{ id, source, via?, title, summary, url, at, kind, score }] }
// kind: status | move | role | recap | outlook | feature. score ranks fantasy impact (status changes high, lifestyle low).
// Cached at the edge for 10 minutes per URL. Any source that fails or changes shape just contributes nothing.

const UA = { "user-agent": "SourcesFantasy/1.0 (+https://sources-orpin.vercel.app)" };
const RSS = [
  ["RotoWire", ["https://www.rotowire.com/rss/news.php?sport=NFL"]],
  ["ESPN", ["https://www.espn.com/espn/rss/nfl/news"]],
  // These addresses aren't documented; try the likely ones and skip any that don't answer
  ["RotoBaller", ["https://www.rotoballer.com/player-news/feed?sport=nfl", "https://www.rotoballer.com/category/nfl/feed", "https://www.rotoballer.com/feed"]],
];
const SOURCES = ["RotoWire", "RotoBaller", "ESPN"];
const DAY = 864e5;

// ---- Parsing ---------------------------------------------------------------

const decode = (s) => String(s ?? "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
  .replace(/&ldquo;|&rdquo;/g, '"').replace(/&nbsp;/g, " ").replace(/&hellip;/g, "…").replace(/&mdash;|&ndash;/g, "-")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/\s+/g, " ").trim();
// Strip markup first, then entities, so an escaped tag inside CDATA can't survive as text
const text = (s) => decode(decode(s));
const tag = (xml, name) => { const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(xml); return m ? text(m[1]) : ""; };
export const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "") + "…" : s);
const hashId = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

function item(source, title, summary, url, at, via) {
  title = clip(text(title), 160);
  summary = text(summary);
  if (summary.toLowerCase().startsWith(title.toLowerCase())) summary = summary.slice(title.length).replace(/^[\s.:-]+/, "");
  if (!title || !/^https?:\/\//.test(url ?? "")) return null;
  return { id: hashId(url + title), source, ...(via ? { via } : {}), title, summary: clip(summary, 240), url, at: at || null };
}

export function parseFeed(xml, source) {
  return [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(([it]) =>
    item(source, tag(it, "title"), tag(it, "description"), tag(it, "link") || tag(it, "guid"), Date.parse(tag(it, "pubDate") || tag(it, "dc:date")) || null),
  ).filter(Boolean);
}

/** ESPN's JSON news (fantasy player feed and site news). RotoWire blurbs carried by ESPN are credited to RotoWire. */
export function parseEspn(json, espnId, rwId) {
  const list = Array.isArray(json?.feed) ? json.feed : Array.isArray(json?.articles) ? json.articles : [];
  const page = espnId ? `https://www.espn.com/nfl/player/_/id/${espnId}` : "";
  return list.map((a) => {
    if (!a || typeof a !== "object" || /media|video/i.test(String(a.type ?? ""))) return null;
    const roto = /rotowire/i.test(String(a.type ?? "") + String(a.source ?? "") + String(a.byline ?? ""));
    // ESPN's copies of RotoWire blurbs carry no RotoWire link; his RotoWire page lists the same blurb
    const rwPage = roto && rwId ? `https://www.rotowire.com/football/player.php?id=${rwId}` : "";
    const url = rwPage || a.links?.web?.href || a.links?.mobile?.href || a.link || page;
    const at = Date.parse(a.published || a.lastModified || "") || null;
    const it = item(roto ? "RotoWire" : "ESPN", a.headline || a.title || "", a.description || a.story || "", url, at, roto ? "ESPN" : undefined);
    if (it && (url === page || url === rwPage)) it.page = true;
    // ESPN tags the player either in categories (site news) or as a top-level playerId (fantasy news)
    if (it && espnId) it.athlete = String(a.playerId ?? "") === String(espnId)
      || (Array.isArray(a.categories) && a.categories.some((c) => String(c?.athleteId ?? c?.athlete?.id ?? "") === String(espnId)));
    return it;
  }).filter(Boolean);
}

// ---- Matching --------------------------------------------------------------

export const norm = (s) => ` ${String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[.']/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;
const SUFFIX = /\s(jr|sr|ii|iii|iv|v)\s/g;
const NICK = {
  michael: ["mike"], mike: ["michael"], christopher: ["chris"], chris: ["christopher"], kenneth: ["ken"], ken: ["kenneth"],
  joshua: ["josh"], josh: ["joshua"], gabriel: ["gabe"], gabe: ["gabriel"], cameron: ["cam"], cam: ["cameron"],
  robert: ["rob", "bobby"], william: ["will"], will: ["william"], matthew: ["matt"], matt: ["matthew"], nicholas: ["nick"], nick: ["nicholas"],
  daniel: ["danny", "dan"], jonathan: ["jon"], jon: ["jonathan"], benjamin: ["ben"], zachary: ["zach"], zach: ["zachary"],
  alexander: ["alex"], anthony: ["tony"], joseph: ["joe"], joe: ["joseph"], samuel: ["sam"], tyler: ["ty"],
};
// Players widely called something else in headlines
const ALIAS = { "marquise brown": ["hollywood brown"], "kenneth walker": ["ken walker", "k9"], "dj moore": ["d j moore"], "cj stroud": ["c j stroud"], "aj brown": ["a j brown"], "dk metcalf": ["d k metcalf"], "tj hockenson": ["t j hockenson"] };
const TEAM = {
  ARI: "cardinals", ATL: "falcons", BAL: "ravens", BUF: "bills", CAR: "panthers", CHI: "bears", CIN: "bengals", CLE: "browns", DAL: "cowboys", DEN: "broncos",
  DET: "lions", GB: "packers", HOU: "texans", IND: "colts", JAX: "jaguars", KC: "chiefs", LAC: "chargers", LAR: "rams", LV: "raiders", MIA: "dolphins",
  MIN: "vikings", NE: "patriots", NO: "saints", NYG: "giants", NYJ: "jets", PHI: "eagles", PIT: "steelers", SEA: "seahawks", SF: "49ers", TB: "buccaneers",
  TEN: "titans", WAS: "commanders",
};
// Surnames too common to trust next to a team name alone
const COMMON = new Set("smith johnson williams brown jones davis miller wilson moore taylor thomas jackson white harris martin thompson robinson lewis walker young hall allen king wright scott green adams baker hill nelson carter mitchell".split(" "));

/** Name forms we accept: full name, without suffix, nickname first names, known aliases. */
export function nameForms(name) {
  const full = norm(name), bare = full.replace(SUFFIX, " ").replace(/\s+/g, " ");
  const parts = bare.trim().split(" "), first = parts[0], last = parts.slice(1).join(" ");
  const forms = new Set([full, bare]);
  (NICK[first] ?? []).forEach((n) => forms.add(` ${n} ${last} `));
  (ALIAS[bare.trim()] ?? []).forEach((a) => forms.add(` ${a} `));
  return { forms: [...forms], first, last };
}

/** Does this story belong to this player? Source-provided athlete ids win; otherwise the full name (or a known form),
 *  or "Bills' Allen"-style team-plus-surname for uncommon surnames. A bare surname never counts. */
export function matches(it, who) {
  if (it.athlete === true) return true;
  const hay = norm(`${it.title} ${it.summary}`);
  if (who.forms.some((f) => hay.includes(f))) return true;
  const team = TEAM[who.team];
  if (!team || !who.last || COMMON.has(who.last) || who.last.length < 4) return false;
  return new RegExp(` ${team}( s)? ${who.last} `).test(norm(it.title));
}

// ---- Ranking ---------------------------------------------------------------

const KINDS = [
  ["status", 100, /\b(injur\w*|ruled out|out for|(will|won't|wont) play|questionable|doubtful|limited (in )?practice|did not practice|dnp|full(y)? practic\w*|inactive|activated|designated (him )?(for|to) return|injured reserve|placed on ir|on ir|pup|concussion|hamstring|ankle|knee|groin|shoulder|quad\w*|calf|foot|achilles|acl|mcl|ribs?|wrist|hand|toe|back (injury|tightness|spasms)|illness|surgery|sprain\w*|strain\w*|torn|tear|fracture\w*|return(s|ed)? to practice|game-time decision|cleared|protocol|sidelined|day-to-day|week-to-week)\b/],
  ["move", 90, /\b(trade[ds]?|dealt|sign(s|ed)|re-sign\w*|release[ds]?|waive[ds]?|claimed|acquire[ds]?|cut|suspend\w*|reinstat\w*|elevated|promoted to (the )?active)\b/],
  ["role", 80, /\b(depth chart|starting (job|role)|named (the )?starter|takes over|benched|bench(ed|ing)|demot\w*|lead back|backfield|committee|bell ?cow|workhorse|first-team|snap(s| share| count)|workload|usage|target share|route (share|participation)|red-zone (role|work)|(expanded|bigger|increased|reduced|larger) role|role)\b/],
  ["recap", 70, /\b(\d+ (yards|yds|receptions|catches|carries|rushes|targets|touchdowns?|tds?|completions|interceptions)|\d+ of \d+|\d+-of-\d+|\d+-for-\d+|\d+ for \d+ yards)\b/],
  ["outlook", 45, /\b(start|sit|sleeper|projection|projected|matchup|outlook|expected to (play|start|suit up)|on track|rankings?|week \d+)\b/],
];
const FLUFF = /\b(himothy|wife|girlfriend|fiancee?|baby|daughter|son|charity|viral|reacts?|commercial|podcast|praises?|jokes?|birthday|wedding|fashion|outfit|documentary|tribute|honou?red|betting|odds|props?|parlay|fans?|celebrat\w*|mvp ladder|power rankings|mic'd up|hype|trash talk)\b/;

// A headline about his role ("named lead back with X sidelined") is a role story even if it mentions someone else's injury
const ROLE_HEAD = /\b(named (the )?(starter|lead back|starting \w+)|takes over|lead back|starting job|depth chart|promoted|benched|demoted|lose[s]? (the )?starting)\b/;

export function classify(it) {
  const t = norm(`${it.title} ${it.summary}`).trim();
  const head = norm(it.title).trim();
  if (ROLE_HEAD.test(head)) return { kind: "role", base: 88 };
  for (const [kind, base, re] of KINDS) {
    // An injury word in the headline beats a stat line; elsewhere the first match in priority order wins
    if (re.test(head) || re.test(t)) return { kind, base: re.test(head) ? base : base - 8 };
  }
  return { kind: "feature", base: FLUFF.test(t) ? 5 : 25 };
}

export function rank(items, now = Date.now()) {
  return items.map((it) => {
    const { kind, base } = classify(it);
    const ageH = it.at ? Math.max(0, (now - it.at) / 36e5) : 72;
    return { ...it, kind, score: Math.round(base - Math.min(50, ageH * 0.4)) };
  });
}

// ---- Fetching --------------------------------------------------------------

// Last error per host, reported with ?debug=1 so a silent source failure is visible on the live site
export const lastErr = {};
async function get(url, as = "text") {
  const host = new URL(url).host;
  let r;
  try { r = await fetch(url, { headers: { ...UA, accept: as === "json" ? "application/json" : "application/rss+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(6000) }); }
  catch (e) { lastErr[host] = String(e?.name || e).slice(0, 80); throw e; }
  if (!r.ok) { lastErr[host] = `HTTP ${r.status}`; throw new Error(String(r.status)); }
  return as === "json" ? r.json() : r.text();
}

async function loadRss(source, urls) {
  const all = [];
  for (const url of urls) {
    try {
      const items = parseFeed(await get(url), source);
      // RotoBaller: the player-news feed is the one that matters; stop once one answers
      if (items.length) { all.push(...items); if (source !== "RotoBaller" || all.length >= 40) break; }
    } catch { /* next */ }
  }
  return all;
}

// League-wide feeds are shared by every player request on a warm instance for 10 minutes
let rssMemo = null;
function leagueFeeds() {
  if (rssMemo && Date.now() - rssMemo.at < 6e5) return rssMemo.p;
  const p = Promise.all(RSS.map(([s, urls]) => loadRss(s, urls).catch(() => [])));
  rssMemo = { at: Date.now(), p };
  return p;
}

const ESPN_TEAM = { WAS: "WSH" };
/** Find a player's ESPN id from ESPN's public team roster when Sleeper didn't give us one. */
async function espnIdFor(name, team, getJson = (u) => get(u, "json")) {
  if (!team || team === "FA") return null;
  try {
    const d = await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${ESPN_TEAM[team] ?? team}/roster`);
    const want = norm(name).replace(SUFFIX, " ").replace(/\s+/g, " ");
    for (const g of d?.athletes ?? []) for (const a of g?.items ?? []) {
      if (norm(a?.fullName ?? a?.displayName).replace(SUFFIX, " ").replace(/\s+/g, " ") === want) return String(a.id);
    }
  } catch { /* none */ }
  return null;
}

async function espnFor(id, getJson = (u) => get(u, "json"), rwId) {
  if (!id || !/^\d+$/.test(id)) return [[], []];
  const fantasy = getJson(`https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?playerId=${id}&limit=50`).then((j) => parseEspn(j, id, rwId)).catch(() => []);
  const site = getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?athletes=${id}&limit=25`).then((j) => parseEspn(j, id, rwId)).catch(() => []);
  return Promise.all([fantasy, site]);
}

/** RotoBaller is WordPress: its search feed reaches back further than the main feed for one player. */
const rotoballerFor = (name) => loadRss("RotoBaller", [`https://www.rotoballer.com/?s=${encodeURIComponent(name)}&feed=rss2`]).catch(() => []);

export const dedupe = (items) => {
  const seen = new Set();
  return items.filter((i) => {
    // "Bills' Josh Allen: Throws two TDs" and "Josh Allen: Throws two TDs" are the same blurb
    const k = Object.values(TEAM).reduce((t, n) => t.replace(` ${n} s `, " ").replace(` ${n} `, " "), norm(i.title)).trim();
    // Blurbs without their own link all point at the player's ESPN page, so only real story links dedupe by URL
    if (seen.has(k) || (!i.page && seen.has(i.url))) return false;
    seen.add(k); if (!i.page) seen.add(i.url); return true;
  });
};

export async function playerNews({ name, team, espn }, now = Date.now()) {
  const who = { ...nameForms(name), team: String(team ?? "").toUpperCase() };
  const id = espn && /^\d+$/.test(espn) ? espn : await espnIdFor(name, who.team);
  const [feeds, [fantasy, site], roto] = await Promise.all([leagueFeeds(), espnFor(id), rotoballerFor(name)]);
  const counts = {};
  const tally = (list) => list.forEach((i) => (counts[i.source] = (counts[i.source] ?? 0) + 1));
  // ESPN's player feeds are already about him, but still check the name so a team story tagged to him reads right
  const espnHits = [...fantasy, ...site].filter((i) => i.athlete !== false || matches({ ...i, athlete: undefined }, who));
  const rssHits = [...feeds.flat(), ...roto].filter((i) => matches(i, who));
  // Direct feeds first, so a story that is also on ESPN links to the original
  const all = dedupe([...rssHits, ...espnHits]).filter((i) => !i.at || now - i.at < 30 * DAY).map(({ athlete, page, ...i }) => i);
  tally(all);
  const items = rank(all, now).sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 25);
  return { espn: id, items, sources: SOURCES.map((s) => ({ source: s, count: counts[s] ?? 0 })) };
}

/**
 * ESPN for one player, run in the browser. ESPN refuses requests from our server (403) but serves its public JSON
 * to browsers with CORS, so the app calls this directly and merges it with the server's answer.
 */
export async function espnPlayerNews({ name, team, espn, rotowire }, now = Date.now()) {
  const who = { ...nameForms(name), team: String(team ?? "").toUpperCase() };
  const getJson = (u) => fetch(u, { signal: AbortSignal.timeout(6000) }).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  const id = espn && /^\d+$/.test(espn) ? espn : await espnIdFor(name, who.team, getJson);
  const [fantasy, site] = await espnFor(id, getJson, rotowire);
  return [...fantasy, ...site].filter((i) => i.athlete !== false || matches({ ...i, athlete: undefined }, who))
    .filter((i) => !i.at || now - i.at < 30 * DAY);
}

/** Merge story lists, drop repeats, rank and sort newest first. */
export function mergeNews(lists, now = Date.now()) {
  const all = dedupe(lists.flat()).map(({ athlete, page, ...i }) => i);
  return rank(all, now).sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 25);
}

export async function leagueNews(now = Date.now()) {
  const lists = await leagueFeeds();
  const items = rank(dedupe(lists.flat()), now).sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 300);
  return { items, sources: RSS.map(([s], i) => ({ source: s, count: lists[i].length })) };
}

export default async function handler(req, res) {
  const q = req.query ?? Object.fromEntries(new URL(req.url, "http://x").searchParams);
  const name = String(q.name ?? "").slice(0, 80).trim();
  try {
    const out = name ? { player: name, ...(await playerNews({ name, team: q.team, espn: String(q.espn ?? "") })) } : await leagueNews();
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json({ at: Date.now(), ...out, ...(q.debug ? { errors: lastErr } : {}) });
  } catch {
    res.setHeader("Cache-Control", "public, s-maxage=60");
    res.status(200).json({ at: Date.now(), items: [], sources: [] });
  }
}
