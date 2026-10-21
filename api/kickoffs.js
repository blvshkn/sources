// Kickoff time for every NFL game in a week, from ESPN's public scoreboard, so game lines can read "Sun 1:00 PM v ATL".
//   GET /api/kickoffs?season=2026&week=7
// Response: { season, week, at, teams: { [TEAM]: isoKickoff }, opp: { [TEAM]: OPPONENT } }. Abbreviations follow
// Sleeper's (WSH becomes WAS, LA becomes LAR, JAC becomes JAX), the same mapping game-clock.js uses.
// Cached at the edge for an hour; an empty answer (ESPN down or the week not posted) for five minutes.
const FIX = { WSH: "WAS", LA: "LAR", JAC: "JAX" };
const team = (a) => (a ? FIX[a] ?? a : null);
const get = async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(4000) }); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };

function fromEspnEvents(events) {
  const teams = {}, opp = {};
  for (const e of events ?? []) for (const c of e.competitions ?? []) {
    const at = c.date ?? e.date;
    if (!at || Number.isNaN(Date.parse(at))) continue;
    const both = (c.competitors ?? []).map((t) => team(t.team?.abbreviation)).filter(Boolean);
    for (const a of both) { teams[a] = new Date(at).toISOString(); const o = both.find((b) => b !== a); if (o) opp[a] = o; }
  }
  return { teams, opp };
}

/** Each game once, with who's home and where it's played, for the lineup weather check (api/lineup-signals.js). */
export function gamesFrom(events) {
  const out = [];
  for (const e of events ?? []) for (const c of e.competitions ?? []) {
    const at = c.date ?? e.date;
    const home = team((c.competitors ?? []).find((t) => t.homeAway === "home")?.team?.abbreviation);
    const away = team((c.competitors ?? []).find((t) => t.homeAway === "away")?.team?.abbreviation);
    if (!home || !away || !at || Number.isNaN(Date.parse(at))) continue;
    out.push({ home, away, at: new Date(at).toISOString(), neutral: !!c.neutralSite, ...(typeof c.venue?.indoor === "boolean" ? { indoor: c.venue.indoor } : {}) });
  }
  return out;
}

/** This week's games from ESPN's scoreboard, or [] when ESPN can't be reached. */
export async function weekGames(season, week) {
  try {
    const d = await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${season}`);
    return gamesFrom(d.events);
  } catch { return []; }
}

export default async function handler(req, res) {
  const season = String(req.query?.season ?? new Date().getFullYear()).replace(/\D/g, "").slice(0, 4);
  const week = Math.max(1, Math.min(18, Number(req.query?.week ?? 1) || 1));
  const urls = [
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${season}`,
    `https://cdn.espn.com/core/nfl/scoreboard?xhr=1&week=${week}&seasontype=2&dates=${season}`,
  ];
  for (const url of urls) {
    try {
      const d = await get(url);
      const { teams, opp } = fromEspnEvents(d.events ?? d.content?.sbData?.events);
      if (Object.keys(teams).length) {
        res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
        return res.status(200).json({ season: Number(season), week, at: Date.now(), teams, opp });
      }
    } catch { /* try the next source */ }
  }
  res.setHeader("Cache-Control", "public, s-maxage=300");
  res.status(200).json({ season: Number(season), week, at: Date.now(), teams: {}, opp: {} });
}
