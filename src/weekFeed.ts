// Shared per-week Sleeper feeds, kept in memory so the Lineup week browser, the opponent's threats, Waivers and the
// player sheet all read the same numbers and only fetch each week once.
//  - weekFeed(week, "stats" | "projections"): every player's line for that week (fetchWeekRows), keyed by Sleeper id
//  - weekMatchups(week): the league's matchups for that week; the same matchup_id means two teams play each other
// A failed call is dropped right away so the next try goes back to Sleeper.
import { LEAGUE, WEEK } from "./data";
import { fetchWeekRows, WeekRow } from "./sleeper";

type Entry<T> = { at: number; p: Promise<T> };
function keep<T>(store: Map<string, Entry<T>>, key: string, ttl: number, run: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.p;
  const p = run();
  store.set(key, { at: Date.now(), p });
  p.catch(() => { if (store.get(key)?.p === p) store.delete(key); });
  return p;
}

const feeds = new Map<string, Entry<Map<string, WeekRow>>>();
/** One week of Sleeper stats or projections for every player. Past weeks never change, so they're kept for the session;
 *  this week's stats move during games (a minute), and projections for this week and ahead get revised (30 minutes). */
export function weekFeed(week: number, kind: "stats" | "projections"): Promise<Map<string, WeekRow>> {
  const ttl = week < WEEK ? Infinity : kind === "stats" ? 60_000 : 30 * 60_000;
  return keep(feeds, `${LEAGUE.season}|${week}|${kind}`, ttl, () => fetchWeekRows(LEAGUE.season, week, kind));
}

/** A league matchup row as Sleeper sends it (only the fields we read). */
export interface SMatchupRow { roster_id: number; matchup_id?: number | null; starters?: string[] | null; players?: string[] | null; players_points?: Record<string, number> | null; points?: number | null }
const matchups = new Map<string, Entry<SMatchupRow[]>>();
/** GET /v1/league/<id>/matchups/<week>. Finished weeks are kept for the session; this week and ahead for 10 minutes. */
export function weekMatchups(week: number): Promise<SMatchupRow[]> {
  const ttl = week < WEEK ? Infinity : 10 * 60_000;
  return keep(matchups, `${LEAGUE.id}|${week}`, ttl, async () => {
    const r = await fetch(`https://api.sleeper.app/v1/league/${LEAGUE.id}/matchups/${week}`);
    if (!r.ok) throw new Error(`Sleeper matchups ${r.status}`);
    return ((await r.json()) as SMatchupRow[] | null) ?? [];
  });
}
export const clearWeekFeeds = () => { feeds.clear(); matchups.clear(); };
