// Regression check: lineup advice follows game state. Sleeper locks a player at his game's kickoff, so no surface may
// suggest moving a player whose game has started, going out or coming in, and a final week gets no lineup advice.
// The demo audit (Oct 21, 2026) found the Overview's Lineup fix, the inbox's Before lock items and the flex call still
// suggesting players whose games were live or final on the sample Sunday and in the final-week fixture.
// Builds the demo league's week 7 under four game states (nothing started; a Sunday with games final, live and still
// to come; every game started but the byes; every game final) and runs each surface's own code on it.
// Waivers (added Oct 21): its lock counts, Played / Playing labels, claim gains and K/DEF streams read the same live
// game states, so no claim starts a player whose game has kicked off. And the demo's own sample Sunday (live.ts) and
// final-week fixture give both teams in every game one state and one clock.
// Run (from the repo root, after npm install):
//   npx esbuild scripts/check-gamestate.ts --bundle --platform=node --format=esm --jsx=automatic --loader:.css=empty \
//     --outfile=/tmp/check-gamestate.mjs && TZ=America/New_York node /tmp/check-gamestate.mjs
import { YOU, PLAYERS, LEAGUE, WEEK, FREE_AGENTS, SPECIAL_FREE_AGENTS, DEMO_SLATE, playerById, setWeekGames, gameNow, lockedThisWeek, type GameState, type Player } from "../src/data";
import { lineupFor, lineupStatus, noMoveText, sleeperDiff, sleeperSlots, bestUnderLocks, pairMoves, specialLineup, ask, waiverRecs, lockedNow } from "../src/engine";
import { LOCKED_LINE, weekFinal, type WeekGames } from "../src/locks";
import { gameDayChecks, kdefHint } from "../src/gameDay";
import { lockWhen, moveLock, kickoffOf, fmtKick } from "../src/kickoff";
import { lockedIn, resultFor } from "../src/optimalLineup";
import { lineupCall, nowFor } from "../src/components/PlayerDepth";
import { buildInbox } from "../src/components/Inbox";
import { sampleWeek, type Live } from "../src/live";
import { availOf, cantLabel, lockWhyText } from "../src/components/Waivers";
import { waiverWeek } from "../src/components/watchCtx";
import { lastWeek, demoTeamWeek, teamIds } from "../src/weeks";
import { peekLog } from "../src/gamelog";
import { seasonFor, demoBye } from "../src/schedule";
import { demoKDefLine, demoKDefPts } from "../src/demoKDef";
import { TEAMS as LEAGUE_TEAMS } from "../src/data";

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
  // The demo's sample Sunday: Thursday and three early games final, three early games live, the late games and
  // Monday still to come. Both teams in a game share its state.
  { name: "Sunday afternoon", games: { ...all("pre_game"), DEN: "complete", KC: "complete", CAR: "complete", TB: "complete", IND: "complete", TEN: "complete", NYJ: "complete", BAL: "complete",
    BUF: "in_game", MIA: "in_game", CIN: "in_game", CLE: "in_game", NYG: "in_game", PHI: "in_game" } },
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

  // Waivers: which free agents' games have started, the row labels and tap text, the claims and the K/DEF streams
  const byeTeam = (nfl: string) => !TEAMS.includes(nfl);
  const faLocked = (nfl: string) => byeTeam(nfl) || lockedTeam(nfl);
  ok("Waivers: lock state of every free agent follows the live game states", [...FREE_AGENTS, ...SPECIAL_FREE_AGENTS].every((fa) => lockedThisWeek(fa.nfl) === faLocked(fa.nfl)),
    [...FREE_AGENTS, ...SPECIAL_FREE_AGENTS].filter((fa) => lockedThisWeek(fa.nfl) !== faLocked(fa.nfl)).map((fa) => `${fa.name} (${fa.nfl})`).join(", "));
  const played = FREE_AGENTS.filter((fa) => availOf(fa) === "played");
  const wantPlayed = FREE_AGENTS.filter((fa) => !byeTeam(fa.nfl) && lockedTeam(fa.nfl));
  ok(`Waivers: ${played.length} free agents marked played, as many as have kicked off`, played.length === wantPlayed.length && played.every((fa) => wantPlayed.includes(fa)));
  for (const fa of played) {
    const liveNow = !final && sc.games[fa.nfl] === "in_game";
    ok(`Waivers row for ${fa.name} (${fa.nfl}) says ${cantLabel(fa, "played")}`, cantLabel(fa, "played") === (liveNow ? "Playing" : "Played"));
    ok(`Waivers tap text for ${fa.name} matches his game`, (lockWhyText(fa, "played") ?? "").includes(liveNow ? "is playing now" : "already played"));
  }
  console.log(`     free agents: ${FREE_AGENTS.length}; played or playing: ${played.length}; on bye: ${FREE_AGENTS.filter((fa) => availOf(fa) === "bye").length}`);
  const recs = waiverRecs(YOU);
  ok("Waivers: no claim for a free agent whose game has started", recs.every((r) => !faLocked(r.fa.nfl)), recs.filter((r) => faLocked(r.fa.nfl)).map((r) => r.fa.name).join(", "));
  ok("Waivers: no claims at all once the week is final", !final || recs.length === 0);
  // A claim that starts this week only takes a slot whose starter can still move
  const lk = lockedNow(), baseLu = bestUnderLocks(cur, lk);
  for (const r of recs.filter((x) => !x.kdef && x.gain > 0.05)) {
    const withFa = bestUnderLocks(cur, lk, [r.fa.id]);
    const benched = baseLu.filter((x) => x.id && !withFa.some((y) => y.id === x.id)).map((x) => x.id!);
    ok(`Claim ${r.fa.name} (+${r.gain}) only benches players still before kickoff`, benched.every((id) => !locked(id)), benched.map((id) => playerById(id).name).join(", "));
    ok(`Claim ${r.fa.name} never takes a locked starter's slot`, cur.filter((x) => x.id && locked(x.id)).every((x) => withFa.some((y) => y.id === x.id && y.slot === x.slot)));
  }
  // Every skill slot held by a locked starter: nobody on the wire can add points there this week
  const openSlots = cur.filter((x) => !x.id || !locked(x.id)).length;
  if (!openSlots) ok("Waivers: every starter locked, so no claim adds points this week", recs.filter((x) => !x.kdef).every((x) => x.gain <= 0.05));
  const top = recs.find((x) => x.pick);
  console.log(`     waiver claims: ${recs.length}; top pickup: ${top ? `${top.fa.name} (${top.fa.nfl}, ${top.gain > 0 ? "+" : ""}${top.gain})` : "none"}`);
  // K/DEF streams: the stream is before kickoff, and one you start whose game has started is never streamed over
  for (const r of recs.filter((x) => x.kdef)) {
    const c = r.kdef!.current;
    ok(`Stream ${r.fa.name} (${r.fa.pos}) is still before kickoff`, !faLocked(r.fa.nfl));
    if (c && locked(c.id)) ok(`Stream ${r.fa.name}: your ${c.name} has kicked off, so no gain, no fix and no pick`, r.gain === 0 && !r.kdef!.fix && !r.pick && /has started/.test(r.kdef!.line), r.kdef!.line);
  }
  ok("Waivers: the default week moves on once most of the wire has played", final && WEEK < lastWeek() ? waiverWeek() === WEEK + 1 : true);
}

// A kicker you start whose game is on: no stream may replace him this week (the demo's K plays Sunday night)
setWeekGames(() => ({ games: { ...all("pre_game"), DAL: "in_game", DET: "in_game" } }));
const kStreams = waiverRecs(YOU).filter((r) => r.kdef && r.fa.pos === "K");
ok(`K streams while your ${kStreams[0]?.kdef?.current?.name ?? "kicker"} is playing: ${kStreams.length}, none with a gain or a pick`, kStreams.length > 0 && kStreams.every((r) => r.gain === 0 && !r.pick && !r.kdef!.fix && /has started/.test(r.kdef!.line)), kStreams.map((r) => r.kdef!.line).join(" | "));
setWeekGames(() => ({ games: all("pre_game") }));
ok("K streams before his kickoff still compare projections", waiverRecs(YOU).filter((r) => r.kdef && r.fa.pos === "K").every((r) => !/has started/.test(r.kdef!.line)));

// The demo fixture itself: one state and one clock per game, on the sample Sunday and in the final-week fixture
setWeekGames(null);
for (const at of ["live", "final"] as const) {
  const l = sampleWeek(at);
  const split = DEMO_SLATE.filter(([a, h]) => l.games[a] !== l.games[h] || l.left[a] !== l.left[h]);
  ok(`Demo ${at}: both teams in every game share one state and clock`, !split.length, split.map(([a, h]) => `${a} ${l.games[a]} ${l.left[a] ?? ""} vs ${h} ${l.games[h]} ${l.left[h] ?? ""}`).join("; "));
  const states = new Set(DEMO_SLATE.map(([, h]) => l.games[h]));
  if (at === "live") ok("Demo sample Sunday has games final, live and still to come", states.has("complete") && states.has("in_game") && states.has("pre_game"));
  else ok("Demo final week: every game final", states.size === 1 && states.has("complete"));
  ok(`Demo ${at}: a clock only on games in progress`, Object.keys(l.left).every((t) => l.games[t] === "in_game") && Object.entries(l.games).every(([t, st]) => st !== "in_game" || l.left[t] !== undefined));
  const scoredEarly = Object.keys(l.points).filter((id) => { const p = PLAYERS[id] ?? LEAGUE.specials?.[id]; return !!p && (l.games[p.nfl] ?? "pre_game") === "pre_game"; });
  ok(`Demo ${at}: points only for players whose game has started`, !scoredEarly.length, scoredEarly.join(", "));
  ok(`Demo ${at}: byes have no game`, ["PIT", "NE"].every((t) => !l.games[t]));
}
// Waivers in the demo reads the sample Sunday's states through the same source as Lineup
setWeekGames(() => ({ games: sampleWeek("live").games }));
const sun = sampleWeek("live").games;
ok("Demo Waivers: every free agent's game state is the sample Sunday's", FREE_AGENTS.every((fa) => { const g = gameNow(fa.nfl); return g === "bye" ? ["PIT", "NE"].includes(fa.nfl) : g === sun[fa.nfl]; }));

// Lock times: a player's own kickoff, in the demo's schedule, and nothing once his game has started
setWeekGames(() => ({ games: SCENARIOS[1].games }));
const deebo = playerById("deebo-samuel"), shaheed = playerById("rashid-shaheed"), allen = playerById("josh-allen");
ok(`Deebo Samuel (WAS, Monday) locks at his own kickoff: ${lockWhen(deebo)}`, lockWhen(deebo) === fmtKick(kickoffOf("WAS", LEAGUE.week, deebo.opp)!) && /^Mon /.test(lockWhen(deebo)));
ok(`Rashid Shaheed (SEA, late Sunday) locks at his own kickoff: ${lockWhen(shaheed)}`, /^Sun 4:05/.test(lockWhen(shaheed)));
ok("Josh Allen (BUF, live) has no lock time left", lockWhen(allen) === "");
const p0 = sleeperDiff()[0] as { start: Player; benched: Player } | undefined;
ok(`Sunday afternoon falls back to the best open move (${p0 ? `${p0.start.name} for ${p0.benched.name}` : "none"})`, !!p0 && p0.start.id === "rashid-shaheed" && p0.benched.id === "jaylen-warren");

// Demo kickers and defenses (added Oct 21): every played week is the sum of its own stat line, as the game log's
// columns show it (FG made / attempted with the 40-49 and 50+ makes, XP; PA, sacks, INT, FR, TD), and the season
// grid, the game log, Lineup and Full matchup past weeks and the sample Sunday all show that number. They used to
// share one line per week, so every DEF scored 3 in Week 5.
setWeekGames(null);
{
  const subs = [...Object.values(LEAGUE.specials ?? {}), ...SPECIAL_FREE_AGENTS];
  const paPts = (pa: number) => (pa === 0 ? 10 : pa <= 6 ? 7 : pa <= 13 ? 4 : pa <= 20 ? 1 : pa <= 27 ? 0 : pa <= 34 ? -1 : -4);
  const n = (v: number | undefined) => v ?? 0;
  const shown = (pos: string, s: Record<string, number | undefined>) => pos === "K"
    ? 3 * (n(s.fgm) - n(s.fgm_40_49) - n(s.fgm_50p)) + 4 * n(s.fgm_40_49) + 5 * n(s.fgm_50p) - (n(s.fga) - n(s.fgm)) + n(s.xpm) - (n(s.xpa) - n(s.xpm))
    : paPts(n(s.pts_allow)) + n(s.sack) + 2 * (n(s.int) + n(s.fum_rec)) + 6 * n(s.def_td);
  const bad: string[] = [], grid: string[] = [], byes: string[] = [];
  const byWeek: Record<string, Set<number>> = {};
  for (const sp of subs) {
    const log = peekLog({ id: sp.id, name: sp.name, pos: sp.pos, nfl: sp.nfl, proj: sp.proj }, LEAGUE.season)!;
    const cells = seasonFor({ ...sp } as unknown as Player);
    for (const r of log.rows.filter((x) => x.when === "past")) {
      if (r.bye) { if (demoBye(sp.nfl) !== r.week) byes.push(`${sp.id} W${r.week}`); continue; }
      if (!r.stats || r.pts === undefined || shown(sp.pos, r.stats) !== r.pts) bad.push(`${sp.id} W${r.week}: ${r.pts} vs line ${r.stats ? shown(sp.pos, r.stats) : "none"}`);
      const c = cells.find((x) => x.week === r.week);
      if (c?.pts !== r.pts) grid.push(`${sp.id} W${r.week}: grid ${c?.pts} log ${r.pts}`);
      (byWeek[`${sp.pos} W${r.week}`] ??= new Set()).add(r.pts ?? 0);
    }
  }
  ok("Demo K/DEF: each week's points add up from its game-log line", !bad.length, bad.slice(0, 4).join("; "));
  ok("Demo K/DEF: the season grid (Compare, Lineup strip) matches the game log", !grid.length, grid.slice(0, 4).join("; "));
  ok("Demo K/DEF: byes fall on each team's demo bye week", !byes.length, byes.join(", "));
  const flat = Object.entries(byWeek).filter(([, v]) => v.size < 4).map(([k, v]) => `${k}: ${[...v].join("/")}`);
  ok("Demo K/DEF: scores vary from team to team within a week", !flat.length, flat.join("; "));
  // Lineup and Full matchup past weeks, every team
  const off: string[] = [];
  for (const t of LEAGUE_TEAMS) for (let w = 1; w < WEEK; w++) for (const x of demoTeamWeek(teamIds(t), w).starters) {
    const p = x.p; if (!p || (p.pos !== "K" && p.pos !== "DEF") || p.pts === null) continue;
    const r = peekLog({ id: p.id, name: p.name, pos: p.pos, nfl: p.nfl, proj: 0 }, LEAGUE.season)!.rows.find((y) => y.week === w);
    if (r?.pts !== p.pts) off.push(`${t.id} ${p.id} W${w}: lineup ${p.pts} log ${r?.pts}`);
  }
  ok("Demo K/DEF: Lineup and Full matchup past weeks match the game log", !off.length, off.slice(0, 4).join("; "));
  // This week on the sample Sunday and in the final-week fixture: each K/DEF scores its line so far
  for (const at of ["live", "final"] as const) {
    const l = sampleWeek(at), wrong: string[] = [];
    for (const sp of subs) {
      const g = l.games[sp.nfl], got = l.points[sp.id];
      if (!g || g === "pre_game" || got === undefined) continue;
      const want = demoKDefPts(sp.id, sp.pos, WEEK, { proj: sp.proj, share: g === "complete" ? 1 : 1 - (l.left[sp.nfl] ?? 0) });
      if (got !== want) wrong.push(`${sp.id} ${got} vs ${want}`);
      if (g === "complete" && shown(sp.pos, demoKDefLine(sp.id, sp.pos, WEEK, { proj: sp.proj })) !== got) wrong.push(`${sp.id} line`);
    }
    ok(`Demo ${at}: K/DEF points this week are their stat line so far`, !wrong.length, wrong.join("; "));
  }
}

console.log(failed ? `\n${failed} failed` : "\nall ok");
process.exit(failed ? 1 : 0);
