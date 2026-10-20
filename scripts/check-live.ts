// Checks Sources' live math against real Sleeper readings (week 6, 2026, Go Buck Yourself: Blevishkin vs
// ChefAndreNapier during WAS at SF on Monday night). Run: node --experimental-strip-types scripts/check-live.ts
import { countPlays, finalPct, fromMatchups, isFinal, passScore, playLabel, resultOf, rowScore, sleeperLiveProj, sleeperWinProb, winPct, type GameState } from "../src/liveMath.ts";
import { rows, chef as chef6, zach as zach6, CHEF_ROSTER, ZACH_ROSTER, PROJ } from "./fixtures/week6-final.ts";

let failed = 0;
const near = (label: string, got: number, want: number, tol: number) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: got ${got.toFixed(2)}, Sleeper ${want.toFixed(2)}`);
};
const same = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

// Week 6 schedule from api.sleeper.com/schedule/nfl/regular/2026 during the game; CIN, DET, MIA, MIN on bye
const games: Record<string, GameState> = {};
for (const g of "CHI@ATL BAL@CLE SEA@DEN DAL@GB TEN@IND HOU@JAX LAC@KC NYJ@NE NO@NYG BUF@LV CAR@PHI ARI@LAR PIT@TB".split(" ")) {
  const [a, h] = g.split("@"); games[a] = games[h] = "complete";
}
games.WAS = games.SF = "in_game";
const bye = (t: string) => ["CIN", "DET", "MIA", "MIN"].includes(t);

// Starters' NFL teams as Sleeper lists them (QB, RB, RB, WR, WR, TE, FLEX, K, DEF)
const zach = ["BUF", "BUF", "ARI", "PHI", "CAR", "PHI", "WAS", "SEA", "SEA"]; // Allen, Cook, Allgeier, Smith, Coker, Goedert, R. White, Myers, SEA
const chef = ["JAX", "JAX", "DEN", "DAL", "KC", "ARI", "SF", "DAL", "LAR"]; // Lawrence, Tuten, Harvey, Pickens, Worthy, McBride, Kittle, Aubrey, LAR
const zc = countPlays(games, bye, zach), cc = countPlays(games, bye, chef);
same("Zach play count", zc, { done: 8, live: 1, left: 0 });
same("Opponent play count", cc, { done: 8, live: 1, left: 0 });
same("Chip label (Sleeper: Yet to play 0)", playLabel(zc), "1 live");
same("Chip label, mixed", playLabel({ done: 3, live: 2, left: 4 }), "4 to play, 2 live");

// Live projections. left = seconds remaining / 3600, as Sleeper counts it. Projections are Sleeper's week 6
// numbers as revised at 9:50 PM ET (White 10.85, Kittle 14.77; pregame they were 10.96 and 14.96).
const readings = [
  { at: "14:56 3rd", left: (900 + 896) / 3600, white: [1.7, 10.85, 6.71], kittle: [13.4, 14.77, 17.42], zach: [123.3, 128.31], chef: [134.24, 138.26], win: 4 },
  { at: "12:01 3rd", left: (900 + 721) / 3600, white: [2.3, 10.85, 6.63], kittle: [13.4, 14.77, 16.74], zach: [123.9, 128.23], chef: [134.24, 137.58], win: 3 },
  { at: "0:13 3rd", left: (900 + 13) / 3600, white: [3.4, 10.85, 5.52], kittle: [17.9, 14.77, 19.05], zach: [125.0, 127.12], chef: [138.74, 139.89], win: 1 },
];
for (const r of readings) {
  near(`${r.at} White`, sleeperLiveProj(r.white[0], r.white[1], r.left), r.white[2], 0.03);
  near(`${r.at} Kittle`, sleeperLiveProj(r.kittle[0], r.kittle[1], r.left), r.kittle[2], 0.03);
  const p = Math.round(Math.min(99, Math.max(1, sleeperWinProb(r.zach[0], r.zach[1], r.chef[0], r.chef[1]) * 100)));
  near(`${r.at} win %`, p, r.win, 0);
}
// Edge cases: not started gives the projection, final gives the points
near("Kickoff", sleeperLiveProj(0, 12, 1), 12, 0);
near("Final", sleeperLiveProj(9.4, 12, 0), 9.4, 0);

// ---- Week 6 final (scripts/fixtures/week6-final.ts): Zach lost 137.30 to 138.74 ----
console.log("\nWeek 6 final");
const r1 = (n: number) => Math.round(n * 10) / 10;
// The bug: once every game was final the app never polled, so live scoring only had the history entry, which
// holds your own row's players_points. The opponent's starters had no points: 0 scored, projection as expected.
const oldPoints = rows.find((r) => r.roster_id === ZACH_ROSTER)!.players_points!;
const oldOppScored = chef6.starters.reduce((a, id) => a + (oldPoints[id] ?? 0), 0);
near("Old path: opponent header (screenshot 0.0)", oldOppScored, 0, 0);
near("Old path: win % (screenshot 59%)", Math.round(sleeperWinProb(137.3, PROJ.zach, oldOppScored, PROJ.chef) * 100), 59, 0);

// The fix: every roster's points from the matchup rows, keyed by roster_id, whatever order the rows come in
const fx = fromMatchups(rows);
near("Zach team score (roster 7, listed after the opponent)", fx.teamPts[String(ZACH_ROSTER)], 137.3, 0.001);
near("Opponent team score (roster 3, listed first)", fx.teamPts[String(CHEF_ROSTER)], 138.74, 0.001);
near("Trevor Lawrence (was showing his 18.4 projection)", fx.points["7523"], 28.34, 0.001);
near("Josh Allen", fx.points["4984"], 18.3, 0.001);
const oppSum = chef6.starters.reduce((a, id) => a + (fx.points[id] ?? 0), 0), mySum = zach6.starters.reduce((a, id) => a + (fx.points[id] ?? 0), 0);
near("Opponent starters sum to Sleeper's points", oppSum, 138.74, 0.001);
near("Zach's starters sum to Sleeper's points", mySum, 137.3, 0.001);

// Header numbers: Sleeper's team score, projection moved with it. Final, so projection equals the score.
const games6: Record<string, GameState> = {};
for (const t of [...Object.values(chef6.nfl), ...Object.values(zach6.nfl)]) games6[t] = "complete";
const myC = countPlays(games6, () => false, Object.values(zach6.nfl)), oppC = countPlays(games6, () => false, Object.values(chef6.nfl));
same("Yet to play, Zach", playLabel(myC), "0 to play");
same("Yet to play, opponent", playLabel(oppC), "0 to play");
const fin = isFinal(myC, oppC);
same("Matchup is final", fin, true);
const me = passScore(fx.teamPts["7"], mySum, mySum), them = passScore(fx.teamPts["3"], oppSum, oppSum);
same("Header, Zach", r1(me.scored).toFixed(1), "137.3");
same("Header, opponent (was 0.0)", r1(them.scored).toFixed(1), "138.7");
same("Header proj, opponent (was 128.3)", r1(them.proj).toFixed(1), "138.7");
near("Win %, Zach (was 59%)", winPct(me.scored, me.proj, them.scored, them.proj, fin), 0, 0);
near("Win %, opponent's side", winPct(them.scored, them.proj, me.scored, me.proj, fin), 100, 0);
near("Win %, tie", finalPct(120.25, 120.25), 50, 0);
same("Result", resultOf(me.scored, them.scored), { tone: "down", letter: "L", short: "Lost by 1.4", long: "You lost 137.3 to 138.7" });
same("Result, winner's side", resultOf(them.scored, me.scored).short, "Won by 1.4");

// Pass-through when our own sum is off (a starter we don't know, like a K missing from our players): Sleeper wins
const partial = oppSum - 1.0; // Aubrey's 1.0 missing
const p2 = passScore(fx.teamPts["3"], partial, partial);
same("Missing starter: score from Sleeper", p2.scored.toFixed(2), "138.74");
same("Missing starter: projection moves with it", p2.proj.toFixed(2), "138.74");
// No team score on the row: fall back to the starters' points
near("Row without points: starters_points sum", rowScore({ roster_id: 3, starters: chef6.starters, starters_points: chef6.starters_points, points: null })!, 138.74, 0.001);
near("Row without points or starters_points: players_points over starters", rowScore({ roster_id: 3, starters: chef6.starters, players_points: fx.points })!, 138.74, 0.001);
// Live is unchanged: still Sleeper's model and the 1 to 99 clamp
near("Live win % keeps the clamp", winPct(125.0, 127.12, 138.74, 139.89, false), 1, 0);

if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log("All live checks pass");
