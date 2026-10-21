// Game log and depth chart for the player sheet and the waiver claim sheet.
// Live leagues read Sleeper: weekly stats and projections by position (the same feeds the usage block reads), the NFL
// schedule for opponents and byes, and the player file for depth charts. The demo league builds both from its own
// season, so every number agrees with the rest of the demo. Nothing here is made up for a live league: a stat Sleeper
// doesn't send is left out and the table shows "–".
import { FREE_AGENTS, LEAGUE, PLAYERS, Player, SPECIAL_FREE_AGENTS, TEAMS, WEEK, isDemo } from "./data";
import { eff, round1 } from "./engine";
import { seasonFor } from "./schedule";
import { DepthRow, StatRow, fetchDepthRows, fetchProjRows, fetchSchedule, fetchStatRows, scoreStats } from "./sleeper";
import { demoLine, oppTeam, ptsOf } from "./usage";
import { demoBye, demoStats } from "./weeks";

export type Stats = Record<string, number | undefined>;
/** Anyone a sheet can show: a rostered player, a free agent, a kicker or a defense. */
export interface Subject { id: string; name: string; pos: "QB" | "RB" | "WR" | "TE" | "K" | "DEF"; nfl: string; proj: number; rookie?: boolean }

export interface LogRow {
  week: number;
  /** "@KC" or "vKC". null on a bye. */
  opp: string | null;
  bye: boolean;
  when: "past" | "now" | "future";
  proj?: number;
  pts?: number;
  /** His stat line. Undefined when he has none for a week that's been played. */
  stats?: Stats;
  /** Past week with no line: the feed answered and he wasn't in it ("dnp"), or the feed didn't answer ("na"). */
  miss?: "dnp" | "na";
}
export interface SeasonLog { season: string; rows: LogRow[]; demo: boolean; team?: string; empty?: string }

const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967295; };
const NFL = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"];
export const seasonsFor = () => { const y = Number(LEAGUE.season); return Number.isFinite(y) ? [String(y), String(y - 1)] : [LEAGUE.season]; };

/** Points for a line, scored like the rest of the app: the league's scoring_settings (live), or the demo totals. */
const score = (pos: string, s: Stats) => (pos === "K" || pos === "DEF") && LEAGUE.scoring ? scoreStats(s, LEAGUE.scoring, pos) : ptsOf(pos, s);

// ---- Demo ------------------------------------------------------------------------
/** A Player-shaped stand-in for seasonFor, so free agents, kickers and defenses get the same demo slate. */
function asPlayer(s: Subject): Player {
  const known = PLAYERS[s.id];
  if (known) return known;
  const sp = LEAGUE.specials?.[s.id] ?? SPECIAL_FREE_AGENTS.find((f) => f.id === s.id);
  return { id: s.id, name: s.name, pos: s.pos as Player["pos"], nfl: s.nfl, proj: s.proj || sp?.proj || 6, opp: sp?.opp };
}
/** Skill lines from the usage block's demo generator (so the sheet's usage and the log agree); kickers and defenses
 *  from the week browser's. Points always come from the line itself or the demo season, never both. */
function demoRow(s: Subject, pts: number, seed: number): { stats: Stats; pts: number } {
  if (s.pos === "K" || s.pos === "DEF") {
    const st = demoStats(s.pos, pts, seed);
    return { stats: st, pts: LEAGUE.scoring ? scoreStats(st, LEAGUE.scoring, s.pos) : pts };
  }
  const st = demoLine({ id: s.id, pos: s.pos, proj: s.proj }, seed, pts);
  // Now and then a fumble he recovers, so the column isn't all zeros
  return { stats: { ...st, fum: hash(`${s.id}:${seed}:fum`) > 0.92 ? 1 : 0, fum_lost: 0 }, pts };
}
/** This week's number agrees with the sheet's Overview: the engine's projection (0 when he's out, on IR or on bye). */
const nowProj = (s: Subject, fallback?: number) => { const p = PLAYERS[s.id]; if (!p) return fallback; const v = round1(eff(p, true)); return v > 0 ? v : undefined; };
const demoProj = (s: Subject, w: number, base: number) => round1(base * (0.86 + hash(`${s.id}:${w}:proj`) * 0.28));

function demoCurrent(s: Subject): SeasonLog {
  const p = asPlayer(s);
  const rows: LogRow[] = seasonFor(p).map((c) => {
    if (!c.opp) return { week: c.week, opp: null, bye: true, when: c.week < WEEK ? "past" : c.week === WEEK ? "now" : "future" };
    if (c.week > WEEK) return { week: c.week, opp: c.opp, bye: false, when: "future", proj: c.proj };
    if (c.week === WEEK) return { week: c.week, opp: c.opp, bye: false, when: "now", proj: nowProj(s, c.proj ?? (p.proj || undefined)) };
    if (c.pts === undefined) return { week: c.week, opp: c.opp, bye: false, when: "past", miss: "dnp" };
    const r = demoRow(s, c.pts, c.week);
    return { week: c.week, opp: c.opp, bye: false, when: "past", proj: demoProj(s, c.week, p.proj || 6), ...r };
  });
  return { season: LEAGUE.season, rows, demo: true, team: s.nfl };
}
function demoLast(s: Subject, season: string): SeasonLog {
  if (s.rookie) return { season, rows: [], demo: true, empty: `${s.name} was still in college in ${season}.` };
  const base = s.proj || 6, bye = Math.min(14, demoBye(s.nfl) + 1);
  const others = NFL.filter((t) => t !== s.nfl), ti = Math.max(0, NFL.indexOf(s.nfl));
  const rows: LogRow[] = Array.from({ length: 18 }, (_, i) => i + 1).map((w) => {
    if (w === bye) return { week: w, opp: null, bye: true, when: "past" };
    const opp = (hash(`${s.nfl}${w}ly`) > 0.5 ? "v" : "@") + others[(ti * 5 + w * 13) % others.length];
    // A couple of missed games for anyone banged up, so last season doesn't read perfect
    if (hash(`${s.id}:${w}:out`) > 0.94) return { week: w, opp, bye: false, when: "past", miss: "dnp" };
    const pts = round1(base * 0.92 * (0.45 + hash(`${s.id}:${w}:ly`) * 1.1));
    return { week: w, opp, bye: false, when: "past", proj: demoProj(s, w + 100, base * 0.92), ...demoRow(s, pts, w + 100) };
  });
  return { season, rows, demo: true, team: s.nfl };
}

// ---- Live ------------------------------------------------------------------------
type Sched = { week: number; home: string; away: string }[];
const oppFrom = (sched: Sched, team: string, w: number) => {
  const g = sched.find((x) => x.week === w && (x.home === team || x.away === team));
  return g ? (g.home === team ? `v${g.away}` : `@${g.home}`) : null;
};
async function weekRows(season: string, weeks: number[], pos: string) {
  const [stats, proj] = await Promise.all([
    Promise.all(weeks.map((w) => fetchStatRows(season, w, pos).catch(() => null as StatRow[] | null))),
    Promise.all(weeks.map((w) => fetchProjRows(season, w, pos).catch(() => null as StatRow[] | null))),
  ]);
  return { stats, proj };
}
const played = (s?: Stats) => !!s && ((s.gp ?? 0) > 0 || (s.off_snp ?? 0) > 0 || Object.values(s).some((v) => typeof v === "number" && v !== 0));

async function liveLog(s: Subject, season: string): Promise<SeasonLog> {
  const current = season === LEAGUE.season;
  const slate = current ? LEAGUE.slate : undefined;
  const sched: Sched = current && slate ? [] : await fetchSchedule(season).catch(() => [] as Sched);
  const last = current ? Math.max(0, ...Object.values(slate?.opp ?? {}).flatMap((o) => Object.keys(o).map(Number))) : Math.max(0, ...sched.map((g) => g.week));
  const weeks = Array.from({ length: last || 18 }, (_, i) => i + 1);
  const past = weeks.filter((w) => !current || w < WEEK);
  const { stats, proj } = await weekRows(season, past, s.pos);
  if (past.length && stats.every((x) => !x)) throw new Error("no stats");
  const mine = (list: StatRow[] | null) => list?.find((r) => r.player_id === s.id);
  // Last season he may have played for someone else: use the team on his own stat lines
  let team = s.nfl;
  if (!current) {
    const count = new Map<string, number>();
    stats.forEach((l) => { const t = mine(l)?.team; if (t) count.set(t, (count.get(t) ?? 0) + 1); });
    const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top) return { season, rows: [], demo: false, empty: `No ${season} games on record for ${s.name}.` };
    team = top[0];
  }
  const oppOf = (w: number) => (current ? slate?.opp[team]?.[w] ?? null : oppFrom(sched, team, w));
  const knowsByes = current ? !!slate?.opp[team] : sched.length > 0;
  const rows: LogRow[] = weeks.map((w) => {
    const i = past.indexOf(w);
    const row = i >= 0 ? mine(stats[i]) : undefined;
    // His own line names the opponent when the schedule doesn't (traded mid-season, say)
    let opp = oppOf(w);
    if (!opp && row?.opponent) opp = `v${oppTeam(row.opponent)}`;
    const bye = !opp && knowsByes && !played(row?.stats);
    const when = !current || w < WEEK ? "past" : w === WEEK ? "now" : "future";
    if (bye) return { week: w, opp: null, bye: true, when };
    if (when !== "past") return { week: w, opp, bye: false, when, proj: when === "now" ? nowProj(s, slate?.proj[s.id]?.[w]) : slate?.proj[s.id]?.[w] };
    const pr = mine(proj[i]);
    const projPts = pr?.stats ? score(s.pos, pr.stats) : undefined;
    const projV = projPts !== undefined && projPts > 0 ? round1(projPts) : undefined;
    if (!row || !played(row.stats)) return { week: w, opp, bye: false, when, proj: projV, miss: stats[i] ? "dnp" : "na", pts: current ? slate?.pts[s.id]?.[w] : undefined };
    const pts = score(s.pos, row.stats);
    return { week: w, opp, bye: false, when, proj: projV, stats: row.stats, pts: pts !== undefined ? Math.round(pts * 100) / 100 : undefined };
  });
  return { season, rows, demo: false, team };
}

const logCache = new Map<string, Promise<SeasonLog>>();
const logKey = (s: Subject, season: string) => `${LEAGUE.mode}:${LEAGUE.id}:${WEEK}:${s.id}:${season}`;
/** Ready right away (demo, or already loaded), so the tab can skip its skeleton. */
export function peekLog(s: Subject, season: string): SeasonLog | undefined {
  if (isDemo()) return season === LEAGUE.season ? demoCurrent(s) : demoLast(s, season);
  return done.get(logKey(s, season));
}
const done = new Map<string, SeasonLog>();
export function loadLog(s: Subject, season: string): Promise<SeasonLog> {
  const key = logKey(s, season);
  const hit = logCache.get(key);
  if (hit) return hit;
  const run = isDemo() ? Promise.resolve(peekLog(s, season)!) : liveLog(s, season);
  logCache.set(key, run);
  run.then((v) => done.set(key, v), () => { if (logCache.get(key) === run) logCache.delete(key); });
  return run;
}

// ---- Depth chart -------------------------------------------------------------------
export interface DepthEntry { id: string; name: string; injury?: string | null; owner?: { you: boolean; label: string }; tappable: boolean }
export interface DepthGroup { key: string; label: string; entries: DepthEntry[] }
export interface Depth { team: string; groups: DepthGroup[]; demo: boolean }

const GROUPS: { key: string; label: string; slots: string[] }[] = [
  { key: "QB", label: "QB", slots: ["QB"] },
  { key: "RB", label: "RB", slots: ["RB"] },
  { key: "WR1", label: "WR1", slots: ["LWR", "WR"] },
  { key: "WR2", label: "WR2", slots: ["RWR"] },
  { key: "WR3", label: "WR3", slots: ["SWR"] },
  { key: "TE", label: "TE", slots: ["TE"] },
  { key: "K", label: "K", slots: ["K", "PK"] },
];
/** Which group a player sits in, so the sheet can point at it. */
export const groupOf = (d: Depth, id: string) => d.groups.find((g) => g.entries.some((e) => e.id === id))?.key;

function ownerOf(id: string): DepthEntry["owner"] {
  const t = TEAMS.find((x) => [...x.roster, ...(x.ir ?? []), ...(x.taxi ?? []), ...(x.special ?? [])].includes(id));
  return t ? { you: !!t.you, label: t.you ? "Yours" : t.manager } : undefined;
}
const PER_GROUP = 4;

function demoDepth(team: string): Depth {
  type C = { id: string; name: string; pos: string; proj: number; injury?: string | null };
  const pool: C[] = [];
  const seen = new Set<string>();
  const push = (c: C) => { if (!seen.has(c.id)) { seen.add(c.id); pool.push(c); } };
  for (const p of Object.values(PLAYERS)) if (p.nfl === team) push({ id: p.id, name: p.name, pos: p.pos, proj: p.proj, injury: p.injury === "IR" ? "IR" : p.status === "O" ? "Out" : p.status === "Q" ? "Questionable" : null });
  for (const f of FREE_AGENTS) if (f.nfl === team) push({ id: f.id, name: f.name, pos: f.pos, proj: f.proj });
  for (const k of [...Object.values(LEAGUE.specials ?? {}), ...SPECIAL_FREE_AGENTS]) if (k.pos === "K" && k.nfl === team) push({ id: k.id, name: k.name, pos: "K", proj: k.proj });
  const by = (pos: string) => pool.filter((c) => c.pos === pos).sort((a, b) => b.proj - a.proj);
  const wr = by("WR");
  const lists: Record<string, C[]> = { QB: by("QB"), RB: by("RB"), WR1: wr.filter((_, i) => i % 3 === 0), WR2: wr.filter((_, i) => i % 3 === 1), WR3: wr.filter((_, i) => i % 3 === 2), TE: by("TE"), K: by("K") };
  const groups = GROUPS.map((g) => ({ key: g.key, label: g.label, entries: (lists[g.key] ?? []).slice(0, PER_GROUP).map((c) => ({ id: c.id, name: c.name, injury: c.injury, owner: ownerOf(c.id), tappable: !!PLAYERS[c.id] })) }));
  // Every group shows, so the chart reads complete; one with nobody from the demo league says so
  return { team, groups: groups.some((g) => g.entries.length) ? groups : [], demo: true };
}

function liveDepth(team: string, rows: DepthRow[]): Depth {
  const mine = rows.filter((r) => r.team === team);
  const groups = GROUPS.map((g) => {
    const list = mine.filter((r) => g.slots.includes(r.slot) && (g.key !== "RB" || r.pos === "RB")).sort((a, b) => a.order - b.order);
    const uniq = list.filter((r, i) => list.findIndex((x) => x.id === r.id) === i).slice(0, PER_GROUP);
    return { key: g.key, label: g.label, entries: uniq.map((r) => ({ id: r.id, name: r.name || PLAYERS[r.id]?.name || `Player ${r.id}`, injury: r.injury, owner: ownerOf(r.id), tappable: !!PLAYERS[r.id] })) };
  });
  return { team, groups: groups.filter((g) => g.entries.length), demo: false };
}

export function peekDepth(team: string): Depth | undefined { return isDemo() ? demoDepth(team) : undefined; }
export async function loadDepth(team: string): Promise<Depth> {
  if (isDemo()) return demoDepth(team);
  return liveDepth(team, await fetchDepthRows());
}
