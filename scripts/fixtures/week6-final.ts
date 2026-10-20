// Week 6, 2026, Go Buck Yourself, after Monday night: the shape of Sleeper's /v1/league/<id>/matchups/6.
// Points are Sleeper's finals as its matchup page shows them (Blevishkin 137.30, ChefAndreNapier 138.74).
// Player ids are stand-ins (the sandbox can't reach the Sleeper API); the row shape and the order are real:
// rows come sorted by roster_id, so the opponent (roster 3) comes before Zach (roster 7), and other matchups
// sit in between. Only matchup_id pairs teams.
import type { SleeperMatchupRow } from "../../src/liveMath.ts";

const side = (ids: [string, string, number][]) => ({
  starters: ids.map((x) => x[0]),
  starters_points: ids.map((x) => x[2]),
  nfl: Object.fromEntries(ids.map((x) => [x[0], x[1]])),
});
// QB, RB, RB, WR, WR, TE, FLEX, FLEX, K, DEF
export const chef = side([
  ["7523", "JAX", 28.34], ["11630", "JAX", 24.7], ["12500", "DEN", 14.6], ["8137", "DAL", 13.3], ["11624", "KC", 14.3],
  ["7553", "ARI", 12.3], ["4217", "SF", 17.9], ["1466", "KC", 9.3], ["11533", "DAL", 1.0], ["LAR", "LAR", 3.0],
]);
export const zach = side([
  ["4984", "BUF", 18.3], ["8138", "BUF", 24.3], ["8150", "ARI", 5.8], ["7525", "PHI", 20.5], ["12519", "CAR", 15.7],
  ["5022", "PHI", 12.1], ["12514", "WAS", 15.7], ["4035", "NO", 14.9], ["2747", "SEA", 7.0], ["SEA", "SEA", 3.0],
]);
const pts = (s: typeof chef, bench: Record<string, number>) => ({ ...Object.fromEntries(s.starters.map((id, i) => [id, s.starters_points[i]])), ...bench });

export const ZACH_ROSTER = 7, CHEF_ROSTER = 3;
export const rows: SleeperMatchupRow[] = [
  { roster_id: 1, matchup_id: 2, starters: ["9001"], starters_points: [101.2], players: ["9001"], players_points: { "9001": 101.2 }, points: 101.2 },
  { roster_id: CHEF_ROSTER, matchup_id: 4, starters: chef.starters, starters_points: chef.starters_points,
    players: [...chef.starters, "9310", "9311"], players_points: pts(chef, { "9310": 6.4, "9311": 0 }), points: 138.74 },
  { roster_id: 5, matchup_id: 2, starters: ["9005"], starters_points: [99.9], players: ["9005"], players_points: { "9005": 99.9 }, points: 99.9 },
  { roster_id: ZACH_ROSTER, matchup_id: 4, starters: zach.starters, starters_points: zach.starters_points,
    players: [...zach.starters, "9710"], players_points: pts(zach, { "9710": 11.2 }), points: 137.3 },
];
/** Sleeper's pregame projections for the same starters, summed: what our header fell back to for the opponent. */
export const PROJ = { zach: 137.3, chef: 128.3 };
