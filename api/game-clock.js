// Game clock for every NFL game in progress, so the app can project where live players are on pace to finish.
// Sleeper's public API has no clock, so this tries several sources in order and returns the first that answers.
// Response: { source, at, teams: { [TEAM]: fractionOfGameLeft (0..1) } }. Cached at the edge for 20 seconds.
const FIX = { WSH: "WAS", LA: "LAR", JAC: "JAX" };
const team = (a) => (a ? FIX[a] ?? a : null);
const leftOf = (quarter, seconds) => (quarter > 4 ? 0 : Math.max(0, Math.min(1, ((4 - quarter) * 900 + seconds) / 3600)));
const mmss = (t) => { const m = /^(\d+):(\d+)/.exec(String(t ?? "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const get = async (url, init) => { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(4000) }); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };

// ESPN events share one shape across the site API and the CDN feed
function fromEspnEvents(events) {
  const teams = {};
  for (const e of events ?? []) for (const c of e.competitions ?? []) {
    if (c.status?.type?.state !== "in") continue;
    const sec = typeof c.status.clock === "number" ? c.status.clock : mmss(c.status.displayClock) ?? 0;
    const left = leftOf(c.status.period ?? 1, sec);
    for (const t of c.competitors ?? []) { const a = team(t.team?.abbreviation); if (a) teams[a] = left; }
  }
  return teams;
}

const SOURCES = [
  // Sleeper's own scores feed (what its app reads). Field names guarded since it's undocumented.
  ["sleeper", async (season, week) => {
    const q = `query s { scores(sport: "nfl", season_type: "regular", season: "${season}", week: ${week}) { status metadata } }`;
    const d = await get("https://sleeper.com/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q }) });
    const teams = {};
    for (const g of d?.data?.scores ?? []) {
      const m = g.metadata ?? {};
      if (!/in_?progress|in_game/i.test(String(g.status ?? m.status ?? ""))) continue;
      const qn = Number(m.quarter_num ?? m.quarter ?? m.period);
      const sec = mmss(m.time_remaining ?? m.clock ?? m.game_clock);
      if (!qn || sec === null) continue;
      const left = leftOf(qn, sec);
      for (const a of [m.home_team, m.away_team, m.home, m.away]) { const t = team(a); if (t) teams[t] = left; }
    }
    return teams;
  }],
  ["espn", async () => fromEspnEvents((await get("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard")).events)],
  ["espn-cdn", async () => fromEspnEvents((await get("https://cdn.espn.com/core/nfl/scoreboard?xhr=1")).content?.sbData?.events)],
];

export default async function handler(req, res) {
  const season = String(req.query?.season ?? new Date().getFullYear()).replace(/\D/g, "");
  const week = Number(req.query?.week ?? 1) || 1;
  for (const [source, run] of SOURCES) {
    try {
      const teams = await run(season, week);
      if (teams && Object.keys(teams).length) {
        res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=40");
        return res.status(200).json({ source, at: Date.now(), teams });
      }
    } catch { /* try the next source */ }
  }
  // Nothing live anywhere (or every source down): an empty answer, cached briefly
  res.setHeader("Cache-Control", "public, s-maxage=20");
  res.status(200).json({ source: null, at: Date.now(), teams: {} });
}
