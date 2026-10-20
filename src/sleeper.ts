// Sleeper's public, read-only API. No password or token: a username is enough.
// Everything here runs in the user's browser; nothing is stored on a server.
import type { Chip } from "./steps";
import { BoardRow, SpecialPlayer, SpecialFreeAgent, WeekHistory, defName, BidTier, FreeAgent, Activity, LeagueData, PastTrade, Player, Pos, Pts, SlotHistory, SlotKey, Status, Team } from "./data";

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

/** One week of a league's transactions (trades, waivers, adds). Read-only: Sleeper only lists what already happened,
 *  so a completed trade shows up here but a pending offer never does. Used to mark sent offers accepted. */
export function leagueTransactions(leagueId: string, week: number): Promise<STxn[]> {
  return get<STxn[]>(`/v1/league/${leagueId}/transactions/${week}`);
}

// ---- Raw shapes (only the fields we read) --------------------------------

interface SUser { user_id: string; username?: string; display_name: string; avatar?: string | null; metadata?: { team_name?: string; avatar?: string; [k: string]: unknown } | null }

// ---- Avatars ------------------------------------------------------------------
// Sleeper keeps a manager's picture in two places. user.avatar is an id on Sleeper's CDN (the account picture).
// user.metadata.avatar, on a league's users list, is a full URL to the custom team picture set for that league,
// and Sleeper shows it in place of the account picture. Managers who only set a team picture have avatar: null.
const AVATAR_CDN = "https://sleepercdn.com/avatars";
const isUrl = (s: string) => /^https?:\/\//i.test(s);

/** An avatar id or URL as an image URL. Ids go through Sleeper's CDN, thumbs by default. */
export function avatarSrc(v: string | null | undefined, size: "thumb" | "full" = "thumb"): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (isUrl(s)) return s;
  return size === "thumb" ? `${AVATAR_CDN}/thumbs/${encodeURIComponent(s)}` : `${AVATAR_CDN}/${encodeURIComponent(s)}`;
}

const customUrl = (m: Record<string, unknown> | null | undefined) =>
  [m?.avatar, m?.team_avatar].find((v): v is string => typeof v === "string" && isUrl(v.trim()))?.trim() ?? null;

/** The picture Sleeper shows for a manager in a league: the league's custom team avatar first (user.metadata.avatar,
 *  or the roster's own metadata when it carries one), then the personal account avatar, else null (initials). */
export function managerAvatar(user: { avatar?: string | null; metadata?: Record<string, unknown> | null } | null | undefined, size: "thumb" | "full" = "thumb", roster?: { metadata?: Record<string, unknown> | null } | null): string | null {
  return customUrl(roster?.metadata) ?? customUrl(user?.metadata) ?? avatarSrc(user?.avatar, size);
}

/** A league's members, cached per league, for the switcher's per-league team pictures. */
export const leagueUsers = (leagueId: string) => cached(`users:${leagueId}`, 10 * 60_000, () => get<SUser[] | null>(`/v1/league/${leagueId}/users`).then((u) => u ?? []));

/** Your team picture in one league (null when you only have a personal avatar there, or none). */
export const teamAvatarIn = (leagueId: string, userId: string) =>
  leagueUsers(leagueId).then((us) => customUrl(us.find((u) => u.user_id === userId)?.metadata));
interface SState { season: string; week: number; display_week?: number; season_type: string }
export interface SLeague {
  league_id: string; name: string; season: string; previous_league_id?: string | null; status: string; total_rosters: number; avatar?: string | null;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: { type?: number; waiver_type?: number; waiver_budget?: number; waiver_day_of_week?: number; trade_deadline?: number; playoff_week_start?: number; playoff_teams?: number;
    reserve_slots?: number; taxi_slots?: number; reserve_allow_out?: number; reserve_allow_doubtful?: number; reserve_allow_sus?: number; reserve_allow_na?: number; reserve_allow_cov?: number; reserve_allow_dnr?: number };
}
interface SRoster {
  roster_id: number; owner_id: string | null; co_owners?: string[] | null; players: string[] | null; starters: string[] | null;
  reserve?: string[] | null; taxi?: string[] | null; metadata?: Record<string, unknown> | null;
  settings: { wins?: number; losses?: number; ties?: number; fpts?: number; fpts_decimal?: number; waiver_budget_used?: number; waiver_position?: number };
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

/** A player's fantasy points from a Sleeper stat line, scored exactly the way Sleeper scores it: each stat key in the line
 *  times the league's scoring_settings value for that key (pass_yd 0.04, rec 1, fum_lost -2, pts_allow_7_13, fgm_40_49...),
 *  summed and rounded to 2 decimals. The only keys a stat line doesn't carry are the per-position catch bonuses
 *  (bonus_rec_te / _rb / _wr), which Sleeper applies to `rec` by position, so they're added here the same way.
 *  Shared by the Lineup week browser, the Waivers week view and anything else that scores a week. */
export function scoreStats(stats: Record<string, number | undefined> | null | undefined, settings: Record<string, number>, pos?: string): number {
  if (!stats) return 0;
  let t = 0;
  for (const [k, v] of Object.entries(stats)) {
    const m = settings[k];
    if (typeof v === "number" && typeof m === "number") t += v * m;
  }
  const bonusKey = pos === "TE" ? "bonus_rec_te" : pos === "RB" ? "bonus_rec_rb" : pos === "WR" ? "bonus_rec_wr" : "";
  // Only when the line doesn't already carry the bonus key itself, so it's never counted twice
  if (bonusKey && settings[bonusKey] && typeof stats.rec === "number" && typeof stats[bonusKey] !== "number") t += stats.rec * settings[bonusKey];
  return Math.round((t + Number.EPSILON) * 100) / 100;
}

/** Weekly stats or projections for every player, keyed by Sleeper id. Used by the week browser. */
export type WeekRow = { team: string | null; stats: Record<string, number | undefined>; player?: SProj["player"] };
// Shared for a minute, so the Lineup week browser and the Waivers week view asking for the same week make one request
export function fetchWeekRows(season: string, week: number, kind: "stats" | "projections"): Promise<Map<string, WeekRow>> {
  const q = "season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF";
  return cached(`rows:${season}:${week}:${kind}`, 60_000, async () => {
    const rows = await get<(WeekRow & { player_id: string })[]>(`/${kind}/nfl/${season}/${week}?${q}`);
    return new Map(rows.map((r) => [r.player_id, r]));
  });
}
/** One week of league-wide stats for one position, with each player's opponent. The player sheet reads usage
 *  (snaps, carries, targets, red-zone looks) and points allowed by each defense from these. Cached for 30 minutes. */
export type StatRow = { player_id: string; team: string | null; opponent?: string | null; stats: Record<string, number | undefined> };
export const fetchStatRows = (season: string, week: number, pos: string) =>
  cached(`stats:${season}:${week}:${pos}`, 30 * 60_000, () => get<StatRow[]>(`/stats/nfl/${season}/${week}?season_type=regular&position[]=${pos}`));
interface SPlayerLite { first_name?: string; last_name?: string; position?: string; team?: string | null; injury_status?: string | null; years_exp?: number }

// ---- Public calls --------------------------------------------------------

// Lookups the league switcher repeats for every connected account. Kept in memory for a few minutes;
// a failed call is dropped right away so the next try goes back to Sleeper.
const memo = new Map<string, { at: number; p: Promise<unknown> }>();
function cached<T>(key: string, ttl: number, run: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.p as Promise<T>;
  const p = run();
  memo.set(key, { at: Date.now(), p });
  p.catch(() => { if (memo.get(key)?.p === p) memo.delete(key); });
  return p;
}

export async function findUser(username: string): Promise<SUser | null> {
  const name = username.trim().replace(/^@/, "");
  const u = await cached(`user:${name.toLowerCase()}`, 10 * 60_000, () => get<SUser | null>(`/v1/user/${encodeURIComponent(name)}`));
  return u && u.user_id ? u : null;
}

export const getState = () => cached("state", 5 * 60_000, () => get<SState>("/v1/state/nfl"));

export const findLeagues = (userId: string) => cached(`leagues:${userId}`, 5 * 60_000, () => fetchLeagues(userId));
async function fetchLeagues(userId: string): Promise<{ season: string; leagues: SLeague[] }> {
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

// ---- Last season's champion ---------------------------------------------

interface SBracketMatch { r: number; m: number; t1: number | null; t2: number | null; w: number | null; l: number | null; p?: number; t1_from?: { w?: number; l?: number }; t2_from?: { w?: number; l?: number } }

/** The title game in a winners bracket: the one Sleeper marks p: 1, else the final round's game fed by two winners. */
export function titleGame(bracket: SBracketMatch[]): SBracketMatch | undefined {
  const marked = bracket.find((m) => m.p === 1);
  if (marked) return marked;
  const last = Math.max(0, ...bracket.map((m) => m.r));
  return bracket.find((m) => m.r === last && m.t1_from?.w !== undefined && m.t2_from?.w !== undefined) ?? bracket.find((m) => m.r === last && !m.p);
}

/**
 * Who won the previous season, as the owner's user id. Sleeper links each season's league to the one
 * before it; the user id carries over even when roster ids don't. Null when there's no previous season
 * or the title game hasn't been decided. Cached for an hour since a finished season never changes.
 */
export const previousChampion = (prevId: string) => cached(`champ:${prevId}`, 60 * 60_000, async () => {
  const [prev, bracket, rosters] = await Promise.all([
    get<SLeague | null>(`/v1/league/${prevId}`),
    get<SBracketMatch[] | null>(`/v1/league/${prevId}/winners_bracket`),
    get<SRoster[] | null>(`/v1/league/${prevId}/rosters`),
  ]);
  const game = titleGame(bracket ?? []);
  const winner = game?.w != null ? (rosters ?? []).find((r) => r.roster_id === game.w) : undefined;
  if (!prev || !winner?.owner_id) return null;
  return { season: prev.season, ownerId: winner.owner_id };
});

/** Last season's champion as a team in this league: matched on owner or co-owner, since roster ids can change. */
export async function championFor(league: Pick<SLeague, "previous_league_id">, rosters: Pick<SRoster, "roster_id" | "owner_id" | "co_owners">[]): Promise<{ teamId: string; season: string } | undefined> {
  const prevId = league.previous_league_id;
  if (!prevId || prevId === "0") return undefined;
  const c = await previousChampion(prevId).catch(() => null);
  const r = c && rosters.find((x) => x.owner_id === c.ownerId || x.co_owners?.includes(c.ownerId));
  return r && c ? { teamId: String(r.roster_id), season: c.season } : undefined;
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

/** Where a league load reports its steps (think.ts tracer). Every count is what Sleeper and FantasyCalc sent back. */
export interface LoadTrace {
  step: (doing: string, done: string, opts?: { n?: number; chips?: Chip[] }) => Promise<void>;
  n: (n: number, chip?: Chip, done?: string) => Promise<void>;
}

export async function loadLeague(leagueId: string, userId: string, username: string, onStep?: (s: string) => void, tr?: LoadTrace): Promise<LeagueData> {
  onStep?.("Loading your league");
  await tr?.step("Loading your league from Sleeper", "Loaded {n} teams from Sleeper", { chips: [{ label: "Sleeper", kind: "feed" }] });
  const [state, league, users, rosters] = await Promise.all([
    getState(),
    get<SLeague>(`/v1/league/${leagueId}`),
    get<SUser[]>(`/v1/league/${leagueId}/users`),
    get<SRoster[]>(`/v1/league/${leagueId}/rosters`),
  ]);
  await tr?.n(rosters.length, { label: league.name, kind: "team" });
  const season = league.season;
  const champP = championFor(league, rosters);
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
  const projWeeks = 1 + futureWeeks.length;
  await tr?.step(`Loading ${projWeeks} ${projWeeks === 1 ? "week" : "weeks"} of projections and trade values`, `Loaded ${projWeeks} ${projWeeks === 1 ? "week" : "weeks"} of projections and {n} trade values`,
    { chips: [{ label: "Sleeper", kind: "feed" }, { label: "FantasyCalc", kind: "feed" }] });
  const specialQuery = "position[]=K&position[]=DEF";
  const [weekProj, seasonProj, trending, futureProj, market, kdefWeek, kdefSeason] = await Promise.all([
    get<SProj[]>(`/projections/nfl/${season}/${week}?season_type=regular&${positionsQuery}`).catch(() => [] as SProj[]),
    get<SProj[]>(`/projections/nfl/${season}?season_type=regular&${positionsQuery}`).catch(() => [] as SProj[]),
    get<{ player_id: string; count: number }[]>("/v1/players/nfl/trending/add?lookback_hours=168&limit=200").catch(() => []),
    Promise.all(futureWeeks.map((w) => get<SProj[]>(`/projections/nfl/${season}/${w}?season_type=regular&${positionsQuery}`).catch(() => [] as SProj[]))),
    fetch(fcUrl).then((r) => (r.ok ? r.json() : [])).catch(() => []) as Promise<{ player: { sleeperId?: string; name?: string; position?: string; maybeTeam?: string | null; maybeAge?: number | null }; value: number; trend30Day?: number }[]>,
    get<SProj[]>(`/projections/nfl/${season}/${week}?season_type=regular&${specialQuery}`).catch(() => [] as SProj[]),
    get<SProj[]>(`/projections/nfl/${season}?season_type=regular&${specialQuery}`).catch(() => [] as SProj[]),
  ]);
  await tr?.n(market.length);
  // Which games have kicked off this week (Sleeper locks those players), and who is on bye
  await tr?.step(`Loading the ${season} NFL schedule`, `Loaded {n} games on the ${season} schedule`);
  const schedule = await fetch(`https://api.sleeper.com/schedule/nfl/regular/${season}`).then((r) => (r.ok ? r.json() : [])).catch(() => []) as { week: number; home: string; away: string; status: string }[];
  const games: Record<string, "pre_game" | "in_game" | "complete"> = {};
  for (const g of schedule.filter((x) => x.week === week)) {
    const st = g.status === "complete" ? "complete" : g.status === "in_game" ? "in_game" : "pre_game";
    games[g.home] = st; games[g.away] = st;
  }
  // Season grid for every player: opponents all season, projections for the weeks ahead, points for weeks played
  const scoreKey: "ppr" | "half" | "std" = recSetting >= 1 ? "ppr" : recSetting >= 0.5 ? "half" : "std";
  const slateOpp: Record<string, Record<number, string>> = {};
  for (const g of schedule) { (slateOpp[g.home] ??= {})[g.week] = `v${g.away}`; (slateOpp[g.away] ??= {})[g.week] = `@${g.home}`; }
  const slateProj: Record<string, Record<number, number>> = {};
  [weekProj, ...futureProj].forEach((wp, i) => { const w = [week, ...futureWeeks][i]; wp.forEach((p) => { const v = ptsOf(p.stats); if (v && v[scoreKey] > 0) (slateProj[p.player_id] ??= {})[w] = Math.round(v[scoreKey] * 10) / 10; }); });
  await tr?.n(schedule.length);
  await tr?.step("Loading this week's adds and drops", "Loaded {n} trending adds and drops");
  const trendingDrops = await get<{ player_id: string; count: number }[]>("/v1/players/nfl/trending/drop?lookback_hours=168&limit=200").catch(() => []);
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

  await tr?.n(trending.length + trendingDrops.length);
  onStep?.("Loading trades, waivers and past weeks");
  await tr?.step(`Loading ${week} ${week === 1 ? "week" : "weeks"} of trades and matchups`, `Loaded {n} moves over ${week} ${week === 1 ? "week" : "weeks"}`);
  const weeks = Array.from({ length: week }, (_, i) => i + 1);
  const [txnsByWeek, allMatchups] = await Promise.all([
    Promise.all(weeks.map((w) => get<STxn[]>(`/v1/league/${leagueId}/transactions/${w}`).catch(() => [] as STxn[]))),
    Promise.all(weeks.map((w) => get<SMatchup[]>(`/v1/league/${leagueId}/matchups/${w}`).catch(() => [] as SMatchup[]))),
  ]);
  const matchupsByWeek = allMatchups.slice(0, -1);
  const slatePts: Record<string, Record<number, number>> = {};
  matchupsByWeek.forEach((ms, i) => ms.forEach((m) => Object.entries(m.players_points ?? {}).forEach(([pid, v]) => { (slatePts[pid] ??= {})[i + 1] = Math.round(v * 10) / 10; })));
  const thisWeek = live ? allMatchups[allMatchups.length - 1] ?? [] : [];
  const txns = txnsByWeek.flat();
  await tr?.n(txns.length);
  await tr?.step("Reading players from the feeds", "Read {n} players from the feeds");

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
  await tr?.n(Object.keys(players).length);

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
    await tr?.step(`Loading ${missing.length} missing ${missing.length === 1 ? "player" : "players"}`, `Loaded ${missing.length} missing ${missing.length === 1 ? "player" : "players"}`);
    const all = await get<Record<string, SPlayerLite>>("/v1/players/nfl").catch(() => ({} as Record<string, SPlayerLite>));
    missing.forEach((id) => { add(id, all[id], null); if (!players[id]) addSpecial(id, all[id], null); });
  }

  // ---- Value model -------------------------------------------------------------
  // One number per player on a 0-10,000 scale, blended from two independent views:
  //   55%  the trade market (FantasyCalc: real trades, matched to this league's QB format, scoring and size)
  //   45%  our production model: rest-of-season projected points over replacement for THIS league,
  //        read onto the market's own value curve by rank, and held within 0.5x-2x of the market
  // then nudged up to +/-3% by Sleeper add/drop momentum over the past week.
  await tr?.step("Valuing players for this league", "Valued {n} players for this league", { chips: [{ label: "Market 55%", kind: "feed" }, { label: "Projections 45%", kind: "feed" }] });
  let fcScale = 1; // raw FantasyCalc value -> our 0-10,000 scale
  {
    const sk = recSetting >= 1 ? "ppr" : recSetting >= 0.5 ? "half" : "std";
    const teBonus = league.scoring_settings.bonus_rec_te ?? 0;
    const skill = Object.values(players);
    // Rest-of-season points: every remaining week, byes count zero, fantasy playoff weeks count 1.3x
    const rosTotal = (p: Player) => {
      if (weekNums.length < 3) return (p.pts?.[sk] ?? p.proj) * Math.max(1, lastWeek - week + 1);
      let t = 0;
      weekNums.forEach((n, i) => { const w = weeklyBy[i].get(p.id); if (!w) return; t += (w[sk] + (p.pos === "TE" ? w.rec * teBonus : 0)) * (n >= playoffStart ? 1.3 : 1); });
      return t;
    };
    // Replacement level from this league's real starting slots, not a generic 12-team guess
    const share: Record<string, Partial<Record<Pos, number>>> = {
      QB: { QB: 1 }, RB: { RB: 1 }, WR: { WR: 1 }, TE: { TE: 1 },
      FLEX: { RB: 0.45, WR: 0.45, TE: 0.1 }, WRRB_FLEX: { RB: 0.5, WR: 0.5 }, REC_FLEX: { WR: 0.7, TE: 0.3 },
      SUPER_FLEX: { QB: 0.85, RB: 0.05, WR: 0.07, TE: 0.03 },
    };
    const need: Record<Pos, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    league.roster_positions.forEach((slot) => Object.entries(share[slot] ?? {}).forEach(([pos, f]) => (need[pos as Pos] += (f ?? 0) * league.total_rosters)));
    const pts = new Map(skill.map((p) => [p.id, rosTotal(p)]));
    const replacement: Record<Pos, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    (Object.keys(need) as Pos[]).forEach((pos) => {
      const sorted = skill.filter((p) => p.pos === pos).map((p) => pts.get(p.id) ?? 0).sort((a, b) => b - a);
      replacement[pos] = sorted[Math.min(sorted.length - 1, Math.round(need[pos]))] ?? 0;
    });
    const vorp = skill.map((p) => ({ p, v: Math.max(0, (pts.get(p.id) ?? 0) - replacement[p.pos]) })).sort((a, b) => b.v - a.v);
    // The market's value curve: the model's #10 player gets the market's #10 value
    const curve = market.filter((m) => ["QB", "RB", "WR", "TE"].includes(m.player?.position ?? "")).map((m) => m.value).sort((a, b) => b - a);
    const topV = vorp[0]?.v || 1;
    const modelBy = new Map<string, number>();
    vorp.forEach(({ p, v }, i) => {
      let mv = v <= 0 ? 0 : curve.length ? curve[Math.min(i, curve.length - 1)] : (v / topV) * 10000;
      const mk = valueBy.get(p.id);
      if (mk) mv = Math.min(mk * 2, Math.max(mk * 0.5, mv));
      modelBy.set(p.id, mv);
    });
    // Momentum from Sleeper adds minus drops over the past week, capped at +/-3%
    const net = new Map<string, number>();
    trending.forEach((t) => net.set(t.player_id, (net.get(t.player_id) ?? 0) + t.count));
    trendingDrops.forEach((t) => net.set(t.player_id, (net.get(t.player_id) ?? 0) - t.count));
    const maxNet = Math.max(1, ...[...net.values()].map(Math.abs));
    const raw = new Map<string, number>();
    skill.forEach((p) => {
      const mk = valueBy.get(p.id), md = modelBy.get(p.id) ?? 0;
      const blended = mk !== undefined ? 0.55 * mk + 0.45 * md : 0.6 * md; // unpriced breakouts sit below the market until it catches up
      raw.set(p.id, blended * (1 + Math.max(-1, Math.min(1, (net.get(p.id) ?? 0) / maxNet)) * 0.03));
    });
    const scale = 10000 / Math.max(1, ...raw.values());
    fcScale = scale;
    skill.forEach((p) => {
      p.value = Math.round((raw.get(p.id) ?? 0) * scale);
      const mk = valueBy.get(p.id);
      p.fcValue = mk !== undefined ? Math.round(mk * scale) : undefined;
      p.modelValue = Math.round((modelBy.get(p.id) ?? 0) * scale);
    });
  }

  await tr?.n(Object.keys(players).length);
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
      avatar: managerAvatar(u, "thumb", r) ?? undefined,
      photo: avatarSrc(u?.avatar) ?? undefined,
      // Sleeper's players list includes IR and taxi. Split them out so they never count as active.
      roster: (r.players ?? []).filter((id) => players[id] && !r.reserve?.includes(id) && !r.taxi?.includes(id)),
      starters: (r.starters ?? []).filter((id) => !!id && id !== "0" && !!players[id]),
      ir: (r.reserve ?? []).filter((id) => players[id]),
      taxi: (r.taxi ?? []).filter((id) => players[id]),
      special: (r.players ?? []).filter((id) => specials[id] && !r.reserve?.includes(id) && !r.taxi?.includes(id)),
      // The kicker and defense actually set in Sleeper (an empty slot stays empty), so projected totals match Sleeper's
      setSpecial: r.starters?.length ? r.starters.filter((id) => !!specials[id]) : undefined,
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
  // Sleeper keeps IR and taxi counts in settings, not in roster_positions
  const irSlots = league.settings.reserve_slots ?? league.roster_positions.filter((p) => p === "IR").length;
  const specialSlots = league.roster_positions.filter((p) => p === "K" || p === "DEF") as ("K" | "DEF")[];
  const nonBench = league.roster_positions.filter((p) => !["BN", "IR", "TAXI"].includes(p));
  const sleeperSpecial = (myRoster.starters ?? []).filter((id, i) => (nonBench[i] === "K" || nonBench[i] === "DEF") && !!id && id !== "0");
  const taxiSlots = league.settings.taxi_slots ?? league.roster_positions.filter((p) => p === "TAXI").length;

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
  // Kicker and defense claims get their own bucket so a $0 streamer doesn't drag down the Depth range
  const isSpecialId = (id: string) => !players[id] && (/^[A-Z]{2,3}$/.test(id) || !!specials[id] || (kWeek.get(id) ?? kSeason.get(id))?.player?.position === "K");
  const specialBids: number[] = [];
  txns.filter((t) => t.type === "waiver" && t.status === "complete" && t.adds && t.settings?.waiver_bid !== undefined)
    .forEach((t) => Object.keys(t.adds!).forEach((id) => {
      // One decimal, so a $5 kicker claim in a $1,000 league stays $5 instead of rounding to $10
      const pct = Math.round(((t.settings!.waiver_bid ?? 0) / budget) * 1000) / 10;
      if (isSpecialId(id)) specialBids.push(pct); else tiers[tierOf(id)].push(pct);
    }));
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

  // Kickers and defenses worth streaming: the top 8 of each by this week's projection, from the same K/DEF feed the lineup uses
  const specialFreeAgents: SpecialFreeAgent[] = (["K", "DEF"] as const).flatMap((pos) => kdefWeek
    .filter((p) => !rosteredAll.has(p.player_id) && (pos === "DEF" ? /^[A-Z]{2,3}$/.test(p.player_id) : p.player?.position === "K" && !/^[A-Z]{2,3}$/.test(p.player_id)))
    .filter((p) => (p.stats?.pts_ppr ?? 0) > 0 && (p.team || pos === "DEF") && statusOf(p.player?.injury_status).status !== "O")
    .sort((a, b) => (b.stats.pts_ppr ?? 0) - (a.stats.pts_ppr ?? 0)).slice(0, 8)
    .map((p): SpecialFreeAgent => {
      const id = p.player_id, isDef = pos === "DEF";
      const s = kSeason.get(id);
      const gp = Math.max(1, s?.stats?.gp ?? 17);
      const wk = Math.round((p.stats.pts_ppr ?? 0) * 10) / 10;
      const per = Math.round(((s?.stats?.pts_ppr ?? 0) / gp) * 10) / 10 || wk;
      const t = trend.get(id);
      return {
        id, pos, nfl: isDef ? id : p.team ?? p.player?.team ?? "FA",
        name: isDef ? defName(id) : [p.player?.first_name, p.player?.last_name].filter(Boolean).join(" ") || `Kicker ${id}`,
        wk, proj: per, opp: p.opponent ?? undefined, gameDate: p.date ?? undefined, trend: t ? "up" : "flat", adds: t,
        status: statusOf(p.player?.injury_status).status,
        why: `Projects ${wk.toFixed(1)} this week${p.opponent ? ` against ${p.opponent}` : ""} and ${per.toFixed(1)} a week on the season.`,
      };
    }));

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
      // Keep Sleeper's "0" for an empty slot so every starter stays in its own slot (an empty K doesn't shift DEF up)
      starters: (m.starters ?? []).map((id) => id || "0"), players: m.players ?? [], points: m.players_points ?? {},
      total: m.points ?? 0, oppTotal: o?.points ?? undefined, oppName: o ? opponentName(o.roster_id) : undefined,
    };
  });
  const lineupOrder = league.roster_positions.filter((p) => !["BN", "IR", "TAXI"].includes(p));

  // Market board: top 300 by value, with who owns each player in this league
  const ownerOf = new Map<string, string>();
  rosters.forEach((r) => (r.players ?? []).forEach((id) => ownerOf.set(id, String(r.roster_id))));
  const board: BoardRow[] = market.filter((m) => m.player?.sleeperId && ["QB", "RB", "WR", "TE"].includes(m.player.position ?? ""))
    .sort((a, b) => b.value - a.value).slice(0, 300)
    .map((m) => { const id = String(m.player.sleeperId); const p = players[id]; const k = fcScale; // same scale as every other value in the app
      return { id, name: p?.name ?? m.player.name ?? `Player ${id}`, pos: m.player.position!, nfl: p?.nfl ?? m.player.maybeTeam ?? "FA", age: m.player.maybeAge ? Math.floor(m.player.maybeAge) : undefined,
        value: p?.value ?? Math.round(m.value * k), trend: Math.round((m.trend30Day ?? 0) * k), ownerId: ownerOf.get(id), market: p?.fcValue, model: p?.modelValue }; })
    .sort((a, b) => b.value - a.value);

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
    mode: "live", id: league.league_id, name: league.name, season, week, scoring: league.scoring_settings, slots, format, rosterMax, irSlots, taxiSlots, specialSlots, specials, sleeperSpecial, history, weekMatchups: thisWeek.length ? thisWeek : undefined, lineupOrder, lastWeek, board, games, slate: { opp: slateOpp, proj: slateProj, pts: slatePts }, playoffTeams: league.settings.playoff_teams || 6, playoffStart,
    updated: `Sleeper projections, refreshed ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
    deadlines: {
      waivers: wd !== undefined ? `Waivers run ${DAYS[wd] ?? "Wednesday"}` : "Waivers run Wednesday",
      lock: "Lineups lock at each kickoff",
      trade: td && td < 99 ? `Trade deadline Week ${td}` : "No trade deadline",
    },
    byeTeams, teams, players, sleeperSet, slotHistory,
    // Sleeper's own suggested bid only reaches its mobile app through a signed-in private endpoint, so Sources sizes it
    faab: { enabled: faabEnabled, budget, remaining: Math.max(0, budget - (myRoster.settings.waiver_budget_used ?? 0)), priority: myRoster.settings.waiver_position, source: "Sources" },
    faabHistory, freeAgents, specialFreeAgents, specialBids, trades, activity, offers: null, username, type: leagueType(league),
    opponentId: opp ? String(opp.roster_id) : undefined,
    userPhoto: avatarSrc(userBy.get(userId)?.avatar) ?? undefined,
    userAvatar: managerAvatar(userBy.get(userId), "thumb", rosters.find((r) => r.owner_id === userId || r.co_owners?.includes(userId))) ?? undefined,
    champion: await champP,
    valueSource: valueBy.size ? `Blended value: 55% trade market (FantasyCalc, ${dynasty ? "dynasty" : "redraft"}, ${sfLeague ? "Superflex" : "1QB"}, ${league.total_rosters} teams), 45% rest-of-season production over replacement, plus up to 3% Sleeper add/drop momentum` : "Rest-of-season production over replacement (market values unavailable)",
    rosWeeks: weekNums.length,
  };
}
