// Sleeper's public, read-only API. No password or token: a username is enough.
// Everything here runs in the user's browser; nothing is stored on a server.
import { BoardRow, SpecialPlayer, WeekHistory, defName, BidTier, FreeAgent, Activity, LeagueData, PastTrade, Player, Pos, Pts, SlotHistory, SlotKey, Status, Team } from "./data";

const API = "https://api.sleeper.app";
const SKILL: Pos[] = ["QB", "RB", "WR", "TE"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export class SleeperError extends Error {}

async function get<T>(path: string): Promise<T> {
  let r: Response;
  try { r = await fetch(API + path); } catch { throw new SleeperError("Couldn't reach Sleeper. Check your connection and try again."); }
  if (r.status === 429) throw new SleeperError("Sleeper is busy right now. Try again in a minute.");
  if (!r.ok) throw new SleeperError("Sleeper didn't respond normally. Try again in a minute.");
  return r.json() as Promise<T>;
}

// ---- Raw shapes (only the fields we read) --------------------------------

interface SUser { user_id: string; username?: string; display_name: string; avatar?: string | null; metadata?: { team_name?: string } }
interface SState { season: string; week: number; display_week?: number; season_type: string }
export interface SLeague {
  league_id: string; name: string; season: string; status: string; total_rosters: number; avatar?: string | null;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: { type?: number; waiver_type?: number; waiver_budget?: number; waiver_day_of_week?: number; trade_deadline?: number; playoff_week_start?: number;
    reserve_allow_out?: number; reserve_allow_doubtful?: number; reserve_allow_sus?: number; reserve_allow_na?: number; reserve_allow_cov?: number; reserve_allow_dnr?: number };
}
interface SRoster {
  roster_id: number; owner_id: string | null; co_owners?: string[] | null; players: string[] | null; starters: string[] | null;
  reserve?: string[] | null; taxi?: string[] | null;
  settings: { wins?: number; losses?: number; ties?: number; fpts?: number; fpts_decimal?: number; waiver_budget_used?: number };
}
interface SProj {
  player_id: string; team: string | null; opponent?: string | null; date?: string | null;
  stats: Record<string, number | undefined>;
  player?: { first_name?: string; last_name?: string; position?: string; team?: string | null; injury_status?: string | null; injury_body_part?: string | null; years_exp?: number };
}
interface STxn {
  type: "trade" | "waiver" | "free_agent" | "commissioner"; status: string; leg: number;
  roster_ids: number[]; adds: Record<string, number> | null; drops?: Record<string, number> | null; settings?: { waiver_bid?: number } | null;
  transaction_id?: string; status_updated?: number; created?: number;
}
interface SMatchup { roster_id: number; matchup_id?: number | null; starters: string[] | null; starters_points: number[] | null; players?: string[] | null; players_points?: Record<string, number> | null; points?: number | null }

/** Weekly stats or projections for every player, keyed by Sleeper id. Used by the week browser. */
export type WeekRow = { team: string | null; stats: Record<string, number | undefined>; player?: SProj["player"] };
export async function fetchWeekRows(season: string, week: number, kind: "stats" | "projections"): Promise<Map<string, WeekRow>> {
  const q = "season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF";
  const rows = await get<(WeekRow & { player_id: string })[]>(`/${kind}/nfl/${season}/${week}?${q}`);
  return new Map(rows.map((r) => [r.player_id, r]));
}
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
  onStep?.("Loading your league");
  const [state, league, users, rosters] = await Promise.all([
    getState(),
    get<SLeague>(`/v1/league/${leagueId}`),
    get<SUser[]>(`/v1/league/${leagueId}/users`),
    get<SRoster[]>(`/v1/league/${leagueId}/rosters`),
  ]);
  const season = league.season;
  const live = state.season === season && state.season_type === "regular";
  const week = live ? Math.max(1, state.display_week ?? state.week) : 1;

  // Rest of season: every remaining week through the fantasy playoffs
  const playoffStart = Math.min(17, Math.max(13, league.settings.playoff_week_start || 15));
  const lastWeek = Math.min(18, playoffStart + 2);
  const futureWeeks = live ? Array.from({ length: Math.max(0, lastWeek - week) }, (_, i) => week + 1 + i) : [];

  // Market values: FantasyCalc, built from real fantasy trades, matched to this league's settings
  const recSetting = league.scoring_settings.rec ?? 0;
  const sfLeague = league.roster_positions.includes("SUPER_FLEX");
  const dynasty = leagueType(league) === "dynasty";
  const fcUrl = `https://api.fantasycalc.com/values/current?isDynasty=${dynasty}&numQbs=${sfLeague ? 2 : 1}&numTeams=${league.total_rosters}&ppr=${recSetting >= 1 ? 1 : recSetting >= 0.5 ? 0.5 : 0}`;

  onStep?.("Loading projections and trade values");
  const specialQuery = "position[]=K&position[]=DEF";
  const [weekProj, seasonProj, trending, futureProj, market, kdefWeek, kdefSeason] = await Promise.all([
    get<SProj[]>(`/projections/nfl/${season}/${week}?season_type=regular&${positionsQuery}`).catch(() => [] as SProj[]),
    get<SProj[]>(`/projections/nfl/${season}?season_type=regular&${positionsQuery}`).catch(() => [] as SProj[]),
    get<{ player_id: string; count: number }[]>("/v1/players/nfl/trending/add?lookback_hours=24&limit=40").catch(() => []),
    Promise.all(futureWeeks.map((w) => get<SProj[]>(`/projections/nfl/${season}/${w}?season_type=regular&${positionsQuery}`).catch(() => [] as SProj[]))),
    fetch(fcUrl).then((r) => (r.ok ? r.json() : [])).catch(() => []) as Promise<{ player: { sleeperId?: string; name?: string; position?: string; maybeTeam?: string | null; maybeAge?: number | null }; value: number; trend30Day?: number }[]>,
    get<SProj[]>(`/projections/nfl/${season}/${week}?season_type=regular&${specialQuery}`).catch(() => [] as SProj[]),
    get<SProj[]>(`/projections/nfl/${season}?season_type=regular&${specialQuery}`).catch(() => [] as SProj[]),
  ]);
  const valueBy = new Map(market.filter((m) => m.player?.sleeperId).map((m) => [String(m.player.sleeperId), m.value]));
  // Weekly projections for every remaining week, this week included
  const allWeeks = [weekProj, ...futureProj];
  const weeklyBy = allWeeks.map((wp) => new Map(wp.map((p) => [p.player_id, ptsOf(p.stats)])));
  const weekNums = [week, ...futureWeeks];
  const rosOf = (id: string, from: (n: number) => boolean): Pts | null => {
    const idx = weekNums.map((n, i) => (from(n) ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) return null;
    const sum = { ppr: 0, half: 0, std: 0, rec: 0 };
    idx.forEach((i) => { const p = weeklyBy[i].get(id); if (p) { sum.ppr += p.ppr; sum.half += p.half; sum.std += p.std; sum.rec += p.rec; } });
    const n = idx.length;
    return { ppr: sum.ppr / n, half: sum.half / n, std: sum.std / n, rec: sum.rec / n };
  };

  onStep?.("Loading trades, waivers and past weeks");
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

  // IR eligibility follows this league's reserve rules. IR and PUP always qualify.
  const ls = league.settings;
  const irOk = (s?: string | null) => !!s && (s === "IR" || s === "PUP" || (s === "Out" && !!ls.reserve_allow_out) || (s === "Doubtful" && !!ls.reserve_allow_doubtful)
    || (s === "Sus" && !!ls.reserve_allow_sus) || (s === "NA" && !!ls.reserve_allow_na) || (s === "COV" && !!ls.reserve_allow_cov) || (s === "DNR" && !!ls.reserve_allow_dnr));
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
    // Rest-of-season weekly average from the real schedule (byes count as zero); fall back to a blend
    const ros = rosOf(id, () => true);
    const pts = round(ros ?? blend(weekPts, seasonPts)) ?? { ppr: 0, half: 0, std: 0, rec: 0 };
    const playoff = round(rosOf(id, (n) => n >= playoffStart));
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
      opp: w?.opponent ?? undefined,
      gameDate: w?.date ?? undefined,
      irEligible: irOk(info.injury_status),
      injury: info.injury_status ?? undefined,
      playoff: playoff ?? undefined,
      value: valueBy.get(id),
    };
  };
  seasonProj.forEach((p) => add(p.player_id, p.player, p.team));
  weekProj.forEach((p) => add(p.player_id, { ...seasonBy.get(p.player_id)?.player, ...p.player }, p.team));

  // Kickers and defenses: shown in the lineup, kept out of the trade engine.
  const specials: Record<string, SpecialPlayer> = {};
  const kWeek = new Map(kdefWeek.map((p) => [p.player_id, p]));
  const kSeason = new Map(kdefSeason.map((p) => [p.player_id, p]));
  const addSpecial = (id: string, info: SPlayerLite | undefined, team: string | null) => {
    const isDef = /^[A-Z]{2,3}$/.test(id);
    const pos = isDef ? "DEF" : info?.position === "K" ? "K" : null;
    if (!pos) return;
    const w = kWeek.get(id), s = kSeason.get(id);
    const gp = Math.max(1, s?.stats?.gp ?? 17);
    const wk = w?.stats?.pts_ppr;
    const per = Math.round(((s?.stats?.pts_ppr ?? 0) / gp) * 10) / 10;
    specials[id] = {
      id, pos, nfl: isDef ? id : info?.team ?? team ?? "FA",
      name: isDef ? defName(id) : [info?.first_name, info?.last_name].filter(Boolean).join(" ") || `Kicker ${id}`,
      wk: wk && wk > 0 ? Math.round(wk * 10) / 10 : live ? null : per,
      proj: per,
      opp: w?.opponent ?? undefined,
      gameDate: w?.date ?? undefined,
      ...statusOf(info?.injury_status),
    };
  };
  const rostered = new Set(rosters.flatMap((r) => r.players ?? []));
  rostered.forEach((id) => { if (!players[id]) { const src = kWeek.get(id) ?? kSeason.get(id); addSpecial(id, src?.player, src?.team ?? null); } });

  // Rostered players missing from every feed (rare): fetch the full player file once.
  const missing = [...rostered].filter((id) => !players[id] && !specials[id]);
  if (missing.length) {
    onStep?.("Loading player details");
    const all = await get<Record<string, SPlayerLite>>("/v1/players/nfl").catch(() => ({} as Record<string, SPlayerLite>));
    missing.forEach((id) => { add(id, all[id], null); if (!players[id]) addSpecial(id, all[id], null); });
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
      avatar: u?.avatar ?? undefined,
      // Sleeper's players list includes IR and taxi. Split them out so they never count as active.
      roster: (r.players ?? []).filter((id) => players[id] && !r.reserve?.includes(id) && !r.taxi?.includes(id)),
      ir: (r.reserve ?? []).filter((id) => players[id]),
      taxi: (r.taxi ?? []).filter((id) => players[id]),
      special: (r.players ?? []).filter((id) => specials[id] && !r.reserve?.includes(id) && !r.taxi?.includes(id)),
    };
  });
  const you = teams.find((t) => t.you);
  if (!you) throw new SleeperError("We couldn't find your team in that league. Check that you used the right Sleeper username.");
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
  // Active spots = every starter and bench slot. Kickers and defenses aren't modeled, so drop their slots.
  const activeSpots = league.roster_positions.filter((p) => !["IR", "TAXI", "K", "DEF"].includes(p)).length;
  const rosterMax = Math.max(activeSpots, ...teams.map((t) => t.roster.length));
  const irSlots = league.roster_positions.filter((p) => p === "IR").length;
  const specialSlots = league.roster_positions.filter((p) => p === "K" || p === "DEF") as ("K" | "DEF")[];
  const nonBench = league.roster_positions.filter((p) => !["BN", "IR", "TAXI"].includes(p));
  const sleeperSpecial = (myRoster.starters ?? []).filter((id, i) => (nonBench[i] === "K" || nonBench[i] === "DEF") && !!id && id !== "0");
  const taxiSlots = league.roster_positions.filter((p) => p === "TAXI").length;

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
  // Top available at each position plus the most-added players across Sleeper, so position filters always have depth
  const byValue = SKILL.flatMap((pos) => pool.filter((p) => p.pos === pos).sort((a, b) => (b.pts?.ppr ?? 0) - (a.pts?.ppr ?? 0)).slice(0, 8));
  const byTrend = pool.filter((p) => trend.has(p.id)).sort((a, b) => trend.get(b.id)! - trend.get(a.id)!).slice(0, 12);
  const freeAgents: FreeAgent[] = Array.from(new Map([...byTrend, ...byValue].map((p) => [p.id, p])).values()).map((p) => {
    const t = trend.get(p.id);
    const wk = p.wk ? p.wk.ppr : 0;
    return {
      id: p.id, name: p.name, pos: p.pos, nfl: p.nfl, proj: p.proj, rookie: p.rookie, trend: t ? "up" : "flat", adds: t,
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

  // Your weekly results, so past weeks show who you started and what they scored
  const opponentName = (rid: number) => { const r = rosters.find((x) => x.roster_id === rid); const u = r?.owner_id ? userBy.get(r.owner_id) : undefined; return u?.display_name ?? `Team ${rid}`; };
  const history: Record<number, WeekHistory> = {};
  allMatchups.forEach((ms, i) => {
    const m = ms.find((x) => String(x.roster_id) === you.id);
    if (!m) return;
    const o = m.matchup_id ? ms.find((x) => x.matchup_id === m.matchup_id && x.roster_id !== m.roster_id) : undefined;
    history[i + 1] = {
      starters: (m.starters ?? []).filter((id) => id && id !== "0"), players: m.players ?? [], points: m.players_points ?? {},
      total: m.points ?? 0, oppTotal: o?.points ?? undefined, oppName: o ? opponentName(o.roster_id) : undefined,
    };
  });
  const lineupOrder = league.roster_positions.filter((p) => !["BN", "IR", "TAXI"].includes(p));

  // Market board: top 300 by value, with who owns each player in this league
  const ownerOf = new Map<string, string>();
  rosters.forEach((r) => (r.players ?? []).forEach((id) => ownerOf.set(id, String(r.roster_id))));
  const board: BoardRow[] = market.filter((m) => m.player?.sleeperId && ["QB", "RB", "WR", "TE"].includes(m.player.position ?? ""))
    .sort((a, b) => b.value - a.value).slice(0, 300)
    .map((m) => { const id = String(m.player.sleeperId); return { id, name: players[id]?.name ?? m.player.name ?? `Player ${id}`, pos: m.player.position!, nfl: players[id]?.nfl ?? m.player.maybeTeam ?? "FA", age: m.player.maybeAge ? Math.floor(m.player.maybeAge) : undefined, value: Math.round(m.value), trend: Math.round(m.trend30Day ?? 0), ownerId: ownerOf.get(id) }; });

  // League activity: the latest completed adds, drops, claims and trades
  const infoOf = (id: string) => {
    if (players[id]) return { id, name: players[id].name, pos: players[id].pos as string, nfl: players[id].nfl };
    if (/^[A-Z]{2,3}$/.test(id)) return { id, name: `${id} defense`, pos: "DEF", nfl: id };
    const s = seasonBy.get(id)?.player ?? weekBy.get(id)?.player;
    return { id, name: s ? [s.first_name, s.last_name].filter(Boolean).join(" ") : `Player ${id}`, pos: s?.position ?? "", nfl: s?.team ?? "" };
  };
  const activity: Activity[] = txns.filter((t) => t.status === "complete")
    .sort((a, b) => (b.status_updated ?? b.created ?? 0) - (a.status_updated ?? a.created ?? 0))
    .slice(0, 40)
    .map((t, i) => ({
      id: t.transaction_id ?? `t${i}`,
      kind: t.type,
      teamIds: t.roster_ids.map(String),
      adds: Object.entries(t.adds ?? {}).map(([id, r]) => ({ ...infoOf(id), teamId: String(r) })),
      drops: Object.entries(t.drops ?? {}).map(([id, r]) => ({ ...infoOf(id), teamId: String(r) })),
      bid: t.type === "waiver" ? t.settings?.waiver_bid : undefined,
      at: t.status_updated ?? t.created ?? 0,
    }));

  // This week's opponent
  const mine = thisWeek.find((m) => String(m.roster_id) === you.id);
  const opp = mine?.matchup_id ? thisWeek.find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== mine.roster_id) : undefined;

  const wd = league.settings.waiver_day_of_week;
  const td = league.settings.trade_deadline;
  return {
    mode: "live", id: league.league_id, name: league.name, season, week, slots, format, rosterMax, irSlots, taxiSlots, specialSlots, specials, sleeperSpecial, history, lineupOrder, lastWeek, board,
    updated: `Sleeper projections, refreshed ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
    deadlines: {
      waivers: wd !== undefined ? `Waivers run ${DAYS[wd] ?? "Wednesday"}` : "Waivers run Wednesday",
      lock: "Lineups lock at each kickoff",
      trade: td && td < 99 ? `Trade deadline Week ${td}` : "No trade deadline",
    },
    byeTeams, teams, players, sleeperSet, slotHistory,
    faab: { enabled: faabEnabled, budget, remaining: Math.max(0, budget - (myRoster.settings.waiver_budget_used ?? 0)) },
    faabHistory, freeAgents, trades, activity, offers: null, username, type: leagueType(league),
    opponentId: opp ? String(opp.roster_id) : undefined,
    valueSource: valueBy.size ? `FantasyCalc market values (${dynasty ? "dynasty" : "redraft"}, ${sfLeague ? "Superflex" : "1QB"}, ${league.total_rosters} teams)` : "Estimated from projections (market values unavailable)",
    rosWeeks: weekNums.length,
  };
}
