// Regression check: lineup advice follows game state. Sleeper locks a player at his game's kickoff, so no surface may
// suggest moving a player whose game has started, going out or coming in, and a final week gets no lineup advice.
// The demo audit (Oct 21, 2026) found the Overview's Lineup fix, the inbox's Before lock items and the flex call still
// suggesting players whose games were live or final on the sample Sunday and in the final-week fixture.
// Builds the demo league's week 7 under four game states (nothing started; a Sunday with games final, live and still
// to come; every game started but the byes; every game final) and runs each surface's own code on it.
// Run (from the repo root, after npm install):
//   npx esbuild scripts/check-gamestate.ts --bundle --platform=node --format=esm --jsx=automatic --loader:.css=empty \
//     --outfile=/tmp/check-gamestate.mjs && TZ=America/New_York node /tmp/check-gamestate.mjs
import { YOU, PLAYERS, LEAGUE, playerById, setWeekGames, type GameState, type Player } from "../src/data";
import { lineupFor, lineupStatus, noMoveText, sleeperDiff, sleeperSlots, bestUnderLocks, pairMoves, specialLineup, ask } from "../src/engine";
import { LOCKED_LINE, weekFinal, type WeekGames } from "../src/locks";
import { gameDayChecks, kdefHint } from "../src/gameDay";
import { lockWhen, moveLock, kickoffOf, fmtKick } from "../src/kickoff";
import { lockedIn, resultFor } from "../src/optimalLineup";
import { lineupCall, nowFor } from "../src/components/PlayerDepth";
import { buildInbox } from "../src/components/Inbox";
import type { Live } from "../src/live";

let failed = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) failed++;
  console.log(`${cond ? "ok  " : "FAIL"} ${label}${!cond && detail ? `: ${detail}` : ""}`);
};

// Every team the demo week touches; PIT and NE are on bye
const TEAMS = ["DEN", "KC", "BUF", "MIA", "CAR", "TB", "IND", "TEN", "CIN", "CLE", "NYJ", "BAL", "JAX", "HOU", "NYG", "PHI", "ATL", "NO", "LAR", "SEA", "ARI", "SF", "LV", "LAC", "GB", "MIN", "DET", "DAL", "WAS", "CHI"];
const all = (st: GameState) => Object.fromEntries(TEAMS.map((t) => [t, st])) as Record<string, GameState>;
const SCENARIOS: { name: string; games: Record<string, GameState> }[] = [
  { name: "before kickoff", games: all("pre_game") },
  // Thursday and the early games final, the next window live, the late games and Monday still to come
  { name: "Sunday afternoon", games: { ...all("pre_game"), DEN: "complete", KC: "complete", MIA: "complete", CAR: "complete", BAL: "complete", NYJ: "complete", IND: "complete", TEN: "complete",
    BUF: "in_game", CIN: "in_game", CLE: "in_game", PHI: "in_game", NYG: "in_game", TB: "in_game" } },
  // Everything has kicked off; only Monday night is still on
  { name: "Monday night", games: { ...all("complete"), WAS: "in_game", CHI: "in_game" } },
  { name: "final week", games: all("complete") },
];

const roster = () => [...YOU.roster.map(playerById), ...(YOU.special ?? []).map((id) => LEAGUE.specials?.[id]).filter((p): p is NonNullable<typeof p> => !!p)];

for (const sc of SCENARIOS) {
  console.log(`\n-- ${sc.name}`);
  const w: WeekGames = { games: sc.games };
  setWeekGames(() => w);
  const live: Live = { points: {}, games: sc.games, teamPts: {}, left: {}, at: 0 };
  const final = weekFinal(w);
  const lockedTeam = (nfl: string) => final || sc.games[nfl] === "in_game" || sc.games[nfl] === "complete";
  const locked = (id: string) => { const p = PLAYERS[id] ?? LEAGUE.specials?.[id]; return !!p && lockedTeam(p.nfl); };
  const lockedNames = roster().filter((p) => lockedTeam(p.nfl)).map((p) => p.name);
  const namesLocked = (text: string) => lockedNames.filter((n) => text.includes(n));

  // Overview briefing, inbox lineup nudge, Lineup page Start / Sit and swap hints, Ask: engine.sleeperDiff
  const st = lineupStatus();
  const moves = sleeperDiff();
  ok("Lineup moves: both players still before kickoff", moves.every((d) => !locked(d.start.id) && !locked(d.benched.id)),
    moves.filter((d) => locked(d.start.id) || locked(d.benched.id)).map((d) => `${d.start.name} for ${d.benched.name}`).join(", "));
  ok("Lineup moves: none once the week is final", !final || (moves.length === 0 && st.final));
  for (const d of moves) {
    const when = moveLock(d.benched, d.start);
    ok(`Move ${d.start.name} for ${d.benched.name} locks at the earlier of their own kickoffs (${when})`, !!when && [d.start, d.benched].some((p) => lockWhen(p) === when));
  }
  // The fallback: what the move would be with no locks, and whether locks changed it
  const cur = sleeperSlots();
  const free = pairMoves(cur, bestUnderLocks(cur, () => false));
  console.log(`     best move with no locks: ${free.map((m) => `${m.start.name} for ${m.bench.name}`).join(", ") || "none"}; still open: ${moves.map((d) => `${d.start.name} for ${d.benched.name}`).join(", ") || "none"}`);
  if (!moves.length && !final && free.length) ok("Blocked moves say the lineup is locked", st.blocked && noMoveText(st, 0) === LOCKED_LINE);

  // Inbox Before lock items, flex call, bench warning
  const checks = gameDayChecks(lineupFor(YOU.roster, true));
  const lineupChecks = checks.filter((c) => !c.key.startsWith("ir"));
  ok("Game day checks: no locked player named", lineupChecks.every((c) => !namesLocked(c.text).length), lineupChecks.map((c) => namesLocked(c.text).join(", ")).filter(Boolean).join("; "));
  ok("Game day checks: none once the week is final", !final || lineupChecks.length === 0);
  for (const c of lineupChecks.filter((x) => x.player)) ok(`${c.player!.name}'s check shows his own kickoff (${c.lockAt})`, c.lockAt === (lockWhen(c.player) || undefined));
  const inbox = buildInbox({ nudges: [], checks, live, go: () => {}, loadTrade: () => {}, keepTag: () => {} });
  const lineupItems = inbox.filter((x) => /^(Before lock|Flex call|Bench|Lineup)$/.test(x.title));
  ok("Inbox: no Before lock, flex or bench item names a locked player", lineupItems.every((x) => !namesLocked(x.text).length), lineupItems.map((x) => x.text).join(" | "));
  ok("Inbox: lock times are each item's own kickoff, never the week's", lineupItems.every((x) => !x.meta || /^Locks (Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(x.meta)));
  const flex = lineupItems.find((x) => x.title === "Flex call");
  if (flex) console.log(`     ${flex.text} (${flex.meta})`);

  // K/DEF hint on the Lineup rows
  const kdef = specialLineup(YOU);
  const hints = (YOU.special ?? []).map((id) => LEAGUE.specials?.[id]).filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({ p, b: kdefHint(p, kdef.slots.find((x) => x.slot === p.pos)?.player, []) })).filter((x) => x.b);
  ok("K/DEF hints: both still before kickoff", hints.every((x) => !locked(x.p.id) && !locked(x.b!.id)));

  // Player sheet Lineup call and its Swap in Sleeper button
  for (const p of YOU.roster.map(playerById)) {
    const c = lineupCall(p, nowFor(live, p));
    if (c.move) {
      const partner = moves.find((d) => d.benched.id === p.id)?.start ?? moves.find((d) => d.start.id === p.id)?.benched;
      ok(`Lineup call for ${p.name} offers Swap in Sleeper only for an open move`, !locked(p.id) && !!partner && !locked(partner.id), `${c.head}: ${c.line}`);
    } else if (locked(p.id)) {
      ok(`Lineup call for ${p.name} (locked) has no swap`, !/Swap him out|Start him over|Take him out/.test(c.head) && !/^.*Start [A-Z].* before /.test(c.line), `${c.head}: ${c.line}`);
    }
  }

  // Set optimal lineup (engine floor, the same lineup the AI is checked against) and Use optimal lineup
  const opt = resultFor(cur, bestUnderLocks(cur, lockedIn(live)), "off");
  ok("Set optimal lineup: every move open", opt.swaps.every((x) => !locked(x.start) && !locked(x.bench)), opt.swaps.map((x) => `${x.start}>${x.bench}`).join(", "));
  ok("Set optimal lineup: no moves once final", !final || opt.swaps.length === 0);

  // Ask: "Who should I start at flex?" and "Set my lineup"
  for (const q of ["Who should I start at flex?", "Who should I start this week?"]) {
    const a = ask(q, [], {}, {});
    const rows = a.show?.kind === "swaps" ? a.show.rows : [];
    ok(`Ask "${q}": swaps open`, rows.every((r) => !locked(r.start) && !locked(r.bench)), a.text);
    ok(`Ask "${q}": text names no locked player in a move`, !/^Swap /.test(a.text) || !namesLocked(a.text).length, a.text);
    if (final) ok(`Ask "${q}": final week says so`, /is final/.test(a.text), a.text);
  }
}

// Lock times: a player's own kickoff, in the demo's schedule, and nothing once his game has started
setWeekGames(() => ({ games: SCENARIOS[1].games }));
const deebo = playerById("deebo-samuel"), shaheed = playerById("rashid-shaheed"), allen = playerById("josh-allen");
ok(`Deebo Samuel (WAS, Monday) locks at his own kickoff: ${lockWhen(deebo)}`, lockWhen(deebo) === fmtKick(kickoffOf("WAS", LEAGUE.week, deebo.opp)!) && /^Mon /.test(lockWhen(deebo)));
ok(`Rashid Shaheed (SEA, late Sunday) locks at his own kickoff: ${lockWhen(shaheed)}`, /^Sun 4:05/.test(lockWhen(shaheed)));
ok("Josh Allen (BUF, live) has no lock time left", lockWhen(allen) === "");
const p0 = sleeperDiff()[0] as { start: Player; benched: Player } | undefined;
ok(`Sunday afternoon falls back to the best open move (${p0 ? `${p0.start.name} for ${p0.benched.name}` : "none"})`, !!p0 && p0.start.id === "rashid-shaheed" && p0.benched.id === "jaylen-warren");

console.log(failed ? `\n${failed} failed` : "\nall ok");
process.exit(failed ? 1 : 0);
