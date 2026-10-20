// Who you play in any week, and how it went or how it projects. The Lineup week stepper drives it: the team strip,
// Their threats and the full matchup all follow the selected week. This week stays on the live scoring in live.ts;
// every other week is built here, from Sleeper's matchups (the same matchup_id means two teams play each other)
// and the same per-week projections the Lineup starters use. Cached per week.
import { createContext, useContext, useEffect, useState } from "react";
import { LEAGUE, WEEK, YOU, TEAMS, Team, Player, isDemo } from "./data";
import { currentFormat } from "./engine";
import { WeekPlayer, loadWeek, peekWeek, teamWeek, demoTeamWeek, teamIds, demoOppId, info, order, SLOT_NAME, WeekView } from "./weeks";
import { weekMatchups } from "./weekFeed";
import { projOutlook, winChance } from "./live";
import { seasonFor } from "./schedule";

/** suggested: a K/DEF Sleeper has no lineup for yet (future weeks), filled with the best projected one. */
export type Slot = { slot: string; p: WeekPlayer | null; suggested?: boolean };
export interface MatchSide { team: Team; total: number; starters: Slot[] }
export interface WeekMatch {
  week: number;
  kind: "past" | "future";
  me: MatchSide;
  opp: MatchSide | null;
  /** No opponent this week, with a plain reason. */
  empty?: { title: string; body: string };
  /** Future weeks: your win chance from both projected lineups, same model as this week's. */
  chance?: number;
}

const playoffStart = () => LEAGUE.playoffStart ?? 15;
const teamOf = (id: string) => TEAMS.find((t) => t.id === id);
const scoredSide = (starters: Slot[]) => projOutlook(starters.map((x) => ({ pos: x.p?.pos ?? "", pts: x.p?.pts ?? 0 })));

function noOpp(week: number, posted: boolean): WeekMatch["empty"] {
  if (week >= playoffStart()) return week < WEEK
    ? { title: "No playoff game", body: `You didn't have a playoff matchup in Week ${week}.` }
    : { title: "Playoffs", body: `Playoff matchups are set once the regular season ends after Week ${playoffStart() - 1}.` };
  if (!posted) return { title: "Not posted yet", body: `Sleeper hasn't posted Week ${week} matchups yet.` };
  return { title: "Bye week", body: `You don't play anyone in Week ${week}.` };
}

const isSpecial = (slot: string) => slot === "K" || slot === "DEF";
const sum = (st: Slot[]) => Math.round(st.reduce((a, x) => a + (x.p?.pts ?? 0), 0) * 10) / 10;
/** A future week's lineup: a K/DEF Sleeper already has in that week's matchup stays put; any other K/DEF slot keeps
 *  the best projected pick and is marked suggested. Skill slots stay the best projected lineup. */
function passSpecials(side: { starters: Slot[]; bench: WeekPlayer[] }, set: (string | null)[] | null | undefined) {
  const pool = [...side.starters.map((x) => x.p), ...side.bench].filter((p): p is WeekPlayer => !!p);
  const starters = side.starters.map((x, i) => {
    if (!isSpecial(x.slot)) return x;
    const id = set?.[i];
    const p = id && id !== "0" ? pool.find((q) => q.id === id && q.pos === x.slot) : undefined;
    return p ? { slot: x.slot, p } : { ...x, suggested: !!x.p };
  });
  return { starters, total: sum(starters) };
}

function finish(week: number, mine: WeekView, opp: MatchSide | null, posted: boolean): WeekMatch {
  const kind = week < WEEK ? "past" : "future";
  const me: MatchSide = { team: YOU, total: mine.total, starters: mine.starters };
  if (!opp) return { week, kind, me, opp: null, empty: noOpp(week, posted) };
  const chance = kind === "future" ? Math.round(winChance(scoredSide(me.starters), scoredSide(opp.starters))) : undefined;
  return { week, kind, me, opp, chance };
}

/** The same week with your starters swapped for a what-if lineup: your total and a future week's win chance follow. */
export function withMine(m: WeekMatch, starters: Slot[]): WeekMatch {
  const me: MatchSide = { ...m.me, starters, total: sum(starters) };
  const chance = m.kind === "future" && m.opp ? Math.round(winChance(scoredSide(starters), scoredSide(m.opp.starters))) : m.chance;
  return { ...m, me, chance };
}

function demoMatch(week: number): WeekMatch {
  const week0 = peekWeek(week)!;
  const id = demoOppId(week), t = id ? teamOf(id) : undefined;
  const future = week > WEEK;
  // The demo has no lineups set for weeks ahead, so their K/DEF are suggestions, like a live league's
  const mine = future ? { ...week0, ...passSpecials(week0, null) } : week0;
  const tw = t ? demoTeamWeek(teamIds(t), week) : null;
  const side = t && tw ? { team: t, ...tw, ...(future ? passSpecials(tw, null) : {}) } : null;
  return finish(week, mine, side, true);
}

async function liveMatch(week: number): Promise<WeekMatch> {
  const [mine, ms] = await Promise.all([loadWeek(week), weekMatchups(week)]);
  const row = ms.find((m) => String(m.roster_id) === YOU.id);
  const o = row?.matchup_id ? ms.find((m) => m.matchup_id === row.matchup_id && m.roster_id !== row.roster_id) : undefined;
  const t = o ? teamOf(String(o.roster_id)) : undefined;
  if (!o || !t) return finish(week, mine, null, ms.length > 0);
  if (week < WEEK) {
    // What they actually started and scored, slot for slot, straight from the matchup
    const ord = order();
    const starters: Slot[] = (o.starters ?? []).map((id, i) => ({
      slot: SLOT_NAME[ord[i]] ?? ord[i] ?? "FLEX",
      p: id && id !== "0" ? { ...info(id), pts: o.players_points?.[id] ?? 0 } : null,
    }));
    return finish(week, mine, { team: t, total: o.points ?? 0, starters }, true);
  }
  // Weeks ahead: best projected lineups, except a K/DEF Sleeper already has set for that week
  const theirs = await teamWeek(teamIds(t), week);
  return finish(week, { ...mine, ...passSpecials(mine, row?.starters) }, { team: t, ...passSpecials(theirs, o.starters) }, true);
}

const cache = new Map<string, WeekMatch>();
const keyFor = (week: number) => `${LEAGUE.id}|${week}|${currentFormat().scoring}|${currentFormat().tePremium}`;
/** A week that's ready now (cached, or demo), so switching to it draws without a loading state. */
export function peekMatch(week: number): WeekMatch | undefined {
  const hit = cache.get(keyFor(week));
  if (hit || !isDemo() || week === WEEK) return hit;
  const m = demoMatch(week);
  cache.set(keyFor(week), m);
  return m;
}
export async function loadMatch(week: number): Promise<WeekMatch> {
  const hit = peekMatch(week);
  if (hit) return hit;
  const m = await liveMatch(week);
  cache.set(keyFor(week), m);
  return m;
}

/** The selected week's matchup. Null for this week (live scoring handles it) and while loading. */
export function useWeekMatch(week: number): { m: WeekMatch | null; err: string | null } {
  const [st, setSt] = useState<{ week: number; m: WeekMatch | null; err: string | null }>(() => ({ week, m: week === WEEK ? null : peekMatch(week) ?? null, err: null }));
  useEffect(() => {
    if (week === WEEK) { setSt({ week, m: null, err: null }); return; }
    const hit = peekMatch(week);
    if (hit) { setSt({ week, m: hit, err: null }); return; }
    let on = true;
    setSt({ week, m: null, err: null });
    loadMatch(week).then((m) => on && setSt({ week, m, err: null }))
      .catch(() => on && setSt({ week, m: null, err: "Couldn't load that week's matchup from Sleeper. Try again in a minute." }));
    return () => { on = false; };
  }, [week]);
  if (st.week === week) return { m: st.m, err: st.err };
  return { m: week === WEEK ? null : peekMatch(week) ?? null, err: null };
}

/** A player's game that week, "v HOU" or "@ HOU". Null means his team is on bye. */
export function gameIn(p: Pick<WeekPlayer, "id" | "nfl" | "pos">, week: number): string | null {
  const raw = LEAGUE.slate ? LEAGUE.slate.opp[p.nfl]?.[week] ?? null
    : seasonFor({ id: p.id, name: "", nfl: p.nfl, pos: p.pos, proj: 0 } as Player).find((c) => c.week === week)?.opp ?? null;
  return raw ? raw.replace(/^v\s*/, "v ").replace(/^@\s*/, "@ ") : null;
}

/** The week picked on the Lineup page, for the cards beside it (Their threats) without threading props through App. */
export const LineupWeek = createContext<number | null>(null);
export const useLineupWeek = () => useContext(LineupWeek) ?? WEEK;

/** "See the full matchup" opens that week's matchup. Matchup reads it once when it opens. */
let pendingWeek: number | null = null;
export const openMatchupWeek = (w: number) => { pendingWeek = w; };
export const pendingMatchupWeek = () => pendingWeek ?? WEEK;
/** Called once the matchup has read it, so the next visit from anywhere else opens on this week. */
export const clearMatchupWeek = () => { pendingWeek = null; };
