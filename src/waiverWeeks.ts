// Waivers week view: any free agent's numbers for any week. Past weeks are what he actually scored (with a short
// stat line), the current week is what he has so far, future weeks are Sleeper's projection. Live leagues read
// Sleeper's weekly stats and projections feeds through fetchWeekRows (the same feed the Lineup week browser uses)
// and score them with the league format (ptsFrom); the demo league builds stable sample numbers.
import { useEffect, useMemo, useState } from "react";
import { LEAGUE, WEEK, Player, isDemo, gameState } from "./data";
import { fetchWeekRows, WeekRow } from "./sleeper";
import { demoStats, ptsFrom } from "./weeks";
import { seasonFor } from "./schedule";
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

const asPlayer = (fa: FaLite) => ({ id: fa.id, name: fa.name, pos: fa.pos, nfl: fa.nfl, proj: fa.proj }) as Player;

const mix = (k: string) => { let h = 2166136261; for (const ch of k) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967295; };
/** Demo: the same made up season the player sheet and Start / Sit use, with a stat line built from the points. */
function demoCells(week: number, fas: FaLite[]): WkCells {
  const out: WkCells = {};
  for (const fa of fas) {
    const c = seasonFor(asPlayer(fa)).find((x) => x.week === week);
    if (!c || c.opp === null) { out[fa.id] = { pts: null, played: false }; continue; }
    const opp = oppLabel(c.opp);
    const st = week === WEEK ? gameState(fa.nfl) : null;
    if (week < WEEK || st === "in_game" || st === "complete") {
      // Week first in the seed, so neighbouring weeks don't land on near identical numbers. A game in progress is about half done.
      const pts = Math.round(Math.max(0, fa.proj || 6) * (0.35 + mix(`${week}:${fa.id}`) * 1.3) * (st === "in_game" ? 0.5 : 1) * 10) / 10;
      out[fa.id] = { pts, opp, played: true, line: shortLine(fa.pos, demoStats(fa.pos, pts, week * 97 + fa.id.length)) };
    } else out[fa.id] = { pts: c.proj ?? fa.proj, opp, played: false };
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
    if (week > WEEK) { out[fa.id] = { pts: row ? ptsFrom(fa.pos, row.stats) : 0, opp: oppLabel(o), played: false }; continue; }
    out[fa.id] = { pts: has ? ptsFrom(fa.pos, row!.stats) : 0, opp: oppLabel(o), played: has, line: has ? shortLine(fa.pos, row!.stats) : undefined };
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
export interface WeekPick { week: number; kind: "past" | "future"; rec: WaiverRec; pts: number; gain: number }
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
