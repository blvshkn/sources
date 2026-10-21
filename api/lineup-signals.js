// What the lineup check reads besides projections, one source per call so the app's trace waits on each for real.
//   POST /api/lineup-signals  body { part, season, week, players: [{ id, name, pos, nfl, status?, note? }], games: [{ team, opp?, home?, at? }] }
//   part: news | injuries | odds | weather | rankings
//   200 { part, status: "ok" | "off" | "error", ...data }   400 bad input · 403 not this site, or a bot · 405 not POST
//   413 too big · 429 slow down · 503 the bot check couldn't run
// The deployed handler runs the same-origin and BotID check from api/_lib/guard.js first, since odds spend credits.
//
// news      Our news feed (api/news.js), matched to these players: status, move and role stories from the last week,
//           with practice reports (DNP, Limited, Full) and inactive or ruled-out calls read from the story text.
// injuries  Sleeper's injury status (sent by the app from its own Sleeper load) plus Sleeper's practice participation
//           and injury notes from its public player list.
// odds      Game totals and spreads from The Odds API. Needs ODDS_API_KEY; without it the part is "off".
// weather   Open-Meteo at the stadium for each outdoor or retractable-roof game, at the kickoff hour. Domes and
//           neutral sites are skipped. Needs a kickoff time; a game without one is skipped, never guessed.
// rankings  A licensed weekly rankings feed, only when RANKINGS_FEED_URL is set (see readRankings for the shape).
//           Nothing is scraped. Without it the part is "off" and the app shows nothing about it.
//
// Every upstream is cached in memory for a few minutes per warm instance and fails on its own: one source down never
// takes the others with it. Nothing here makes up a number.
import { leagueNews, matches, nameForms, clip } from "./news.js";
import { weekGames } from "./kickoffs.js";
import { STADIUMS } from "./_lib/stadiums.js";
import { ipOf, rateLimiter } from "./ask.js";
import { createGuard } from "./_lib/guard.js";

export const PARTS = ["news", "injuries", "odds", "weather", "rankings"];
const MAX_BODY = 24_000;
const MAX_PLAYERS = 40;
const DAY = 864e5;
const MIN = 6e4;
const signalsLimit = rateLimiter({ perMin: 40, perHour: 400 });

// ---- Cache -------------------------------------------------------------------

const memo = new Map();
/** One promise per key for `ttl` ms. A failure is forgotten at once so the next call tries again. */
export function cached(key, ttl, load, now = Date.now()) {
  const hit = memo.get(key);
  if (hit && now - hit.at < ttl) return hit.p;
  const p = Promise.resolve().then(load);
  memo.set(key, { at: now, p });
  p.catch(() => { if (memo.get(key)?.p === p) memo.delete(key); });
  if (memo.size > 500) for (const [k, v] of memo) if (now - v.at > 30 * MIN) memo.delete(k);
  return p;
}
export const clearCache = () => memo.clear();

async function getJson(url, init = {}, ms = 6000) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const norm = (s) => ` ${String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;
const bare = (s) => norm(s).replace(/ (jr|sr|ii|iii|iv|v) /g, " ").replace(/\s+/g, " ");

// ---- News --------------------------------------------------------------------

/** Practice and game-status calls a story makes, read from its own words. Null when it makes none. */
export function readStory(it) {
  const t = norm(`${it.title} ${it.summary}`);
  const practice = /\b(did not practice|didn t practice|dnp|sat out practice|missed practice|not practicing)\b/.test(t) ? "DNP"
    : /\b(limited (in )?practice|was limited|limited participant|practiced on a limited basis)\b/.test(t) ? "Limited"
      : /\b(full(y)? practic\w*|full participant|practiced in full|full go)\b/.test(t) ? "Full" : null;
  const inactive = /\b(inactive|ruled out|won t play|will not play|out for (sunday|monday|thursday|saturday|week))\b/.test(t);
  return { ...(practice ? { practice } : {}), ...(inactive ? { inactive: true } : {}) };
}

export async function newsPart(players, now = Date.now()) {
  const { items } = await cached("news", 10 * MIN, () => leagueNews(now), now);
  if (!items?.length) return { status: "error", scanned: 0, items: [] };
  const out = [];
  for (const p of players) {
    const who = { ...nameForms(p.name), team: String(p.nfl ?? "").toUpperCase() };
    const hits = items.filter((i) => (!i.at || now - i.at < 7 * DAY) && ["status", "move", "role"].includes(i.kind) && matches(i, who)).slice(0, 3);
    for (const h of hits) out.push({ playerId: p.id, title: h.title, ...(h.summary ? { summary: clip(h.summary, 180) } : {}), source: h.source, at: h.at, kind: h.kind, ...readStory(h) });
  }
  return { status: "ok", scanned: items.length, items: out.slice(0, 30) };
}

// ---- Injuries ----------------------------------------------------------------

/** Sleeper's public player list, slimmed to injury and practice fields. Sleeper asks for this list to be fetched
 *  sparingly, so it's held for an hour; practice reports only change once a day. */
const sleeperInjuries = () => cached("sleeper-players", 60 * MIN, async () => {
  const all = await getJson("https://api.sleeper.app/v1/players/nfl", {}, 9000);
  const byId = new Map(), byName = new Map();
  for (const [id, p] of Object.entries(all ?? {})) {
    if (!p || !["QB", "RB", "WR", "TE", "K"].includes(p.position)) continue;
    const row = {
      status: p.injury_status || null, body: p.injury_body_part || null, notes: p.injury_notes || null,
      practice: p.practice_participation || null, practiceNote: p.practice_description || null,
    };
    if (!row.status && !row.practice && !row.notes) continue;
    byId.set(String(id), row);
    const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`;
    byName.set(`${bare(name)}|${p.team ?? ""}`, row);
  }
  return { byId, byName };
});

export async function injuriesPart(players) {
  let sl = null;
  try { sl = await sleeperInjuries(); } catch { /* the app's own statuses still count */ }
  const items = [];
  for (const p of players) {
    const s = sl ? (sl.byId.get(String(p.id)) ?? sl.byName.get(`${bare(p.name)}|${String(p.nfl ?? "").toUpperCase()}`)) : null;
    const status = p.status || s?.status || null;
    const row = {
      playerId: p.id,
      ...(status ? { status } : {}),
      ...(s?.body ? { body: s.body } : {}),
      ...(s?.practice ? { practice: s.practice } : {}),
      ...(s?.practiceNote ? { practiceNote: clip(String(s.practiceNote), 120) } : {}),
      ...(s?.notes ? { notes: clip(String(s.notes), 140) } : {}),
    };
    if (Object.keys(row).length > 1) items.push(row);
  }
  return { status: "ok", practice: !!sl, items };
}

// ---- Vegas -------------------------------------------------------------------

const ODDS_TEAM = {
  "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL", "Buffalo Bills": "BUF", "Carolina Panthers": "CAR",
  "Chicago Bears": "CHI", "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL", "Denver Broncos": "DEN",
  "Detroit Lions": "DET", "Green Bay Packers": "GB", "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC", "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN", "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG", "New York Jets": "NYJ",
  "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT", "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
};
const median = (xs) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const half = (n) => Math.round(n * 2) / 2;

/** The Odds API's events as one line per game: the median total and home spread across books. */
export function parseOdds(events, now = Date.now()) {
  const games = [];
  for (const e of Array.isArray(events) ? events : []) {
    const home = ODDS_TEAM[e?.home_team], away = ODDS_TEAM[e?.away_team];
    const at = Date.parse(e?.commence_time ?? "");
    // This week's slate: games from a few hours ago (still being played) to a week out
    if (!home || !away || !Number.isFinite(at) || at < now - 5 * 36e5 || at > now + 8 * DAY) continue;
    const totals = [], spreads = [];
    for (const b of e.bookmakers ?? []) for (const m of b.markets ?? []) {
      if (m.key === "totals") { const o = (m.outcomes ?? []).find((x) => x.name === "Over"); if (Number.isFinite(o?.point)) totals.push(o.point); }
      if (m.key === "spreads") { const o = (m.outcomes ?? []).find((x) => x.name === e.home_team); if (Number.isFinite(o?.point)) spreads.push(o.point); }
    }
    const total = median(totals), hs = median(spreads);
    if (total === null && hs === null) continue;
    const g = { home, away, at: new Date(at).toISOString(), books: Math.max(totals.length, spreads.length) };
    if (total !== null) g.total = half(total);
    if (hs !== null) g.spread = { [home]: half(hs), [away]: half(-hs) };
    // Implied team points: half the total, moved by half the spread toward the favorite
    if (total !== null && hs !== null) g.implied = { [home]: Math.round(((total - hs) / 2) * 10) / 10, [away]: Math.round(((total + hs) / 2) * 10) / 10 };
    games.push(g);
  }
  const ranked = games.filter((g) => g.total !== undefined).sort((a, b) => b.total - a.total);
  for (const g of games) if (g.total !== undefined) { g.totalRank = ranked.indexOf(g) + 1; g.slateGames = ranked.length; }
  return games;
}

export async function oddsPart(players, env, now = Date.now()) {
  const key = env.ODDS_API_KEY;
  if (!key) return { status: "off" };
  try {
    const events = await cached("odds", 15 * MIN, () => getJson(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?regions=us&markets=spreads,totals&oddsFormat=american&dateFormat=iso&apiKey=${encodeURIComponent(key)}`), now);
    const teams = new Set(players.map((p) => String(p.nfl ?? "").toUpperCase()));
    const games = parseOdds(events, now).filter((g) => teams.has(g.home) || teams.has(g.away));
    return { status: "ok", games };
  } catch {
    return { status: "error", games: [] };
  }
}

// ---- Weather -----------------------------------------------------------------

/** One game per home team from what the app knows, corrected by ESPN's schedule (home side, kickoff, neutral site). */
export function gamesFor(clientGames, espnGames, teams) {
  const out = new Map();
  for (const t of teams) {
    const e = espnGames.find((g) => g.home === t || g.away === t);
    if (e) { out.set(`${e.home}-${e.away}`, e); continue; }
    const c = clientGames.find((g) => g.team === t);
    if (!c || typeof c.home !== "boolean" || !c.opp) continue;
    const home = c.home ? t : c.opp, away = c.home ? c.opp : t;
    out.set(`${home}-${away}`, { home, away, at: c.at ?? null, neutral: false });
  }
  return [...out.values()];
}

/** Kickoff-hour conditions from an Open-Meteo hourly forecast, plus the worst wind and rain over the next three hours. */
export function atKickoff(f, iso) {
  const h = f?.hourly;
  if (!h || !Array.isArray(h.time)) return null;
  const want = iso.slice(0, 13); // "2026-10-25T17"
  const i = h.time.findIndex((t) => String(t).slice(0, 13) === want);
  if (i < 0) return null;
  const at = (k) => (Array.isArray(h[k]) && Number.isFinite(h[k][i]) ? h[k][i] : null);
  const win = (k) => { const xs = (h[k] ?? []).slice(i, i + 4).filter(Number.isFinite); return xs.length ? Math.max(...xs) : null; };
  const r1 = (n) => (n === null ? null : Math.round(n * 10) / 10);
  return {
    tempF: r1(at("temperature_2m")), windMph: r1(at("wind_speed_10m")), gustMph: r1(at("wind_gusts_10m")),
    precipIn: r1(at("precipitation")), precipChance: at("precipitation_probability"),
    maxWindMph: r1(win("wind_speed_10m")), maxPrecipChance: win("precipitation_probability"),
  };
}

export async function weatherPart(players, clientGames, season, week, now = Date.now()) {
  const teams = [...new Set(players.map((p) => String(p.nfl ?? "").toUpperCase()).filter(Boolean))];
  const espn = await cached(`games-${season}-${week}`, 10 * MIN, () => weekGames(season, week), now).catch(() => []);
  const games = gamesFor(Array.isArray(clientGames) ? clientGames : [], espn, teams);
  let domes = 0, skipped = 0, failed = 0;
  const out = [];
  await Promise.all(games.map(async (g) => {
    const st = STADIUMS[g.home];
    if (g.neutral || !st) { skipped++; return; }
    if (st.roof === "dome" || (g.indoor === true && st.roof !== "retractable")) { domes++; return; }
    if (!g.at || Number.isNaN(Date.parse(g.at))) { skipped++; return; }
    const iso = new Date(g.at).toISOString();
    if (Date.parse(iso) < now - 4 * 36e5 || Date.parse(iso) > now + 15 * DAY) { skipped++; return; }
    const day = iso.slice(0, 10);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${st.lat}&longitude=${st.lon}&hourly=temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m`
      + `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=GMT&start_date=${day}&end_date=${day}`;
    try {
      const f = await cached(`wx-${g.home}-${day}`, 10 * MIN, () => getJson(url), now);
      const w = atKickoff(f, iso);
      if (!w) { failed++; return; }
      out.push({ home: g.home, away: g.away, at: iso, venue: st.name, city: st.city, roof: st.roof, ...w });
    } catch { failed++; }
  }));
  const status = failed && !out.length ? "error" : "ok";
  return { status, games: out.sort((a, b) => a.home.localeCompare(b.home)), domes, skipped, failed };
}

// ---- Expert rankings (licensed feed only) ------------------------------------

/**
 * Reads a licensed weekly rankings feed. Off unless RANKINGS_FEED_URL is set. RANKINGS_FEED_KEY, when set, goes as
 * "Authorization: Bearer <key>". A "{week}" in the URL is filled in; otherwise ?week= is added.
 * Expected JSON, either an object or a bare array of rows:
 *   { "source": "Provider name", "week": 7, "updated": "2026-10-21T15:00:00Z",
 *     "rankings": [ { "player_id": "4984", "name": "Josh Allen", "team": "BUF", "pos": "QB", "rank": 2, "week": 7, "tier": 1 } ] }
 * Each row needs pos and rank, plus player_id (Sleeper's id) or name. rank is the positional rank for that week.
 */
export function readRankings(json, players, week) {
  const rows = Array.isArray(json) ? json : Array.isArray(json?.rankings) ? json.rankings : [];
  const fw = Number(json?.week);
  const items = [];
  for (const p of players) {
    const r = rows.find((x) => x && Number.isFinite(Number(x.rank)) && x.pos === p.pos
      && (x.week === undefined || Number(x.week) === Number(week)) && (Number.isNaN(fw) || fw === Number(week))
      && ((x.player_id != null && String(x.player_id) === String(p.id)) || (x.name && bare(x.name) === bare(p.name))));
    if (r) items.push({ playerId: p.id, pos: r.pos, rank: Number(r.rank), ...(Number.isFinite(Number(r.tier)) ? { tier: Number(r.tier) } : {}) });
  }
  return { source: typeof json?.source === "string" ? json.source.slice(0, 60) : undefined, items };
}

export async function rankingsPart(players, week, env, now = Date.now()) {
  const url = env.RANKINGS_FEED_URL;
  if (!url) return { status: "off" };
  try {
    const u = url.includes("{week}") ? url.replace("{week}", String(week)) : `${url}${url.includes("?") ? "&" : "?"}week=${week}`;
    const headers = env.RANKINGS_FEED_KEY ? { authorization: `Bearer ${env.RANKINGS_FEED_KEY}` } : {};
    const json = await cached(`rank-${week}`, 15 * MIN, () => getJson(u, { headers }), now);
    return { status: "ok", ...readRankings(json, players, week) };
  } catch {
    return { status: "error", items: [] };
  }
}

// ---- Handler -----------------------------------------------------------------

export function readSignalsBody(req) {
  let b = req.body;
  if (Number(req.headers?.["content-length"] ?? 0) > MAX_BODY) return { status: 413, error: "body too large" };
  if (typeof b === "string" || b instanceof Uint8Array) {
    const s = typeof b === "string" ? b : new TextDecoder().decode(b);
    if (s.length > MAX_BODY) return { status: 413, error: "body too large" };
    try { b = JSON.parse(s); } catch { return { status: 400, error: "body must be JSON" }; }
  } else if (b && typeof b === "object" && JSON.stringify(b).length > MAX_BODY) return { status: 413, error: "body too large" };
  if (!b || typeof b !== "object" || Array.isArray(b)) return { status: 400, error: "body must be a JSON object" };
  if (!PARTS.includes(b.part)) return { status: 400, error: `part must be one of ${PARTS.join(", ")}` };
  const raw = Array.isArray(b.players) ? b.players : [];
  if (raw.length > MAX_PLAYERS) return { status: 413, error: `over ${MAX_PLAYERS} players` };
  const players = raw.filter((p) => p && p.id != null && typeof p.name === "string").map((p) => ({
    id: String(p.id).slice(0, 40), name: p.name.slice(0, 60), pos: String(p.pos ?? "").slice(0, 4), nfl: String(p.nfl ?? "").toUpperCase().slice(0, 4),
    ...(typeof p.status === "string" && p.status ? { status: p.status.slice(0, 30) } : {}),
  }));
  const games = (Array.isArray(b.games) ? b.games : []).slice(0, 40).filter((g) => g && typeof g.team === "string").map((g) => ({
    team: g.team.toUpperCase().slice(0, 4), ...(typeof g.opp === "string" ? { opp: g.opp.toUpperCase().slice(0, 4) } : {}),
    ...(typeof g.home === "boolean" ? { home: g.home } : {}), ...(typeof g.at === "string" && !Number.isNaN(Date.parse(g.at)) ? { at: g.at } : {}),
  }));
  const season = String(b.season ?? new Date().getFullYear()).replace(/\D/g, "").slice(0, 4);
  const week = Math.max(1, Math.min(18, Number(b.week) || 1));
  return { part: b.part, players, games, season, week };
}

/** `guard` is api/_lib/guard.js's createGuard(); the deployed handler (the default export) always has one. */
export function createSignalsHandler({ env = process.env, guard = null } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "method not allowed" }); }
    if (guard) { const g = await guard.check(req); if (!g.ok) return res.status(g.status).json(g.body); }
    const input = readSignalsBody(req);
    if (input.status) return res.status(input.status).json({ error: input.error });
    if (signalsLimit.limited(ipOf(req))) { res.setHeader("Retry-After", "60"); return res.status(429).json({ error: "slow down" }); }
    const { part, players, games, season, week } = input;
    let out;
    try {
      out = part === "news" ? await newsPart(players)
        : part === "injuries" ? await injuriesPart(players)
          : part === "odds" ? await oddsPart(players, env)
            : part === "weather" ? await weatherPart(players, games, season, week)
              : await rankingsPart(players, week, env);
    } catch {
      out = { status: "error" };
    }
    // Which optional sources are set up, so the app leaves one that isn't out of its trace entirely
    return res.status(200).json({ part, configured: { odds: !!env.ODDS_API_KEY, rankings: !!env.RANKINGS_FEED_URL }, ...out });
  };
}

export const resetSignalLimits = signalsLimit.reset;
export default createSignalsHandler({ guard: createGuard() });
