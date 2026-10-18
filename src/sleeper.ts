// Sleeper's public, read-only API. No password or token: a username is enough.
// Everything here runs in the user's browser; nothing is stored on a server.
import { BidTier, FreeAgent, LeagueData, PastTrade, Player, Pos, Pts, SlotHistory, SlotKey, Status, Team } from "./data";

const API = "https://api.sleeper.app";
const SKILL: Pos[] = ["QB", "RB", "WR", "TE"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export class SleeperError extends Error {}

async function get<T>(path: string): Promise<T> {
  let r: Response;
  try { r = await fetch(API + path); } catch { throw new SleeperError("Couldn't reach Sleeper. Check your connection and try again."); }
  if (r.status === 429) throw new SleeperError("Sleeper is rate limiting requests. Give it a minute and try again.");
  if (!r.ok) throw new SleeperError(`Sleeper returned an error (${r.status}).`);
  return r.json() as Promise<T>;
}

// ---- Raw shapes (only the fields we read) --------------------------------

interface SUser { user_id: string; username?: string; display_name: string; avatar?: string | null; metadata?: { team_name?: string } }
interface SState { season: string; week: number; display_week?: number; season_type: string }
export interface SLeague {
  league_id: string; name: string; season: string; status: string; total_rosters: number; avatar?: string | null;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: { type?: number; waiver_type?: number; waiver_budget?: number; waiver_day_of_week?: number; trade_deadline?: number; playoff_week_start?: number };
}
interface SRoster {
  roster_id: number; owner_id: string | null; co_owners?: string[] | null; players: string[] | null; starters: string[] | null;
  settings: { wins?: number; losses?: number; ties?: number; fpts?: number; fpts_decimal?: number; waiver_budget_used?: number };
}
interface SProj {
  player_id: string; team: string | null;
  stats: Record<string, number | undefined>;
  player?: { first_name?: string; last_name?: string; position?: string; team?: string | null; injury_status?: string | null; injury_body_part?: string | null; years_exp?: number };
}
interface STxn {
  type: "trade" | "waiver" | "free_agent" | "commissioner"; status: string; leg: number;
  roster_ids: number[]; adds: Record<string, number> | null; settings?: { waiver_bid?: number } | null;
}
interface SMatchup { roster_id: number; matchup_id?: number | null; starters: string[] | null; starters_points: number[] | null }
interface SPlayerLite { first_name?: string; last_name?: string; position?: string; team?: string | null; injury_status?: string | null; years_exp?: number }

// ---- Public calls --------------------------------------------------------

export async function findUser(username: string): Promise<SUser | null> {
  const u = await get<SUser | null>(`/v1/user/${encodeURIComponent(username.trim().replace(/^@/, ""))}`);
  return u && u.user_id ? u : null;
}

export const getState = () => get<SState>("/v1/state/nfl");

export async function findLeagues(userId: string): Promise<{ season: string; leagues: SLeague[] }> {
  const state = await getState();
  let leagues = await get<SLeague[] | null>(`/v1/user/${userId}/leagues/nfl/${state.season}`);
  let season = state.season;
  if (!leagues?.length) {
    // Offseason: fall back to last season's leagues
    season = String(Number(state.season) - 1);
    leagues = await get<SLeague[] | null>(`/v1/user/${userId}/leagues/nfl/${season}`);
  }
  return { season, leagues: leagues ?? [] };
}

export const leagueType = (l: SLeague) => (l.settings.type === 2 ? "dynasty" : l.settings.type === 1 ? "keeper" : "redraft") as "redraft" | "keeper" | "dynasty";

// ---- Mapping helpers -----------------------------------------------------

const SLOT_MAP: Record<string, SlotKey> = { QB: "QB", RB: "RB", WR: "WR", TE: "TE", FLEX: "FLEX", WRRB_FLEX: "FLEX", REC_FLEX: "FLEX", SUPER_FLEX: "SF" };
const ptsOf = (st: SProj["stats"] | undefined, div = 1): Pts | null => {
  if (!st || st.pts_ppr === undefined) return null;
  return { ppr: (st.pts_ppr ?? 0) / div, half: (st.pts_half_ppr ?? 0) / div, std: (st.pts_std ?? 0) / div, rec: (st.rec ?? 0) / div };
};
const blend = (week: Pts | null, season: Pts | null): Pts | null => {
  if (!week && !season) return null;
  if (!season) return week;
  if (!week || week.ppr <= 0) return season;
  const m = (k: keyof Pts) => 0.6 * week[k] + 0.4 * season[k];
  return { ppr: m("ppr"), half: m("half"), std: m("std"), rec: m("rec") };
};
const round = (p: Pts | null): Pts | null => p && { ppr: +p.ppr.toFixed(2), half: +p.half.toFixed(2), std: +p.std.toFixed(2), rec: +p.rec.toFixed(2) };
function statusOf(s?: string | null): { status?: Status; longTerm?: boolean } {
  if (!s) return {};
  if (s === "Questionable" || s === "Doubtful") return { status: "Q" };
  if (s === "Out") return { status: "O" };
  return { status: "O", longTerm: true }; // IR, PUP, Sus, NA, DNR, COV
}
const positionsQuery = SKILL.map((p) => `position[]=${p}`).join("&");

// ---- Load a whole league -------------------------------------------------

export async function loadLeague(leagueId: string, userId: string, username: string, onStep?: (s: string) => void): Promise<LeagueData> {
  onStep?.("Reading your league");
  const [state, league, users, rosters] = await Promise.all([
    getState(),
    get<SLeague>(`/v1/league/${leagueId}`),
    get<SUser[]>(`/v1/league/${leagueId}/users`),
    get<SRoster[]>(`/v1/league/${leagueId}/rosters`),
  ]);
  const season = league.season;
  const live = state.season === season && state.season_type === "regular";
  const week = live ? Math.max(1, state.display_week ?? state.week) : 1;

  onStep?.("Pulling this week's projections");
  const [weekProj, seasonProj, trending] = await Promise.all([
    get<SProj[]>(`/projections/nfl/${season}/${week}?season_type=regular&${positionsQuery}`).catch(() => [] as SProj[]),
    get<SProj[]>(`/projections/nfl/${season}?season_type=regular&${positionsQuery}`).catch(() => [] as SProj[]),
    get<{ player_id: string; count: number }[]>("/v1/players/nfl/trending/add?lookback_hours=24&limit=40").catch(() => []),
  ]);

  onStep?.("Checking trades, waivers and past weeks");
  const weeks = Array.from({ length: week }, (_, i) => i + 1);
  const [txnsByWeek, allMatchups] = await Promise.all([
    Promise.all(weeks.map((w) => get<STxn[]>(`/v1/league/${leagueId}/transactions/${w}`).catch(() => [] as STxn[]))),
    Promise.all(weeks.map((w) => get<SMatchup[]>(`/v1/league/${leagueId}/matchups/${w}`).catch(() => [] as SMatchup[]))),
  ]);
  const matchupsByWeek = allMatchups.slice(0, -1);
  const thisWeek = live ? allMatchups[allMatchups.length - 1] ?? [] : [];
  const txns = txnsByWeek.flat();

  // Players: names, teams and injuries come with the projections feed.
  const weekBy = new Map(weekProj.map((p) => [p.player_id, p]));
  const seasonBy = new Map(seasonProj.map((p) => [p.player_id, p]));
  const teamsPlaying = new Set(weekProj.filter((p) => (p.stats?.pts_ppr ?? 0) > 0 && p.team).map((p) => p.team!));
  const byeTeams = live && teamsPlaying.size >= 20 ? Array.from(new Set(seasonProj.map((p) => p.team).filter(Boolean) as string[])).filter((t) => !teamsPlaying.has(t)) : [];

  const players: Record<string, Player> = {};
  const add = (id: string, info: SPlayerLite | undefined, fallbackTeam: string | null) => {
    if (!info) return;
    const pos = info.position as Pos;
    if (!SKILL.includes(pos)) return;
    const w = weekBy.get(id);
    const s = seasonBy.get(id);
    const gp = Math.max(1, s?.stats?.gp ?? 17);
    const weekPts = ptsOf(w?.stats);
    const seasonPts = ptsOf(s?.stats, gp);
    const pts = round(blend(weekPts, seasonPts)) ?? { ppr: 0, half: 0, std: 0, rec: 0 };
    const team = info.team ?? fallbackTeam ?? "FA";
    const st = statusOf(info.injury_status);
    players[id] = {
      id, pos, nfl: team,
      name: [info.first_name, info.last_name].filter(Boolean).join(" ") || `Player ${id}`,
      proj: pts.ppr, pts,
      // null = bye or not projected this week; undefined (offseason) falls back to the season value
      wk: weekPts && weekPts.ppr > 0 ? round(weekPts) : live ? null : undefined,
      ...st,
      note: info.injury_status ? [info.injury_status, (w?.player ?? s?.player)?.injury_body_part].filter(Boolean).join(", ") : undefined,
      rookie: info.years_exp === 0,
    };
  };
  seasonProj.forEach((p) => add(p.player_id, p.player, p.team));
  weekProj.forEach((p) => add(p.player_id, { ...seasonBy.get(p.player_id)?.player, ...p.player }, p.team));

  // Rostered players missing from both feeds (rare): fetch the full player file once.
  const rostered = new Set(rosters.flatMap((r) => r.players ?? []));
  const missing = [...rostered].filter((id) => !players[id] && !/^[A-Z]{2,3}$/.test(id));
  if (missing.length) {
    onStep?.("Filling in a few players");
    const all = await get<Record<string, SPlayerLite>>("/v1/players/nfl").catch(() => ({} as Record<string, SPlayerLite>));
    missing.forEach((id) => add(id, all[id], null));
  }

  // Teams
  const userBy = new Map(users.map((u) => [u.user_id, u]));
  const teams: Team[] = rosters.map((r) => {
    const u = r.owner_id ? userBy.get(r.owner_id) : undefined;
    const st = r.settings ?? {};
    const record = `${st.wins ?? 0}-${st.losses ?? 0}${st.ties ? `-${st.ties}` : ""}`;
    return {
      id: String(r.roster_id),
      name: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`,
      manager: u?.display_name || "Open team",
      record,
      pf: (st.fpts ?? 0) + (st.fpts_decimal ?? 0) / 100,
      you: r.owner_id === userId || !!r.co_owners?.includes(userId),
      roster: (r.players ?? []).filter((id) => players[id]),
    };
  });
  const you = teams.find((t) => t.you);
  if (!you) throw new SleeperError("We couldn't find your team in that league. Is this the right Sleeper account?");
  const myRoster = rosters.find((r) => String(r.roster_id) === you.id)!;

  // Slots and format
  const starterSlots = league.roster_positions.filter((p) => !["BN", "IR", "TAXI"].includes(p));
  const slots = starterSlots.map((p) => SLOT_MAP[p]).filter(Boolean) as SlotKey[];
  const rec = league.scoring_settings.rec ?? 0;
  const format = {
    scoring: (rec >= 1 ? "ppr" : rec >= 0.5 ? "half" : "std") as "ppr" | "half" | "std",
    superflex: slots.includes("SF"),
    tePremium: (league.scoring_settings.bonus_rec_te ?? 0) > 0,
  };
  const rosterMax = Math.max(...teams.map((t) => t.roster.length), slots.length + 4);

  // Your lineup as set in Sleeper
  const sleeperSet: Record<string, string[]> = {};
  (myRoster.starters ?? []).forEach((id, i) => {
    const slot = SLOT_MAP[starterSlots[i]];
    if (!slot || !id || id === "0" || !players[id]) return;
    (sleeperSet[slot] ??= []).push(id);
  });

  // Slot history from completed weeks
  const slotHistory: SlotHistory[] = [];
  const youId = you.id;
  if (matchupsByWeek.length >= 2) {
    const kinds: SlotKey[] = Array.from(new Set(slots));
    kinds.forEach((k) => {
      const mineByWeek: number[] = [];
      const avg: number[] = [];
      matchupsByWeek.forEach((ms) => {
        const tot = (m: SMatchup) => (m.starters_points ?? []).reduce((sum, pts, i) => sum + (SLOT_MAP[starterSlots[i]] === k ? pts : 0), 0);
        const mine = ms.find((m) => String(m.roster_id) === youId);
        if (!ms.length || !mine) return;
        mineByWeek.push(+tot(mine).toFixed(1));
        avg.push(+(ms.reduce((s, m) => s + tot(m), 0) / ms.length).toFixed(1));
      });
      if (mineByWeek.length >= 2) slotHistory.push({ slot: k, you: mineByWeek, avg });
    });
  }

  // FAAB and the league's own bidding history
  const faabEnabled = league.settings.waiver_type === 2;
  const budget = league.settings.waiver_budget || 100;
  const tierOf = (id: string): BidTier["tier"] => {
    const p = players[id];
    const v = p?.pts?.ppr ?? 0;
    return v >= 12 ? "Starter" : v >= 9.5 ? "Flex" : p?.rookie ? "Stash" : "Depth";
  };
  const tiers: Record<BidTier["tier"], number[]> = { Starter: [], Flex: [], Depth: [], Stash: [] };
  txns.filter((t) => t.type === "waiver" && t.status === "complete" && t.adds && t.settings?.waiver_bid !== undefined)
    .forEach((t) => Object.keys(t.adds!).forEach((id) => tiers[tierOf(id)].push(Math.round(((t.settings!.waiver_bid ?? 0) / budget) * 100))));
  const faabHistory: BidTier[] = (Object.keys(tiers) as BidTier["tier"][]).map((tier) => ({ tier, bids: tiers[tier] }));

  // Free agents worth a look
  const rosteredAll = new Set(rosters.flatMap((r) => r.players ?? []));
  const trend = new Map(trending.map((t) => [t.player_id, t.count]));
  const pool = Object.values(players).filter((p) => !rosteredAll.has(p.id) && p.nfl !== "FA" && !(p.status === "O" && p.longTerm));
  const byValue = pool.slice().sort((a, b) => (b.pts?.ppr ?? 0) - (a.pts?.ppr ?? 0)).slice(0, 10);
  const byTrend = pool.filter((p) => trend.has(p.id)).sort((a, b) => trend.get(b.id)! - trend.get(a.id)!).slice(0, 4);
  const freeAgents: FreeAgent[] = Array.from(new Map([...byTrend, ...byValue].map((p) => [p.id, p])).values()).slice(0, 10).map((p) => {
    const t = trend.get(p.id);
    const wk = p.wk ? p.wk.ppr : 0;
    return {
      id: p.id, name: p.name, pos: p.pos, nfl: p.nfl, proj: p.proj, rookie: p.rookie, trend: t ? "up" : "flat",
      why: t ? `Added in ${t.toLocaleString()} Sleeper leagues in the last day. Projects ${wk.toFixed(1)} this week.`
        : p.wk === null ? `On bye this week, but projects ${p.proj.toFixed(1)} a week going forward.`
        : `Projects ${wk.toFixed(1)} this week and ${p.proj.toFixed(1)} a week going forward.`,
    };
  });

  // Completed trades
  const nameOf = (id: string) => players[id] ? { name: players[id].name, pos: players[id].pos, rookie: players[id].rookie } : null;
  const trades: PastTrade[] = txns.filter((t) => t.type === "trade" && t.status === "complete" && t.roster_ids.length === 2 && t.adds).map((t) => {
    const [a, b] = t.roster_ids;
    const got = (rid: number) => Object.entries(t.adds!).filter(([, r]) => r === rid).map(([id]) => nameOf(id)).filter(Boolean) as PastTrade["aGot"];
    return { week: `${season} Wk ${t.leg}`, a: String(a), b: String(b), aGot: got(a), bGot: got(b) };
  });

  // This week's opponent
  const mine = thisWeek.find((m) => String(m.roster_id) === you.id);
  const opp = mine?.matchup_id ? thisWeek.find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== mine.roster_id) : undefined;

  const wd = league.settings.waiver_day_of_week;
  const td = league.settings.trade_deadline;
  return {
    mode: "live", id: league.league_id, name: league.name, season, week, slots, format, rosterMax,
    updated: `Sleeper projections, refreshed ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
    deadlines: {
      waivers: wd !== undefined ? `Waivers run ${DAYS[wd] ?? "Wednesday"}` : "Waivers run Wednesday",
      lock: "Lineups lock at each kickoff",
      trade: td && td < 99 ? `Trade deadline Week ${td}` : "No trade deadline",
    },
    byeTeams, teams, players, sleeperSet, slotHistory,
    faab: { enabled: faabEnabled, budget, remaining: Math.max(0, budget - (myRoster.settings.waiver_budget_used ?? 0)) },
    faabHistory, freeAgents, trades, offers: null, username, type: leagueType(league),
    opponentId: opp ? String(opp.roster_id) : undefined,
  };
}
