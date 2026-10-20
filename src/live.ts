import { useEffect, useState } from "react";
import { GameState, LEAGUE, WEEK, YOU, OPPONENT_ID, teamById, playerById, PLAYERS, Team, SpecialPlayer, onBye, SLEEPER_SET } from "./data";
import { eff, isOut, lineupFor, scored, specialPts, startedSpecials } from "./engine";
import { countPlays, fromMatchups, isFinal, passScore, resultOf, sleeperLiveProj, winPct, type PlayCount, type Result, type SleeperMatchupRow } from "./liveMath";
export type { PlayCount, Result } from "./liveMath";

/** Live scoring for this week: points so far per player and per team, and each NFL team's game state. */
export interface Live {
  points: Record<string, number>;
  games: Record<string, GameState>;
  teamPts: Record<string, number>;
  /** Share of each live game still to play, 0 to 1, by NFL team. From ESPN's public scoreboard (Sleeper has no clock). */
  left: Record<string, number>;
  /** This week's projections, re-read from Sleeper while games are on (Sleeper revises them during games), scored
   *  for this league. Falls back to the projections loaded with the league. */
  proj?: Record<string, number>;
  at: number;
}

// ESPN abbreviations that differ from Sleeper's
const ESPN_FIX: Record<string, string> = { WSH: "WAS", LA: "LAR", JAC: "JAX" };
type EComp = { status?: { period?: number; clock?: number; type?: { state?: string } }; competitors?: { team?: { abbreviation?: string } }[] };
/** When this session first saw each game go live. Last resort for the clock when every source is down. */
const firstLive: Record<string, number> = {};
const GAME_MS = 190 * 60 * 1000; // a typical NFL game, kickoff to final

/** Fraction of each in-progress game left. Our server route tries Sleeper's scores feed, then ESPN, then ESPN's CDN;
 *  if that fails the browser asks ESPN directly; if that fails too, estimate from when the game went live. */
async function clocks(games?: Record<string, GameState>): Promise<Record<string, number>> {
  try {
    const r = await fetch(`/api/game-clock?season=${LEAGUE.season}&week=${WEEK}`);
    if (r.ok) { const d = await r.json() as { teams?: Record<string, number> }; if (d.teams && Object.keys(d.teams).length) return d.teams; }
  } catch { /* fall through */ }
  try {
    const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard");
    if (r.ok) {
      const d = await r.json() as { events?: { competitions?: EComp[] }[] };
      const out: Record<string, number> = {};
      for (const e of d.events ?? []) for (const c of e.competitions ?? []) {
        if (c.status?.type?.state !== "in") continue;
        const q = c.status.period ?? 1, sec = c.status.clock ?? 0;
        const left = q > 4 ? 0 : Math.max(0, Math.min(1, ((4 - q) * 900 + sec) / 3600));
        for (const t of c.competitors ?? []) { const a = t.team?.abbreviation; if (a) out[ESPN_FIX[a] ?? a] = left; }
      }
      if (Object.keys(out).length) return out;
    }
  } catch { /* fall through */ }
  // Estimate: only for games this session watched kick off, so the guess has a real start time
  const out: Record<string, number> = {}, now = Date.now();
  for (const [t, st] of Object.entries(games ?? {})) if (st === "in_game" && firstLive[t]) out[t] = Math.max(0.05, 1 - (now - firstLive[t]) / GAME_MS);
  return out;
}

/** Where a live player is projected to finish, the way Sleeper's matchup page projects him (see liveMath.ts). */
export const onPace = (pts: number, proj: number, left: number | undefined) => (left === undefined ? null : sleeperLiveProj(pts, proj, left));

/** This week's projection for a player or K/DEF: Sleeper's latest number when we have one, else the loaded one. */
const projOf = (live: Live, id: string, loaded: number) => live.proj?.[id] ?? loaded;

// Sleeper revises projections during games, so re-read them every few minutes while a game is live
const PROJ_MS = 3 * 60 * 1000;
let projAt = 0, projLeague = "", projCache: Record<string, number> | undefined;
type SProjRow = { player_id: string; stats?: { pts_ppr?: number; pts_half_ppr?: number; pts_std?: number; rec?: number } };
async function freshProj(): Promise<Record<string, number> | undefined> {
  const key = `${LEAGUE.id}:${WEEK}`;
  if (projLeague === key && Date.now() - projAt < PROJ_MS) return projCache;
  try {
    const q = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&");
    const r = await fetch(`https://api.sleeper.app/projections/nfl/${LEAGUE.season}/${WEEK}?season_type=regular&${q}`);
    if (!r.ok) return projCache;
    const rows = await r.json() as SProjRow[];
    const out: Record<string, number> = {};
    for (const row of rows) {
      const st = row.stats, id = row.player_id;
      if (!st || st.pts_ppr === undefined) continue;
      const p = PLAYERS[id], sp = LEAGUE.specials?.[id];
      if (p) out[id] = isOut(p, true) ? 0 : scored({ pos: p.pos, proj: p.proj, pts: p.pts, wk: { ppr: st.pts_ppr ?? 0, half: st.pts_half_ppr ?? 0, std: st.pts_std ?? 0, rec: st.rec ?? 0 } }, true);
      else if (sp) out[id] = sp.status === "O" ? 0 : st.pts_ppr ?? 0;
    }
    projAt = Date.now(); projLeague = key; projCache = out;
  } catch { /* keep the last good read */ }
  return projCache;
}

type SGame = { week: number; home: string; away: string; status: string };

const anyLive = (g: Record<string, GameState>) => Object.values(g).some((s) => s === "in_game");
const anyLeft = (g: Record<string, GameState>) => Object.values(g).some((s) => s !== "complete");

function seed(): Live {
  if (LEAGUE?.mode === "demo") return demo();
  // Every roster's points from this week's matchups, loaded with the league. The history entry only has your
  // own players' points, so it's the fallback for a league saved before weekMatchups existed.
  if (LEAGUE?.weekMatchups?.length) return { ...fromMatchups(LEAGUE.weekMatchups), games: LEAGUE.games ?? {}, left: {}, at: Date.now() };
  const h = LEAGUE?.history?.[WEEK];
  const teamPts: Record<string, number> = {};
  if (h) { teamPts[YOU.id] = h.total; if (OPPONENT_ID && h.oppTotal !== undefined) teamPts[OPPONENT_ID] = h.oppTotal; }
  return { points: h?.points ?? {}, games: LEAGUE?.games ?? {}, teamPts, left: {}, at: Date.now() };
}

/** Demo only: localStorage sources.fixture = "final-week" turns the sample Sunday into a finished week, every
 *  game final, with the matchup rows ordered opponent first, the way a real league's roster_ids can fall. */
const finalFixture = () => { try { return localStorage.getItem("sources.fixture") === "final-week"; } catch { return false; } };

/** Sample data so the demo league shows what a Sunday looks like: one game final, one in progress. */
function demo(): Live {
  const games: Record<string, GameState> = {};
  const points: Record<string, number> = {};
  const teamPts: Record<string, number> = {};
  const fin = finalFixture();
  const done = ["MIA", "KC", "CAR", "BAL", "IND"]; const live = ["BUF", "CIN", "PHI", "TB"];
  done.forEach((t) => (games[t] = "complete")); live.forEach((t) => (games[t] = "in_game"));
  const left: Record<string, number> = fin ? {} : { BUF: 0.4, CIN: 0.55, PHI: 0.25, TB: 0.6 };
  if (fin) {
    // Every team with a game this week is final; byes stay off the schedule
    const nfls = new Set([...Object.values(LEAGUE.players).map((p) => p.nfl), ...Object.values(LEAGUE.specials ?? {}).map((p) => p.nfl)]);
    nfls.forEach((t) => { if (t && t !== "FA" && !onBye(t)) games[t] = "complete"; });
  }
  const sideTotal = (ids: string[]) => ids.reduce((a, id) => {
    const p = LEAGUE.players[id]; if (!p) return a;
    const g = games[p.nfl]; if (!g) return a;
    // Spread outcomes so the sample Sunday shows every state: some past their projection, some close, some short
    const h = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) / 4294967295;
    const pts = Math.round(eff(p, true) * (g === "complete" ? 0.6 + h * 0.9 : 0.35 + h * 0.8) * 10) / 10;
    points[id] = pts; return a + pts;
  }, 0);
  // Everyone on a roster gets points; only the starters set in Sleeper count toward the team score. Built as
  // Sleeper's matchup rows and read back through fromMatchups, the same path a live league takes.
  const row = (t: Team): SleeperMatchupRow => {
    sideTotal(t.roster);
    const sp = specialsOf(t).filter((x): x is SpecialPlayer => !!x);
    sp.forEach((x) => { if (games[x.nfl] && points[x.id] === undefined) points[x.id] = Math.round(specialPts(x) * (games[x.nfl] === "complete" ? 1.1 : 0.5) * 10) / 10; });
    const starters = [...startersOf(t), ...sp.map((x) => x.id)];
    const starters_points = starters.map((id) => points[id] ?? 0);
    const players_points: Record<string, number> = {};
    [...t.roster, ...sp.map((x) => x.id)].forEach((id) => { if (points[id] !== undefined) players_points[id] = points[id]; });
    return { roster_id: t.id, matchup_id: 1, starters, starters_points, players: t.roster, players_points, points: Math.round(starters_points.reduce((a, n) => a + n, 0) * 100) / 100 };
  };
  const rows = [row(YOU)];
  if (OPPONENT_ID) rows[fin ? "unshift" : "push"](row(teamById(OPPONENT_ID)));
  Object.assign(teamPts, fromMatchups(rows).teamPts);
  return { points, games, teamPts, left, at: Date.now() };
}

async function poll(): Promise<Live | null> {
  try {
    const [ms, sched, left] = await Promise.all([
      fetch(`https://api.sleeper.app/v1/league/${LEAGUE.id}/matchups/${WEEK}`).then((r) => (r.ok ? r.json() : null)) as Promise<SleeperMatchupRow[] | null>,
      fetch(`https://api.sleeper.com/schedule/nfl/regular/${LEAGUE.season}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<SGame[] | null>,
      Promise.resolve({} as Record<string, number>),
    ]);
    if (!ms) return null;
    const { points, teamPts } = fromMatchups(ms);
    const games: Record<string, GameState> = { ...(LEAGUE.games ?? {}) };
    (sched ?? []).filter((g) => g.week === WEEK).forEach((g) => {
      const st: GameState = g.status === "complete" ? "complete" : g.status === "in_game" ? "in_game" : "pre_game";
      games[g.home] = st; games[g.away] = st;
    });
    const prevGames = current?.games ?? {};
    for (const [t, st] of Object.entries(games)) if (st === "in_game" && prevGames[t] !== "in_game" && !firstLive[t]) firstLive[t] = Date.now();
    const [clock, proj] = await Promise.all([Object.keys(left).length ? left : clocks(games), anyLive(games) ? freshProj() : Promise.resolve(projCache)]);
    return { points, games, teamPts, left: clock, proj, at: Date.now() };
  } catch { return null; }
}

let current: Live | null = null;
let currentLeague = "";
const subs = new Set<(l: Live) => void>();
let timer: number | undefined;

function schedule() {
  window.clearTimeout(timer);
  if (!current || LEAGUE.mode !== "live" || !anyLeft(current.games)) return;
  // Every 15 seconds while a game is on, so scores and win chance move with Sleeper; every 2 minutes otherwise to catch kickoffs
  const wait = anyLive(current.games) ? 15_000 : 120_000;
  timer = window.setTimeout(async () => {
    if (document.visibilityState === "visible") {
      const next = await poll();
      if (next) { current = next; subs.forEach((f) => f(next)); }
    }
    schedule();
  }, wait);
}

/** Live scoring that refreshes itself while games are on. Shared across every component that uses it. */
export function useLive(): Live {
  const [v, setV] = useState<Live>(() => {
    if (!current || currentLeague !== `${LEAGUE.id}:${WEEK}`) {
      current = seed(); currentLeague = `${LEAGUE.id}:${WEEK}`; schedule();
      // Fetch every team's points (and the clock) right away instead of waiting for the first poll. A finished
      // week gets this one read too, so a league saved mid-week still ends on Sleeper's final scores.
      if (LEAGUE.mode === "live") poll().then((n) => { if (n) { current = n; subs.forEach((f) => f(n)); } });
    }
    return current;
  });
  useEffect(() => {
    subs.add(setV);
    // Catch up right away when the app comes back to the foreground on game day
    const vis = async () => { if (document.visibilityState === "visible" && LEAGUE.mode === "live" && current && anyLeft(current.games)) { const n = await poll(); if (n) { current = n; subs.forEach((f) => f(n)); schedule(); } } };
    document.addEventListener("visibilitychange", vis);
    return () => { subs.delete(setV); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return v;
}

/** A player's game right now: live with points so far, final, or not started. */
export function playerLive(l: Live, id: string, nfl: string): { state: GameState | null; pts: number } {
  const state = l.games[nfl] ?? null;
  return { state, pts: l.points[id] ?? 0 };
}

/** What a player is expected to finish with right now: his points once final, his on-pace finish while live,
 *  his projection before kickoff. Totals, edges and win chance all use this so they move with the games. */
export const expect = (live: Live, id: string | null) => {
  if (!id) return 0;
  const p = playerById(id), st = live.games[p.nfl], now = live.points[id] ?? 0, pr = projOf(live, id, eff(p, true));
  // Points not in yet (first refresh still loading): fall back to the projection rather than counting a zero
  if (live.points[id] === undefined) return pr;
  if (st === "complete") return now;
  if (st === "in_game") return onPace(now, pr, live.left?.[p.nfl]) ?? Math.max(now, pr);
  return pr;
};
/** How many starters are finished, playing right now, and yet to kick off, by their NFL teams. Byes count as done. */
export const playCount = (live: Live, nfls: (string | null | undefined)[]): PlayCount => countPlays(live.games, onBye, nfls);

/** Projected points still to come from these starters: Sleeper's live projection minus points so far. */
export const stillToPlay = (live: Live, ids: (string | null)[]) => ids.reduce((a, id) => {
  if (!id) return a; const p = playerById(id), st = live.games[p.nfl], pr = projOf(live, id, eff(p, true)), now = live.points[id] ?? 0;
  return a + (st === "complete" ? 0 : st === "in_game" ? Math.max(0, (onPace(now, pr, live.left?.[p.nfl]) ?? pr) - now) : pr);
}, 0);

/** The lineup a team actually set in Sleeper (skill players), falling back to the best projected lineup. */
export const startersOf = (t: Team): string[] => {
  const own = t.starters?.length ? t.starters : t.id === YOU.id ? Object.values(SLEEPER_SET ?? {}).flat() : [];
  const set = own.filter((id) => PLAYERS[id]);
  return set.length ? set : (lineupFor(t.roster, true).slots.map((x) => x.player?.id).filter(Boolean) as string[]);
};

export interface Outlook { expected: number; scored: number; variance: number }
/** How much each starter's score can swing, as a share of his projection, by position. Used for the player spread
 *  in PlayerDepth. Win chance no longer uses it: it follows Sleeper's own team-level formula (sleeperWinProb).
 *  `variance` on an Outlook is kept as this per-player sum for those displays. */
export const SWING: Record<string, number> = { QB: 0.472, RB: 0.85, WR: 0.978, TE: 0.603, K: 0, DEF: 2.126 };
function addPlayer(o: Outlook, live: Live, id: string, nfl: string, pr: number, pos: string) {
  const st = live.games[nfl], pts = live.points[id], known = pts !== undefined;
  pr = projOf(live, id, pr);
  const frac = st === "complete" ? 0 : st === "in_game" ? live.left?.[nfl] ?? 0.5 : 1;
  // Live players finish where Sleeper projects them; a finished game counts its points; otherwise the projection
  o.expected += !known ? pr : st === "complete" ? pts : st === "in_game" ? sleeperLiveProj(pts, pr, frac) : pr;
  o.scored += known ? pts : 0;
  o.variance += ((SWING[pos] ?? 0.85) * pr * frac) ** 2;
}
/** Expected finish, points so far and outcome variance for a list of starters plus K/DEF. */
export function outlookOf(live: Live, ids: (string | null)[], specials: (SpecialPlayer | null)[]): Outlook {
  const o: Outlook = { expected: 0, scored: 0, variance: 0 };
  // Unrounded, like Sleeper adds them up
  for (const id of ids) if (id && PLAYERS[id]) { const p = playerById(id); addPlayer(o, live, id, p.nfl, isOut(p, true) ? 0 : scored(p, true), p.pos); }
  for (const sp of specials) if (sp) addPlayer(o, live, sp.id, sp.nfl, specialPts(sp), sp.pos);
  return o;
}
/** Outlook for a week that hasn't started: each starter's projection and his position's swing, no live points.
 *  Feeds winChance for future weeks so their win % uses the same model as this week's. */
export function projOutlook(starters: { pos: string; pts: number | null }[]): Outlook {
  const o: Outlook = { expected: 0, scored: 0, variance: 0 };
  for (const s of starters) { const pr = s.pts ?? 0; o.expected += pr; o.variance += ((SWING[s.pos] ?? 0.85) * pr) ** 2; }
  return o;
}
/** Every K/DEF a team starts in Sleeper; best projected only for a slot Sleeper left empty. */
export const specialsOf = (t: Team) => startedSpecials(t).map((x) => x.player);
export const teamOutlook = (live: Live, t: Team) => outlookOf(live, startersOf(t), specialsOf(t));
/** Chance team A beats team B, as a percent, computed the way Sleeper's matchup page does it from each side's
 *  points so far and projected finish (sleeperWinProb). 1 to 99 until both sides are final. */
export function winChance(a: Outlook, b: Outlook): number {
  return winPct(a.scored, a.expected, b.scored, b.expected, false);
}

/** One side's header numbers this week: points scored and projected finish, passed through Sleeper's team score
 *  for that roster (see passScore), and how many of its starters are done, live or still to play. */
export interface SideScore { scored: number; proj: number; count: PlayCount }
export function sideScore(live: Live, t: Team, ids: (string | null)[] = startersOf(t), sp: (SpecialPlayer | null)[] = specialsOf(t), useSleeper = true): SideScore {
  const o = outlookOf(live, ids, sp);
  const nfls = [...ids.map((id) => (id && PLAYERS[id] ? PLAYERS[id].nfl : null)), ...sp.map((x) => x?.nfl)];
  return { ...passScore(useSleeper ? live.teamPts[t.id] : undefined, o.scored, o.expected), count: playCount(live, nfls) };
}

/** This week's matchup as every view shows it: the Wire card, the Lineup strip, the full matchup and the inbox.
 *  Final once every starter on both sides is done; then win % is 100, 0 or 50 from the scores. */
export interface MatchScore { me: SideScore; opp: SideScore | null; final: boolean; chance: number | null; result: Result | null }
export function scoreMatch(me: SideScore, opp: SideScore | null): MatchScore {
  if (!opp) return { me, opp: null, final: false, chance: null, result: null };
  const final = isFinal(me.count, opp.count);
  return { me, opp, final, chance: winPct(me.scored, me.proj, opp.scored, opp.proj, final), result: final ? resultOf(me.scored, opp.scored) : null };
}
export const matchNow = (live: Live): MatchScore => {
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  return scoreMatch(sideScore(live, YOU), opp ? sideScore(live, opp) : null);
};
/** Bar and label tone for a win percent: a final reads its result, a live or pregame chance its lean. */
export const chanceTone = (m: Pick<MatchScore, "final" | "chance" | "result">): "up" | "down" | "even" =>
  m.result ? m.result.tone : (m.chance ?? 50) >= 55 ? "up" : (m.chance ?? 50) <= 45 ? "down" : "even";
