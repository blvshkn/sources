// Usage and matchup numbers for the player sheet. Live leagues read Sleeper's weekly stats for the player's
// position (every player league-wide, one call per past week, cached). The demo league builds believable weekly
// lines from the same points the schedule strip and game log show, so the numbers agree across the sheet.
import { LEAGUE, PLAYERS, Player, Pos, WEEK, isDemo } from "./data";
import { currentFormat } from "./engine";
import { seasonFor } from "./schedule";
import { fetchStatRows } from "./sleeper";

type Stats = Record<string, number | undefined>;
interface Row { id: string; team: string | null; opp: string | null; stats: Stats }
export interface PosWeeks { weeks: number[]; rows: Map<number, Row[]>; demo: boolean }

/** FNV with a murmur-style finish, so keys that differ by one character still land far apart. */
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967295; };
const pastWeeks = () => Array.from({ length: Math.max(0, WEEK - 1) }, (_, i) => i + 1);
/** "vs TB", "@ TB", "@TB", "vTB" or "TB" to "TB". */
export const oppTeam = (opp?: string | null) => (opp ?? "").replace(/^(vs\s*|@\s*|v(?=[A-Z]{2,3}$))/, "").trim() || null;

/** Fantasy points for a stat line in this league's format. */
export function ptsOf(pos: string, s: Stats): number | undefined {
  const f = currentFormat();
  const base = f.scoring === "ppr" ? s.pts_ppr : f.scoring === "half" ? s.pts_half_ppr : s.pts_std;
  if (base === undefined) return undefined;
  return base + (f.tePremium && pos === "TE" ? (s.rec ?? 0) * 0.5 : 0);
}
/** Played that week: Sleeper marks games played, or he logged a snap or a point. */
const played = (s: Stats) => (s.gp ?? 0) > 0 || (s.off_snp ?? 0) > 0 || (s.pts_ppr ?? 0) !== 0;

// ---- Demo lines ----------------------------------------------------------
/** A stat line that adds up to roughly `pts` PPR points, shaped by position and role. */
function demoLine(p: Player, w: number, pts: number): Stats {
  const r = (k: string) => hash(`${p.id}:${w}:${k}`);
  const role = Math.min(1, p.proj / 20);
  const td = pts >= 26 ? 2 : pts >= 15 ? 1 : 0;
  const snaps = 62 + Math.round(r("t") * 12);
  const out: Stats = { gp: 1, tm_off_snp: snaps, pts_ppr: pts };
  if (p.pos === "QB") {
    const rushYd = Math.round(r("ry") * 30 * (0.5 + role)), rushTd = pts > 26 && r("rt") > 0.6 ? 1 : 0, passTd = Math.max(0, Math.round((pts - rushYd / 10 - rushTd * 6) / 9));
    const passYd = Math.max(90, Math.round((pts - passTd * 4 - rushYd / 10 - rushTd * 6 + (r("i") > 0.6 ? 2 : 0)) * 25));
    const att = 26 + Math.round(r("pa") * 14);
    Object.assign(out, { off_snp: snaps - Math.round(r("s") * 3), pass_att: att, pass_cmp: Math.round(att * (0.58 + r("pc") * 0.14)), pass_yd: passYd, pass_td: passTd, pass_int: r("i") > 0.6 ? 1 : 0,
      rush_att: 2 + Math.round(r("ra") * 6 * (0.5 + role)), rush_yd: rushYd, rush_td: rushTd, pass_rz_att: 2 + Math.round(r("pz") * 5), rush_rz_att: Math.round(r("rz") * 2) });
  } else if (p.pos === "RB") {
    const share = Math.min(0.84, Math.max(0.32, 0.3 + role * 0.55 + (r("sh") - 0.5) * 0.12));
    const rec = Math.max(0, Math.round(1 + role * 3 + (r("rc") - 0.5) * 3)), tgt = rec + Math.round(r("tg") * 2);
    const yds = Math.max(8, Math.round((pts - rec - td * 6) * 10)), recYd = Math.round(yds * (0.15 + r("ry") * 0.2)), rushYd = yds - recYd;
    const car = Math.max(3, Math.round(rushYd / (3.4 + r("yc") * 1.8)));
    Object.assign(out, { off_snp: Math.round(snaps * share), rush_att: car, rush_yd: rushYd, rush_td: td, rec, rec_tgt: tgt, rec_yd: recYd, rec_td: 0,
      rush_rz_att: Math.round(car * (0.08 + r("rz") * 0.1) + td), rec_rz_tgt: r("rt") > 0.75 ? 1 : 0 });
  } else {
    const te = p.pos === "TE", share = Math.min(0.96, Math.max(0.45, (te ? 0.5 : 0.55) + role * 0.4 + (r("sh") - 0.5) * 0.1));
    const rec = Math.max(1, Math.round((pts - td * 6) * (te ? 0.38 : 0.35) * (0.85 + r("rc") * 0.3))), yds = Math.max(6, Math.round((pts - rec - td * 6) * 10));
    Object.assign(out, { off_snp: Math.round(snaps * share), rec, rec_tgt: rec + 1 + Math.round(r("tg") * (te ? 2 : 3)), rec_yd: yds, rec_td: td, rec_rz_tgt: Math.round(r("rz") * 1.6 + td * 0.6) });
  }
  // Keep the other scoring keys in step so half and standard leagues read the same line
  out.pts_half_ppr = pts - (out.rec ?? 0) * 0.5; out.pts_std = pts - (out.rec ?? 0);
  return out;
}

function demoWeeks(pos: Pos): PosWeeks {
  const rows = new Map<number, Row[]>();
  const ps = Object.values(PLAYERS).filter((p) => p.pos === pos);
  for (const p of ps) for (const c of seasonFor(p)) {
    if (!c.past || !c.opp || c.pts === undefined) continue;
    (rows.get(c.week) ?? rows.set(c.week, []).get(c.week)!).push({ id: p.id, team: p.nfl, opp: oppTeam(c.opp), stats: demoLine(p, c.week, c.pts) });
  }
  return { weeks: pastWeeks(), rows, demo: true };
}

// ---- Live -----------------------------------------------------------------
const cache = new Map<string, Promise<PosWeeks>>();
/** Every past week of stats for one position. */
export function loadPosWeeks(pos: Pos): Promise<PosWeeks> {
  const key = `${LEAGUE.mode}:${LEAGUE.id}:${LEAGUE.season}:${WEEK}:${pos}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const run: Promise<PosWeeks> = isDemo() ? Promise.resolve(demoWeeks(pos)) : (async () => {
    const weeks = pastWeeks();
    const all = await Promise.all(weeks.map((w) => fetchStatRows(LEAGUE.season, w, pos).catch(() => null)));
    if (all.every((x) => !x)) throw new Error("no stats");
    const rows = new Map<number, Row[]>();
    all.forEach((list, i) => {
      const w = weeks[i];
      rows.set(w, (list ?? []).filter((r) => r.stats && played(r.stats)).map((r) => ({
        id: r.player_id, team: r.team, stats: r.stats,
        // Sleeper's stat rows name the opponent; fall back to the season slate when a row doesn't
        opp: r.opponent ?? (r.team ? oppTeam(LEAGUE.slate?.opp[r.team]?.[w]) : null),
      })));
    });
    return { weeks, rows, demo: false };
  })();
  cache.set(key, run);
  run.catch(() => { if (cache.get(key) === run) cache.delete(key); });
  return run;
}

// ---- Usage table -----------------------------------------------------------
export interface UsageRow { key: string; label: string; tip?: string; last3: number; season: number; rank?: number; of?: number; pct?: boolean; dec?: number }
export interface Usage { rows: UsageRow[]; games: number; first: number; last: number; demo: boolean }

type Def = { key: string; label: string; tip?: string; num: (s: Stats) => number | undefined; den?: (s: Stats) => number | undefined; pct?: boolean; dec?: number };
const has = (s: Stats, ...k: string[]) => k.some((x) => s[x] !== undefined);
const sum = (s: Stats, ...k: string[]) => (has(s, ...k) ? k.reduce((a, x) => a + (s[x] ?? 0), 0) : undefined);
const SNAP: Def = { key: "snap", label: "Snap share", tip: "Share of his team's offensive snaps he was on the field for.", num: (s) => s.off_snp, den: (s) => (s.off_snp !== undefined ? s.tm_off_snp : undefined), pct: true };
const DEFS: Record<Pos, Def[]> = {
  QB: [SNAP,
    { key: "patt", label: "Pass attempts", num: (s) => s.pass_att },
    { key: "pyd", label: "Pass yards", num: (s) => s.pass_yd, dec: 0 },
    { key: "ptd", label: "Pass TD", num: (s) => s.pass_td },
    { key: "ratt", label: "Carries", num: (s) => s.rush_att },
    { key: "ryd", label: "Rush yards", num: (s) => s.rush_yd },
    { key: "rz", label: "Red-zone looks", tip: "Pass attempts plus carries inside the opponent's 20.", num: (s) => sum(s, "pass_rz_att", "rush_rz_att") }],
  RB: [SNAP,
    { key: "car", label: "Carries", num: (s) => s.rush_att },
    { key: "tgt", label: "Targets", num: (s) => s.rec_tgt },
    { key: "rec", label: "Receptions", num: (s) => s.rec },
    { key: "rz", label: "Red-zone looks", tip: "Carries plus targets inside the opponent's 20. The touches that turn into touchdowns.", num: (s) => sum(s, "rush_rz_att", "rec_rz_tgt") },
    { key: "ypt", label: "Yards per touch", tip: "Rushing plus receiving yards, divided by carries plus catches.", num: (s) => sum(s, "rush_yd", "rec_yd"), den: (s) => sum(s, "rush_att", "rec") }],
  WR: [SNAP,
    { key: "tgt", label: "Targets", num: (s) => s.rec_tgt },
    { key: "rec", label: "Receptions", num: (s) => s.rec },
    { key: "yd", label: "Receiving yards", num: (s) => s.rec_yd, dec: 0 },
    { key: "rz", label: "Red-zone targets", tip: "Targets inside the opponent's 20.", num: (s) => s.rec_rz_tgt },
    { key: "ypr", label: "Yards per catch", num: (s) => s.rec_yd, den: (s) => s.rec }],
  TE: [SNAP,
    { key: "tgt", label: "Targets", num: (s) => s.rec_tgt },
    { key: "rec", label: "Receptions", num: (s) => s.rec },
    { key: "yd", label: "Receiving yards", num: (s) => s.rec_yd, dec: 0 },
    { key: "rz", label: "Red-zone targets", tip: "Targets inside the opponent's 20.", num: (s) => s.rec_rz_tgt },
    { key: "ypr", label: "Yards per catch", num: (s) => s.rec_yd, den: (s) => s.rec }],
};

/** Per-game average (or a ratio of sums) over a set of weekly lines. undefined when the stat isn't in the feed. */
function agg(d: Def, lines: Stats[]): number | undefined {
  const nums = lines.map(d.num), dens = d.den ? lines.map(d.den) : null;
  if (nums.every((v) => v === undefined)) return undefined;
  const n = nums.reduce<number>((a, v) => a + (v ?? 0), 0);
  if (!dens) return n / lines.length;
  const dd = dens.reduce<number>((a, v) => a + (v ?? 0), 0);
  return dd > 0 ? n / dd : undefined;
}

/** His last three games next to his season, with where his season ranks at his position. */
export function usageFor(p: Player, data: PosWeeks): Usage | null {
  const byPlayer = new Map<string, Stats[]>();
  for (const w of data.weeks) for (const r of data.rows.get(w) ?? []) (byPlayer.get(r.id) ?? byPlayer.set(r.id, []).get(r.id)!).push(r.stats);
  const mine = byPlayer.get(p.id) ?? [];
  if (!mine.length) return null;
  const weeksPlayed = data.weeks.filter((w) => (data.rows.get(w) ?? []).some((r) => r.id === p.id));
  // Rank against players with a real role: at least half as many games as him, and some volume
  const peers = [...byPlayer.entries()].filter(([, ls]) => ls.length >= Math.max(1, Math.ceil(mine.length / 2)) && (ls.reduce((a, s) => a + (ptsOf(p.pos, s) ?? 0), 0) / ls.length) >= 3);
  const rows: UsageRow[] = [];
  for (const d of DEFS[p.pos]) {
    const season = agg(d, mine), last3 = agg(d, mine.slice(-3));
    if (season === undefined || last3 === undefined) continue;
    const vals = peers.map(([id, ls]) => ({ id, v: agg(d, ls) })).filter((x): x is { id: string; v: number } => x.v !== undefined);
    const rank = vals.some((x) => x.id === p.id) ? 1 + vals.filter((x) => x.v > season + 1e-9).length : undefined;
    rows.push({ key: d.key, label: d.label, tip: d.tip, last3, season, rank, of: vals.length, pct: d.pct, dec: d.dec });
  }
  if (!rows.length) return null;
  return { rows, games: mine.length, first: weeksPlayed[0], last: weeksPlayed[weeksPlayed.length - 1], demo: data.demo };
}

// ---- Points allowed by defense ----------------------------------------------
export interface Defense { team: string; perGame: number; rank: number; of: number; leagueAvg: number; games: number; demo: boolean }
const NFL = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"];
const DEMO_BASE: Record<Pos, number> = { QB: 18.5, RB: 24.5, WR: 35.5, TE: 10.5 };

/** Fantasy points the opponent gives up to his position per game, ranked: 1 = gives up the most (easiest). */
export function defenseVs(pos: Pos, opp: string, data: PosWeeks): Defense | null {
  const totals = new Map<string, { pts: number; games: Set<number> }>();
  if (data.demo) {
    // The demo has a few rostered players per team, not full depth charts, so a total from them would be noise.
    // Instead each defense gets a stable, believable allowance around the league norm.
    for (const t of NFL) totals.set(t, { pts: DEMO_BASE[pos] * (0.74 + hash(`${t}:${pos}:def`) * 0.52) * pastWeeks().length, games: new Set(pastWeeks()) });
  } else {
    for (const w of data.weeks) for (const r of data.rows.get(w) ?? []) {
      if (!r.opp) continue;
      const pts = ptsOf(pos, r.stats); if (pts === undefined) continue;
      const t = totals.get(r.opp) ?? totals.set(r.opp, { pts: 0, games: new Set() }).get(r.opp)!;
      t.pts += pts; t.games.add(w);
    }
  }
  const list = [...totals.entries()].filter(([, t]) => t.games.size > 0).map(([team, t]) => ({ team, perGame: t.pts / t.games.size, games: t.games.size }));
  const me = list.find((x) => x.team === opp);
  if (!me || list.length < 8) return null;
  list.sort((a, b) => b.perGame - a.perGame);
  const leagueAvg = list.reduce((a, x) => a + x.perGame, 0) / list.length;
  return { team: opp, perGame: me.perGame, rank: list.indexOf(me) + 1, of: list.length, leagueAvg, games: me.games, demo: data.demo };
}
