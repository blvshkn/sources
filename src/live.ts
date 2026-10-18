import { useEffect, useState } from "react";
import { GameState, LEAGUE, WEEK, YOU, OPPONENT_ID, teamById, playerById, PLAYERS, Team, SpecialPlayer } from "./data";
import { eff, lineupFor, specialLineup, specialPts } from "./engine";

/** Live scoring for this week: points so far per player and per team, and each NFL team's game state. */
export interface Live {
  points: Record<string, number>;
  games: Record<string, GameState>;
  teamPts: Record<string, number>;
  /** Share of each live game still to play, 0 to 1, by NFL team. From ESPN's public scoreboard (Sleeper has no clock). */
  left: Record<string, number>;
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

/** Where a live player is on pace to finish: points so far plus his projection for the part of the game left. */
export const onPace = (pts: number, proj: number, left: number | undefined) => (left === undefined ? null : pts + proj * left);

type SMatchup = { roster_id: number; players_points?: Record<string, number> | null; points?: number | null };
type SGame = { week: number; home: string; away: string; status: string };

const anyLive = (g: Record<string, GameState>) => Object.values(g).some((s) => s === "in_game");
const anyLeft = (g: Record<string, GameState>) => Object.values(g).some((s) => s !== "complete");

function seed(): Live {
  if (LEAGUE?.mode === "demo") return demo();
  const h = LEAGUE?.history?.[WEEK];
  const teamPts: Record<string, number> = {};
  if (h) { teamPts[YOU.id] = h.total; if (OPPONENT_ID && h.oppTotal !== undefined) teamPts[OPPONENT_ID] = h.oppTotal; }
  return { points: h?.points ?? {}, games: LEAGUE?.games ?? {}, teamPts, left: {}, at: Date.now() };
}

/** Sample data so the demo league shows what a Sunday looks like: one game final, one in progress. */
function demo(): Live {
  const games: Record<string, GameState> = {};
  const points: Record<string, number> = {};
  const teamPts: Record<string, number> = {};
  const done = ["MIA", "KC", "CAR", "BAL", "IND"]; const live = ["BUF", "CIN", "PHI", "TB"];
  done.forEach((t) => (games[t] = "complete")); live.forEach((t) => (games[t] = "in_game"));
  const left: Record<string, number> = { BUF: 0.4, CIN: 0.55, PHI: 0.25, TB: 0.6 };
  const sideTotal = (ids: string[]) => ids.reduce((a, id) => {
    const p = LEAGUE.players[id]; if (!p) return a;
    const g = games[p.nfl]; if (!g) return a;
    // Spread outcomes so the sample Sunday shows every state: some past their projection, some close, some short
    const h = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) / 4294967295;
    const pts = Math.round(eff(p, true) * (g === "complete" ? 0.6 + h * 0.9 : 0.35 + h * 0.8) * 10) / 10;
    points[id] = pts; return a + pts;
  }, 0);
  // Everyone on a roster gets points; only starters count toward the team score
  const starters = (ids: string[]) => lineupFor(ids, true).slots.map((x) => x.player?.id).filter(Boolean) as string[];
  sideTotal(YOU.roster); teamPts[YOU.id] = Math.round(starters(YOU.roster).reduce((a, id) => a + (points[id] ?? 0), 0) * 10) / 10;
  if (OPPONENT_ID) { const r = teamById(OPPONENT_ID).roster; sideTotal(r); teamPts[OPPONENT_ID] = Math.round(starters(r).reduce((a, id) => a + (points[id] ?? 0), 0) * 10) / 10; }
  return { points, games, teamPts, left, at: Date.now() };
}

async function poll(): Promise<Live | null> {
  try {
    const [ms, sched, left] = await Promise.all([
      fetch(`https://api.sleeper.app/v1/league/${LEAGUE.id}/matchups/${WEEK}`).then((r) => (r.ok ? r.json() : null)) as Promise<SMatchup[] | null>,
      fetch(`https://api.sleeper.com/schedule/nfl/regular/${LEAGUE.season}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<SGame[] | null>,
      Promise.resolve({} as Record<string, number>),
    ]);
    if (!ms) return null;
    const points: Record<string, number> = {}; const teamPts: Record<string, number> = {};
    ms.forEach((m) => { Object.assign(points, m.players_points ?? {}); teamPts[String(m.roster_id)] = m.points ?? 0; });
    const games: Record<string, GameState> = { ...(LEAGUE.games ?? {}) };
    (sched ?? []).filter((g) => g.week === WEEK).forEach((g) => {
      const st: GameState = g.status === "complete" ? "complete" : g.status === "in_game" ? "in_game" : "pre_game";
      games[g.home] = st; games[g.away] = st;
    });
    const prevGames = current?.games ?? {};
    for (const [t, st] of Object.entries(games)) if (st === "in_game" && prevGames[t] !== "in_game" && !firstLive[t]) firstLive[t] = Date.now();
    const clock = Object.keys(left).length ? left : await clocks(games);
    return { points, games, teamPts, left: clock, at: Date.now() };
  } catch { return null; }
}

let current: Live | null = null;
let currentLeague = "";
const subs = new Set<(l: Live) => void>();
let timer: number | undefined;

function schedule() {
  window.clearTimeout(timer);
  if (!current || LEAGUE.mode !== "live" || !anyLeft(current.games)) return;
  // Every minute while a game is on, every 5 minutes otherwise (to catch kickoffs)
  const wait = anyLive(current.games) ? 60_000 : 300_000;
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
      // The saved league only has your team's points, so fetch every team's live points (and the clock) right away
      // instead of waiting a minute for the first poll
      if (LEAGUE.mode === "live" && anyLeft(current.games)) poll().then((n) => { if (n) { current = n; subs.forEach((f) => f(n)); } });
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
  const p = playerById(id), st = live.games[p.nfl], now = live.points[id] ?? 0, pr = eff(p, true);
  // Points not in yet (first refresh still loading): fall back to the projection rather than counting a zero
  if (live.points[id] === undefined) return pr;
  if (st === "complete") return now;
  if (st === "in_game") return onPace(now, pr, live.left?.[p.nfl]) ?? Math.max(now, pr);
  return pr;
};
/** Share of the projection still to be played, so the win chance tightens as games finish. */
export const stillToPlay = (live: Live, ids: (string | null)[]) => ids.reduce((a, id) => {
  if (!id) return a; const p = playerById(id), st = live.games[p.nfl], pr = eff(p, true);
  return a + (st === "complete" ? 0 : st === "in_game" ? pr * (live.left?.[p.nfl] ?? 0.5) : pr);
}, 0);

/** The lineup a team actually set in Sleeper (skill players), falling back to the best projected lineup. */
export const startersOf = (t: Team): string[] => {
  const set = (t.starters ?? []).filter((id) => PLAYERS[id]);
  return set.length ? set : (lineupFor(t.roster, true).slots.map((x) => x.player?.id).filter(Boolean) as string[]);
};

export interface Outlook { expected: number; scored: number; variance: number }
/** One player's outcome spread: about 0.8 of his projection, shrinking with the share of his game left. */
const SPREAD = 0.8;
function addPlayer(o: Outlook, live: Live, id: string, nfl: string, pr: number) {
  const st = live.games[nfl], pts = live.points[id], known = pts !== undefined;
  const frac = st === "complete" ? 0 : st === "in_game" ? live.left?.[nfl] ?? 0.5 : 1;
  o.expected += !known ? pr : st === "complete" ? pts : st === "in_game" ? pts + pr * frac : pr;
  o.scored += known ? pts : 0;
  o.variance += (SPREAD * pr) ** 2 * frac;
}
/** Expected finish, points so far and outcome variance for a list of starters plus K/DEF. */
export function outlookOf(live: Live, ids: (string | null)[], specials: (SpecialPlayer | null)[]): Outlook {
  const o: Outlook = { expected: 0, scored: 0, variance: 0 };
  for (const id of ids) if (id && PLAYERS[id]) { const p = playerById(id); addPlayer(o, live, id, p.nfl, eff(p, true)); }
  for (const sp of specials) if (sp) addPlayer(o, live, sp.id, sp.nfl, specialPts(sp));
  return o;
}
export const teamOutlook = (live: Live, t: Team) => outlookOf(live, startersOf(t), specialLineup(t).slots.map((x) => x.player));
/** Chance team A beats team B, from expected finishes and how much is still to be played. Matches Sleeper's style of read. */
export function winChance(a: Outlook, b: Outlook): number {
  const sd = Math.sqrt(a.variance + b.variance), d = a.expected - b.expected;
  if (sd < 0.01) return d > 0 ? 100 : d < 0 ? 0 : 50;
  const x = d / sd, t = 1 / (1 + 0.2316419 * Math.abs(x)), n = 0.3989423 * Math.exp(-x * x / 2);
  const tail = n * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return Math.min(99.5, Math.max(0.5, (x > 0 ? 1 - tail : tail) * 100));
}
