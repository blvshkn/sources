// Regression check: bye comes from the NFL schedule only. A player whose team has a game is never called "on bye",
// whatever his projection (null, zero, missing) or injury status. Week 7, 2026, Go Buck Yourself: Sleeper had
// Tyler Warren (TE, IND, Questionable) with no projection, and the Before lock card called him on bye. IND plays @ TEN.
// Run: node --experimental-strip-types scripts/check-bye.ts
import { byeTeamsFrom, lineupCard, sitsOut, weekAvail } from "../src/bye.ts";

let failed = 0;
const same = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: got ${JSON.stringify(got)}${ok ? "" : `, want ${JSON.stringify(want)}`}`);
};

// 2026 byes per NFL.com's schedule release: Week 6 CIN, DET, MIA, MIN; Week 7 BUF, JAX, LAC, WAS; IND Week 13; TB Week 10.
// Week 6 games are the ones scripts/check-live.ts pins from Sleeper's schedule. In Week 7 only IND @ TEN is a real
// pairing; the rest are placeholders that put the other 26 teams in a game, since only who plays matters here.
const g = (week: number, s: string) => s.split(" ").map((x) => { const [away, home] = x.split("@"); return { week, away, home }; });
const schedule = [
  ...g(6, "CHI@ATL BAL@CLE SEA@DEN DAL@GB TEN@IND HOU@JAX LAC@KC NYJ@NE NO@NYG BUF@LV CAR@PHI ARI@LAR PIT@TB WAS@SF"),
  ...g(7, "IND@TEN CIN@CLE DET@MIN MIA@ATL PIT@BAL KC@DEN SF@SEA NYG@PHI ARI@CAR CHI@GB NO@LV HOU@NYJ NE@LAR TB@DAL"),
];
const byes7 = byeTeamsFrom(schedule, 7);
same("Week 7 byes from the schedule", byes7, ["BUF", "JAX", "LAC", "WAS"]);
same("Week 6 byes from the schedule", byeTeamsFrom(schedule, 6), ["CIN", "DET", "MIA", "MIN"]);
same("No games posted for the week: nobody is on bye", byeTeamsFrom(schedule, 8), []);
same("No schedule loaded: nobody is on bye", byeTeamsFrom([], 7), []);
const onBye = (t: string) => byes7.includes(t);
same("IND (Warren) plays in Week 7", onBye("IND"), false);
same("TB plays in Week 7", onBye("TB"), false);

// The bug: Warren, Questionable, no projection, in the FLEX
const warren = { name: "Tyler Warren", status: "Q" as const, injury: "Questionable", wk: null };
same("Warren isn't out", sitsOut(warren, onBye("IND"), true), false);
same("Warren reads as injured, not bye", weekAvail(warren, onBye("IND")), "injured");
const card = lineupCard(warren, { name: "Bench TE" }, "FLEX", onBye("IND"));
same("Before lock card", `${card.headline} ${card.emph}`, "Tyler Warren is Questionable and in your FLEX. Have a backup ready.");

// Every combination of status and projection, with a game scheduled: never bye
const zero = { ppr: 0, half: 0, std: 0, rec: 0 }, some = { ppr: 9.4, half: 8, std: 6.6, rec: 2.8 };
let byeLeaks = 0;
for (const status of [undefined, "Q", "O"] as const)
  for (const injury of [undefined, "Questionable", "Doubtful", "Out", "IR"])
    for (const wk of [null, undefined, zero, some])
      for (const longTerm of [undefined, true]) {
        const p = { name: "Someone", status, injury, wk, longTerm };
        const c = lineupCard(p, { name: "Other" }, "FLEX", onBye("IND"));
        if (weekAvail(p, onBye("IND")) === "bye" || /bye/i.test(`${c.headline} ${c.emph}`)) { byeLeaks++; console.log("FAIL leak", JSON.stringify(p)); }
        if (status !== "O" && sitsOut(p, onBye("IND"), true)) { byeLeaks++; console.log("FAIL counted out", JSON.stringify(p)); }
      }
same("Scheduled game, any status or projection: never labeled bye or out", byeLeaks, 0);
if (byeLeaks) failed++;

const noProj = lineupCard({ name: "Healthy Guy", wk: null }, { name: "Other" }, "WR", false);
same("No projection, healthy, game scheduled", `${noProj.headline} ${noProj.emph}`, "Healthy Guy is in your WR in Sleeper and has no projection yet.");

// A real bye still reads as one: Josh Allen (BUF) in Week 7
const allen = { name: "Josh Allen", wk: null };
same("Allen is on bye in Week 7", weekAvail(allen, onBye("BUF")), "bye");
same("Allen sits this week", sitsOut(allen, onBye("BUF"), true), true);
same("Allen card", lineupCard(allen, { name: "Backup QB" }, "QB", onBye("BUF")).emph, "and he's on bye.");
same("A bye doesn't sink rest-of-season math", sitsOut(allen, onBye("BUF"), false), false);

console.log(failed ? `\n${failed} failed` : "\nall ok");
process.exit(failed ? 1 : 0);
