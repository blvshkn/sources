import { LEAGUE, WEEK, Player, onBye } from "./data";
import { demoBye } from "./weeks";

/** One week of a player's season: points if it's played, projection and matchup tone if it's ahead. */
export interface WeekCell { week: number; opp: string | null; past: boolean; pts?: number; proj?: number; tone?: "good" | "ok" | "tough"; playoff: boolean }

const TEAMS = ["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"];
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };

/** FNV alone barely moves when only the last character changes ("chuba-hubbard1", "...2"), which made every demo
 *  week score the same. A murmur-style finish spreads those out. */
const mix = (s: string) => { let h = Math.floor(hash(s) * 4294967295) >>> 0; h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967295; };

/** Demo leagues have no real slate, so build a stable made up one from the player's team. */
function demoCell(p: Player, w: number): { opp: string | null; pts?: number; proj?: number } {
  const bye = w === WEEK ? onBye(p.nfl) : demoBye(p.nfl) === w;
  if (bye) return { opp: null };
  const others = TEAMS.filter((t) => t !== p.nfl), ti = TEAMS.indexOf(p.nfl);
  // This week's opponent comes from the demo slate, so the strip agrees with the header's game line
  const real = w === WEEK && p.opp ? /^(vs|@)\s*([A-Z]{2,3})$/.exec(p.opp) : null;
  if (real) {
    const f = 0.72 + hash(real[2] + p.pos) * 0.56;
    return { opp: (real[1] === "@" ? "@" : "v") + real[2], proj: Math.round((p.proj || 8) * f * 10) / 10 };
  }
  const opp = others[((ti >= 0 ? ti : 0) * 7 + w * 11) % others.length];
  const base = p.proj || 8;
  const f = 0.72 + hash(opp + p.pos) * 0.56;
  return w < WEEK ? { opp: (hash(p.nfl + w + "h") > 0.5 ? "v" : "@") + opp, pts: Math.round(base * (0.45 + mix(p.id + w) * 1.1) * 10) / 10 }
    : { opp: (hash(p.nfl + w + "h") > 0.5 ? "v" : "@") + opp, proj: Math.round(base * f * 10) / 10 };
}

/** The player's whole season, week by week, through the end of the fantasy playoffs. Upcoming weeks are rated
 *  against his own average projection: 10 percent or more above is a good matchup, 10 percent below is tough. */
export function seasonFor(p: Player): WeekCell[] {
  const last = LEAGUE.lastWeek ?? 17, po = LEAGUE.playoffStart ?? 15, s = LEAGUE.slate;
  const raw = Array.from({ length: last }, (_, i) => i + 1).map((w) => {
    if (!s) return { week: w, ...demoCell(p, w) };
    const opp = s.opp[p.nfl]?.[w] ?? null;
    return { week: w, opp, pts: w < WEEK ? s.pts[p.id]?.[w] : undefined, proj: w >= WEEK && opp ? s.proj[p.id]?.[w] : undefined };
  });
  const ahead = raw.filter((c) => c.week >= WEEK && c.proj !== undefined && c.proj > 0).map((c) => c.proj!);
  const avg = ahead.length ? ahead.reduce((a, b) => a + b, 0) / ahead.length : 0;
  return raw.map((c) => {
    const past = c.week < WEEK;
    const tone = !past && c.opp && c.proj !== undefined && avg > 0 ? (c.proj >= avg * 1.1 ? "good" : c.proj <= avg * 0.9 ? "tough" : "ok") : undefined;
    return { ...c, past, tone, playoff: c.week >= po } as WeekCell;
  });
}

/** Short read of the weeks that matter for a trade: the next four and the fantasy playoffs. */
export function scheduleRead(cells: WeekCell[]): { next: string; playoffs: string } {
  const ahead = cells.filter((c) => !c.past);
  const sum = (cs: WeekCell[]) => {
    const g = cs.filter((c) => c.tone === "good").length, t = cs.filter((c) => c.tone === "tough").length, b = cs.filter((c) => !c.opp).length;
    return [g && `${g} good`, t && `${t} tough`, b && "bye"].filter(Boolean).join(", ") || "even";
  };
  return { next: sum(ahead.slice(0, 4)), playoffs: sum(ahead.filter((c) => c.playoff)) };
}
