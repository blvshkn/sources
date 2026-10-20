// Checks Sources' live math against real Sleeper readings (week 6, 2026, Go Buck Yourself: Blevishkin vs
// ChefAndreNapier during WAS at SF on Monday night). Run: node --experimental-strip-types scripts/check-live.ts
import { countPlays, playLabel, sleeperLiveProj, sleeperWinProb, type GameState } from "../src/liveMath.ts";

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

if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log("All live checks pass");
