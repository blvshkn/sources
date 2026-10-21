// Waivers week view: any free agent's numbers for any week. Past weeks are what he actually scored (with a short
// stat line), the current week is what he has so far, future weeks are Sleeper's projection. Live leagues read
// Sleeper's weekly stats and projections feeds through fetchWeekRows (the same feed the Lineup week browser uses)
// and score them with the league's own scoring_settings (weekPoints / scoreStats); the demo league builds stable sample numbers.
import { useEffect, useMemo, useState } from "react";
import { LEAGUE, WEEK, isDemo, gameNow } from "./data";
import { fetchWeekRows, WeekRow } from "./sleeper";
import { demoStats, weekPoints } from "./weeks";
import { peekLog, type Subject } from "./gamelog";
import { livePointsNow } from "./live";
import type { WaiverRec } from "./engine";

/** One player in one week. `pts` null = bye. `played` = he has stats that week (past or in progress). */
export interface WkCell { pts: number | null; line?: string; opp?: string; played: boolean }
export type WkCells = Record<string, WkCell>;
/** The few fields a week lookup needs from a free agent. */
export interface FaLite { id: string; name: string; pos: string; nfl: string; proj: number }

// ---- Stat line -------------------------------------------------------------------
const n = (v: number | undefined) => Math.round(v ?? 0);
const td = (v: number) => (v ? ` · ${v} TD` : "");
/** A short line for the position: RB carries-yards and catches-yards plus TDs; WR/TE targets, catches-yards, TDs;
 *  QB yards, TDs, INTs; K field goals and extra points; DEF points allowed (PA), sacks and takeaways (TO). */
export function shortLine(pos: string, s: Record<string, number | undefined>): string {
  if (pos === "QB") return `${n(s.pass_yd)} yd · ${n(s.pass_td)} TD · ${n(s.pass_int)} INT${n(s.rush_yd) >= 10 ? ` · ${n(s.rush_yd)} rush` : ""}`;
  if (pos === "RB") return `${n(s.rush_att)}-${n(s.rush_yd)} rush · ${n(s.rec)}-${n(s.rec_yd)} rec${td(n(s.rush_td) + n(s.rec_td))}`;
  if (pos === "WR" || pos === "TE") return `${n(s.rec_tgt)} tgt · ${n(s.rec)}-${n(s.rec_yd)} rec${td(n(s.rec_td) + n(s.rush_td))}`;
  if (pos === "K") return `${n(s.fgm)}/${n(s.fga)} FG · ${n(s.xpm)}/${n(s.xpa)} XP`;
  if (pos === "DEF") return `${n(s.pts_allow)} PA · ${n(s.sack)} sk · ${n(s.int) + n(s.fum_rec)} TO`;
  return "";
}

/** "vKC" / "@KC" from the season grid as "vs KC" / "@ KC". */
export const oppLabel = (o?: string | null) => (o ? o.replace(/^v\s*/, "vs ").replace(/^@\s*/, "@ ") : "");

// ---- Sleeper feeds, kept in memory -------------------------------------------------
const feeds = new Map<string, { at: number; p: Promise<Map<string, WeekRow>> }>();
function feed(week: number, kind: "stats" | "projections") {
  const key = `${LEAGUE.season}|${week}|${kind}`;
  const hit = feeds.get(key);
  // The current week's stats move during games, so they're refetched after a minute. Everything else is fixed.
  const ttl = kind === "stats" && week >= WEEK ? 60_000 : Infinity;
  if (hit && Date.now() - hit.at < ttl) return hit.p;
  const p = fetchWeekRows(LEAGUE.season, week, kind);
  feeds.set(key, { at: Date.now(), p });
  p.catch(() => { if (feeds.get(key)?.p === p) feeds.delete(key); });
  return p;
}


/** Demo: the game log's own rows (gamelog.peekLog, built on the demo season in schedule.ts), so a free agent's points
 *  and stat line here are the ones his claim sheet's Game log shows. This week, a game in progress or over reads the
 *  sample Sunday's live points (live.ts), the same source as the face-off and the Lineup rows. */
function demoCells(week: number, fas: FaLite[]): WkCells {
  const out: WkCells = {};
  for (const fa of fas) {
    const row = peekLog({ id: fa.id, name: fa.name, pos: fa.pos as Subject["pos"], nfl: fa.nfl, proj: fa.proj }, LEAGUE.season)?.rows.find((r) => r.week === week);
    if (!row || row.bye || !row.opp) { out[fa.id] = { pts: null, played: false }; continue; }
    const opp = oppLabel(row.opp);
    if (row.when === "past") {
      // A week he missed (out, inactive, no snaps) has no points: Waivers says "Didn't play"
      out[fa.id] = row.pts === undefined ? { pts: 0, opp, played: false } : { pts: row.pts, opp, played: true, line: row.stats ? shortLine(fa.pos, row.stats) : undefined };
      continue;
    }
    const st = week === WEEK ? gameNow(fa.nfl) : null;
    if (st === "in_game" || st === "complete") {
      const pts = livePointsNow()[fa.id] ?? 0;
      out[fa.id] = { pts, opp, played: true, line: shortLine(fa.pos, demoStats(fa.pos, pts, week * 97 + fa.id.length)) };
    } else out[fa.id] = { pts: row.proj ?? fa.proj, opp, played: false };
  }
  return out;
}

async function liveCells(week: number, fas: FaLite[]): Promise<WkCells> {
  const rows = await feed(week, week > WEEK ? "projections" : "stats");
  const opp = LEAGUE.slate?.opp ?? {};
  const hasSchedule = Object.keys(opp).length > 0;
  const out: WkCells = {};
  for (const fa of fas) {
    const o = opp[fa.nfl]?.[week];
    if (hasSchedule && !o) { out[fa.id] = { pts: null, played: false }; continue; }
    const row = rows.get(fa.id);
    const has = !!row && Object.values(row.stats ?? {}).some((v) => typeof v === "number" && v !== 0);
    if (week > WEEK) { out[fa.id] = { pts: row ? weekPoints(fa.pos, row.stats) : 0, opp: oppLabel(o), played: false }; continue; }
    out[fa.id] = { pts: has ? weekPoints(fa.pos, row!.stats) : 0, opp: oppLabel(o), played: has, line: has ? shortLine(fa.pos, row!.stats) : undefined };
  }
  return out;
}

export const cellsFor = (week: number, fas: FaLite[]): Promise<WkCells> => (isDemo() ? Promise.resolve(demoCells(week, fas)) : liveCells(week, fas));

/** Cells for several weeks at once. Demo weeks are ready on the first render, so the list never flashes.
 *  `tick` refetches (the current week's stats move during games). */
export function useWeekCells(weeks: number[], fas: FaLite[], tick = 0): { cells: Record<number, WkCells>; loading: boolean; err: string | null } {
  const key = `${LEAGUE.id}|${weeks.join(",")}|${fas.map((f) => f.id).join(",")}`;
  const demo = useMemo(() => (isDemo() ? Object.fromEntries(weeks.map((w) => [w, demoCells(w, fas)])) : null), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [got, setGot] = useState<{ key: string; cells: Record<number, WkCells>; err: string | null } | null>(null);
  useEffect(() => {
    if (demo || !weeks.length) return;
    let on = true;
    Promise.all(weeks.map((w) => liveCells(w, fas)))
      .then((all) => on && setGot({ key, cells: Object.fromEntries(weeks.map((w, i) => [w, all[i]])), err: null }))
      .catch(() => on && setGot((g) => ({ key, cells: g?.key === key ? g.cells : {}, err: "Couldn't load that week from Sleeper. Try again in a minute." })));
    return () => { on = false; };
  }, [key, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  if (demo) return { cells: demo, loading: false, err: null };
  if (!weeks.length) return { cells: {}, loading: false, err: null };
  const mine = got?.key === key ? got : null;
  return { cells: mine?.cells ?? {}, loading: !mine, err: mine?.err ?? null };
}

/** The completed weeks the "Last 3" strip covers. */
export const lastThreeWeeks = () => [WEEK - 3, WEEK - 2, WEEK - 1].filter((w) => w >= 1);

// ---- The week's top pickup, shared with the docked panel ----------------------------
/** The Waivers screen's pick for a week other than this one. null = this week (the panel shows the engine's pick). */
export interface WeekPick { week: number; kind: "past" | "future"; rec: WaiverRec; pts: number; gain: number; /** Why he fits, naming the weak spot. */ fit?: string | null }
let weekPick: WeekPick | null = null;
const pickSubs = new Set<() => void>();
export function setWeekPick(p: WeekPick | null) {
  const same = p === weekPick || (!!p && !!weekPick && p.week === weekPick.week && p.rec.fa.id === weekPick.rec.fa.id && p.pts === weekPick.pts && p.gain === weekPick.gain);
  if (same) return;
  weekPick = p;
  pickSubs.forEach((f) => f());
}
export function useWeekPick(): WeekPick | null {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); pickSubs.add(f); return () => { pickSubs.delete(f); }; }, []);
  return weekPick;
}
