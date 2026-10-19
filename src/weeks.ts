// Week browser: any past week (who you started, what they scored, their stat line)
// or any future week (projections, with byes shown as byes). Live leagues read Sleeper;
// the demo league builds a believable season from its projections.
import { LEAGUE, PLAYERS, WEEK, YOU, isDemo, defName } from "./data";
import { currentFormat } from "./engine";
import { fetchWeekRows, WeekRow } from "./sleeper";

export interface WeekPlayer {
  id: string; name: string; pos: string; nfl: string;
  /** Points scored (past) or projected (future). null = bye. */
  pts: number | null;
  line?: string;
}
export interface WeekView {
  week: number;
  kind: "past" | "future";
  starters: { slot: string; p: WeekPlayer | null }[];
  bench: WeekPlayer[];
  total: number;
  oppTotal?: number;
  oppName?: string;
  /** Set when the week can't be shown, with a plain reason. */
  empty?: string;
}

const cache = new Map<string, WeekView>();
export const clearWeekCache = () => cache.clear();
export const lastWeek = () => LEAGUE.lastWeek ?? 17;

// ---- Stat lines ------------------------------------------------------------
const n = (v: number | undefined) => Math.round(v ?? 0);
export function statLine(pos: string, s: Record<string, number | undefined>): string {
  const parts: string[] = [];
  if (pos === "QB") {
    parts.push(`${n(s.pass_cmp)}/${n(s.pass_att)}, ${n(s.pass_yd)} yd${s.pass_td ? `, ${n(s.pass_td)} TD` : ""}${s.pass_int ? `, ${n(s.pass_int)} INT` : ""}`);
    if (s.rush_att) parts.push(`${n(s.rush_att)} rush, ${n(s.rush_yd)} yd${s.rush_td ? `, ${n(s.rush_td)} TD` : ""}`);
  } else if (pos === "RB") {
    parts.push(`${n(s.rush_att)} car, ${n(s.rush_yd)} yd${s.rush_td ? `, ${n(s.rush_td)} TD` : ""}`);
    if (s.rec || s.rec_tgt) parts.push(`${n(s.rec)} rec, ${n(s.rec_yd)} yd${s.rec_td ? `, ${n(s.rec_td)} TD` : ""}`);
  } else if (pos === "WR" || pos === "TE") {
    parts.push(`${n(s.rec)}${s.rec_tgt ? `/${n(s.rec_tgt)}` : ""} rec, ${n(s.rec_yd)} yd${s.rec_td ? `, ${n(s.rec_td)} TD` : ""}`);
    if (s.rush_att) parts.push(`${n(s.rush_att)} rush, ${n(s.rush_yd)} yd`);
  } else if (pos === "K") {
    parts.push(`${n(s.fgm)}/${n(s.fga)} FG, ${n(s.xpm)}/${n(s.xpa)} XP`);
  } else if (pos === "DEF") {
    parts.push(`${n(s.pts_allow)} pts allowed${s.sack ? `, ${n(s.sack)} sack${n(s.sack) === 1 ? "" : "s"}` : ""}${s.int ? `, ${n(s.int)} INT` : ""}${s.def_td ? `, ${n(s.def_td)} TD` : ""}`);
  }
  return parts.join(" · ");
}

const ptsFrom = (pos: string, s: Record<string, number | undefined>) => {
  const f = currentFormat();
  const base = f.scoring === "ppr" ? s.pts_ppr : f.scoring === "half" ? s.pts_half_ppr : s.pts_std;
  return Math.round(((base ?? 0) + (f.tePremium && pos === "TE" ? (s.rec ?? 0) * 0.5 : 0)) * 10) / 10;
};

// ---- Best lineup for a set of weekly numbers --------------------------------
const FITS: Record<string, string[]> = {
  QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"], WRRB_FLEX: ["RB", "WR"], REC_FLEX: ["WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};
const SLOT_NAME: Record<string, string> = { WRRB_FLEX: "FLEX", REC_FLEX: "FLEX", SUPER_FLEX: "SF" };
function bestLineup(pool: WeekPlayer[], order: string[]) {
  const sorted = [...pool].sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1));
  const used = new Set<string>();
  // Fixed positions first, flex slots after, so flex gets the best leftover
  const rank = (s: string) => (FITS[s]?.length ?? 1) > 1 ? 1 : 0;
  const idx = order.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s));
  const out: { slot: string; p: WeekPlayer | null }[] = order.map((s) => ({ slot: SLOT_NAME[s] ?? s, p: null }));
  for (const { s, i } of idx) {
    const p = sorted.find((x) => !used.has(x.id) && (FITS[s] ?? [s]).includes(x.pos));
    if (p) { used.add(p.id); out[i].p = p; }
  }
  return { starters: out, bench: sorted.filter((p) => !used.has(p.id)) };
}

const order = () => LEAGUE.lineupOrder ?? [...LEAGUE.slots.map((s) => (s === "SF" ? "SUPER_FLEX" : s)), ...(LEAGUE.specialSlots ?? [])];
const myIds = () => [...YOU.roster, ...(YOU.special ?? [])];
function info(id: string, row?: WeekRow): Omit<WeekPlayer, "pts"> {
  const p = PLAYERS[id];
  if (p) return { id, name: p.name, pos: p.pos, nfl: p.nfl };
  const s = LEAGUE.specials?.[id];
  if (s) return { id, name: s.name, pos: s.pos, nfl: s.nfl };
  if (/^[A-Z]{2,3}$/.test(id)) return { id, name: defName(id), pos: "DEF", nfl: id };
  const pl = row?.player;
  return { id, name: pl ? [pl.first_name, pl.last_name].filter(Boolean).join(" ") : `Player ${id}`, pos: pl?.position ?? "", nfl: row?.team ?? pl?.team ?? "" };
}

// ---- Demo season ------------------------------------------------------------
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };
const TEAMS = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LV", "LAC", "LAR", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SF", "SEA", "TB", "TEN", "WAS"];
/** Demo bye week per NFL team. The Lineup, the Start / Sit compare and the player sheet all read it, so they agree. */
export const demoBye = (team: string) => (team === "PIT" || team === "NE" ? 7 : 5 + (TEAMS.indexOf(team) % 10) + (TEAMS.indexOf(team) % 10 >= 2 ? 1 : 0));
function demoStats(pos: string, pts: number, seed: number): Record<string, number> {
  const r = (a: number, b: number) => Math.round(a + (b - a) * hash(`${seed}${a}${b}`));
  if (pos === "QB") { const td = Math.max(0, Math.round(pts / 8)); return { pass_cmp: r(16, 27), pass_att: r(28, 40), pass_yd: Math.round(pts * 11 + 40), pass_td: td, pass_int: r(0, 1), rush_att: r(1, 7), rush_yd: r(2, 38) }; }
  if (pos === "RB") return { rush_att: r(9, 21), rush_yd: Math.round(pts * 4.2), rush_td: pts > 15 ? 1 : 0, rec: r(1, 5), rec_tgt: r(2, 6), rec_yd: r(4, 35) };
  if (pos === "WR" || pos === "TE") { const rec = Math.max(1, Math.round(pts / 3)); return { rec, rec_tgt: rec + r(1, 4), rec_yd: Math.round(pts * 6.5), rec_td: pts > 16 ? 1 : 0 }; }
  if (pos === "K") return { fgm: r(1, 3), fga: r(2, 4), xpm: r(1, 4), xpa: r(2, 4) };
  return { pts_allow: r(10, 31), sack: r(1, 5), int: r(0, 2) };
}
function demoWeek(week: number): WeekView {
  const past = week < WEEK;
  const pool: WeekPlayer[] = myIds().map((id) => {
    const i = info(id);
    const base = PLAYERS[id]?.proj ?? LEAGUE.specials?.[id]?.proj ?? 0;
    if (demoBye(i.nfl) === week) return { ...i, pts: null };
    const swing = past ? 0.35 + hash(`${id}w${week}`) * 1.4 : 0.9 + hash(`${id}f${week}`) * 0.2;
    const pts = Math.round(base * swing * 10) / 10;
    return { ...i, pts, line: past ? statLine(i.pos, demoStats(i.pos, pts, week * 97 + id.length)) : undefined };
  });
  const { starters, bench } = bestLineup(pool, order());
  const total = Math.round(starters.reduce((s, x) => s + (x.p?.pts ?? 0), 0) * 10) / 10;
  return { week, kind: past ? "past" : "future", starters, bench, total, oppTotal: past ? Math.round((total * (0.8 + hash(`opp${week}`) * 0.4)) * 10) / 10 : undefined, oppName: past ? ["Mike", "Chris", "Dan", "Kev", "Taylor", "Sam"][week % 6] : undefined };
}

// ---- Live ---------------------------------------------------------------------
async function liveWeek(week: number): Promise<WeekView> {
  const past = week < WEEK;
  const rows = await fetchWeekRows(LEAGUE.season, week, past ? "stats" : "projections");
  const playing = new Set([...rows.values()].filter((r) => r.team && Object.keys(r.stats ?? {}).length).map((r) => r.team!));
  const make = (id: string, scored?: number): WeekPlayer => {
    const row = rows.get(id);
    const i = info(id, row);
    const teamOff = i.nfl && playing.size >= 20 && !playing.has(i.nfl);
    if (teamOff) return { ...i, pts: null };
    if (past) return { ...i, pts: scored ?? (row ? ptsFrom(i.pos, row.stats) : 0), line: row ? statLine(i.pos, row.stats) : "Did not play" };
    return { ...i, pts: row ? ptsFrom(i.pos, row.stats) : 0 };
  };
  if (past) {
    const h = LEAGUE.history?.[week];
    if (!h || !h.players.length) return { week, kind: "past", starters: [], bench: [], total: 0, empty: `No matchup data for Week ${week}.` };
    const ord = order();
    const starters = h.starters.map((id, i) => ({ slot: SLOT_NAME[ord[i]] ?? ord[i] ?? "FLEX", p: make(id, h.points[id]) }));
    const bench = h.players.filter((id) => !h.starters.includes(id)).map((id) => make(id, h.points[id])).sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1));
    return { week, kind: "past", starters, bench, total: h.total, oppTotal: h.oppTotal, oppName: h.oppName };
  }
  const { starters, bench } = bestLineup(myIds().map((id) => make(id)), order());
  const total = Math.round(starters.reduce((s, x) => s + (x.p?.pts ?? 0), 0) * 10) / 10;
  return { week, kind: "future", starters, bench, total };
}

const keyFor = (week: number) => `${LEAGUE.id}|${week}|${currentFormat().scoring}|${currentFormat().tePremium}`;
/** A week that's ready right now: already cached, or a demo week (built on the spot). Lets a view skip its loading state. */
export function peekWeek(week: number): WeekView | undefined {
  const hit = cache.get(keyFor(week));
  if (hit || !isDemo()) return hit;
  const v = demoWeek(week);
  cache.set(keyFor(week), v);
  return v;
}

export async function loadWeek(week: number): Promise<WeekView> {
  const key = keyFor(week);
  const hit = cache.get(key);
  if (hit) return hit;
  const v = isDemo() ? demoWeek(week) : await liveWeek(week);
  cache.set(key, v);
  return v;
}
