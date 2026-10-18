import { useEffect, useState } from "react";
import { GameState, LEAGUE, WEEK, YOU, OPPONENT_ID, teamById } from "./data";
import { eff, lineupFor } from "./engine";

/** Live scoring for this week: points so far per player and per team, and each NFL team's game state. */
export interface Live {
  points: Record<string, number>;
  games: Record<string, GameState>;
  teamPts: Record<string, number>;
  at: number;
}

type SMatchup = { roster_id: number; players_points?: Record<string, number> | null; points?: number | null };
type SGame = { week: number; home: string; away: string; status: string };

const anyLive = (g: Record<string, GameState>) => Object.values(g).some((s) => s === "in_game");
const anyLeft = (g: Record<string, GameState>) => Object.values(g).some((s) => s !== "complete");

function seed(): Live {
  if (LEAGUE?.mode === "demo") return demo();
  const h = LEAGUE?.history?.[WEEK];
  const teamPts: Record<string, number> = {};
  if (h) { teamPts[YOU.id] = h.total; if (OPPONENT_ID && h.oppTotal !== undefined) teamPts[OPPONENT_ID] = h.oppTotal; }
  return { points: h?.points ?? {}, games: LEAGUE?.games ?? {}, teamPts, at: Date.now() };
}

/** Sample data so the demo league shows what a Sunday looks like: one game final, one in progress. */
function demo(): Live {
  const games: Record<string, GameState> = {};
  const points: Record<string, number> = {};
  const teamPts: Record<string, number> = {};
  const done = ["MIA", "KC", "CAR", "BAL", "IND"]; const live = ["BUF", "CIN", "PHI", "TB"];
  done.forEach((t) => (games[t] = "complete")); live.forEach((t) => (games[t] = "in_game"));
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
  return { points, games, teamPts, at: Date.now() };
}

async function poll(): Promise<Live | null> {
  try {
    const [ms, sched] = await Promise.all([
      fetch(`https://api.sleeper.app/v1/league/${LEAGUE.id}/matchups/${WEEK}`).then((r) => (r.ok ? r.json() : null)) as Promise<SMatchup[] | null>,
      fetch(`https://api.sleeper.com/schedule/nfl/regular/${LEAGUE.season}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<SGame[] | null>,
    ]);
    if (!ms) return null;
    const points: Record<string, number> = {}; const teamPts: Record<string, number> = {};
    ms.forEach((m) => { Object.assign(points, m.players_points ?? {}); teamPts[String(m.roster_id)] = m.points ?? 0; });
    const games: Record<string, GameState> = { ...(LEAGUE.games ?? {}) };
    (sched ?? []).filter((g) => g.week === WEEK).forEach((g) => {
      const st: GameState = g.status === "complete" ? "complete" : g.status === "in_game" ? "in_game" : "pre_game";
      games[g.home] = st; games[g.away] = st;
    });
    return { points, games, teamPts, at: Date.now() };
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
    if (!current || currentLeague !== `${LEAGUE.id}:${WEEK}`) { current = seed(); currentLeague = `${LEAGUE.id}:${WEEK}`; schedule(); }
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
