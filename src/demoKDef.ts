// Demo league only: one game's stat line for a kicker or a defense, and its points under the league's scoring.
// Every demo surface that shows a K or DEF week reads this, so a week's points are always the sum of its own line:
// the season grid (schedule.ts demoCell), the game log, Lineup and Full matchup past weeks (weeks.ts), Compare,
// Waivers, and this week's sample Sunday (live.ts). Lines are made up per player and week from a seeded draw, scaled
// by his projection. They're the demo league's sample numbers, never real NFL stats.
import { LEAGUE, SPECIAL_FREE_AGENTS, WEEK } from "./data";
import { scoreStats } from "./sleeper";

export type KDefLine = Record<string, number>;
/** The demo draw's seed. Changing it redraws every demo K and DEF week (and the scores built on them). */
const SEED = "s1";

/** A small seeded generator (FNV-1a into mulberry32), so every week of every player draws its own sequence. */
function rng(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A count with mean `m` (Poisson, by inversion), capped so one game never reads absurd. */
const count = (r: () => number, m: number, cap: number) => {
  let k = 0, p = Math.exp(-m), s = p;
  const u = r();
  while (u > s && k < cap) { k++; p *= m / k; s += p; }
  return k;
};

/** His projection for the week, the level the line is drawn around. This week uses the slate's number for a free
 *  agent (`wk`), other weeks his per-week projection. */
function level(id: string, fallback: number, w: number) {
  const sp = LEAGUE.specials?.[id];
  if (sp) return sp.proj || fallback;
  const fa = SPECIAL_FREE_AGENTS.find((f) => f.id === id);
  if (fa) return (w === WEEK ? fa.wk ?? fa.proj : fa.proj) || fallback;
  return fallback || 7.5;
}

type Event = { t: number; k: string; n?: number };

/** The kicker's game as timed events: each try lands somewhere in the game (t from 0 to 1). */
function kickEvents(id: string, w: number, proj: number, tag: string): Event[] {
  const r = rng(`k|${id}|${w}${tag}|${SEED}`);
  const lvl = Math.max(0.7, Math.min(1.3, proj / 8));
  const ev: Event[] = [];
  const tds = count(r, 2.5 * lvl, 7);
  for (let i = 0; i < tds; i++) ev.push({ t: r(), k: r() < 0.06 ? "xpmiss" : "xpm" });
  const fga = count(r, 1.9 * lvl, 6);
  // Distance mix and make rates roughly like a league season: short ones nearly automatic, 50+ a coin flip and a half
  const BUCKETS: [string, number, number][] = [["20_29", 0.26, 0.97], ["30_39", 0.3, 0.92], ["40_49", 0.29, 0.81], ["50p", 0.15, 0.64]];
  for (let i = 0; i < fga; i++) {
    let u = r(), b = BUCKETS[BUCKETS.length - 1];
    for (const x of BUCKETS) { if (u < x[1]) { b = x; break; } u -= x[1]; }
    ev.push({ t: r(), k: r() < b[2] ? `fgm_${b[0]}` : `fgmiss_${b[0]}` });
  }
  return ev;
}

/** The defense's game: what the other offense scored (touchdowns and field goals) and what the defense took away.
 *  Only stats the game log has a column for (no safeties or blocked kicks), so every point on the row is visible. */
function defEvents(id: string, w: number, proj: number, tag: string): Event[] {
  const r = rng(`d|${id}|${w}${tag}|${SEED}`);
  const lvl = Math.max(0.7, Math.min(1.3, proj / 7.5));
  const ev: Event[] = [];
  const tds = count(r, 2.5 / lvl, 7), fgs = count(r, 1.7 / lvl, 5);
  for (let i = 0; i < tds; i++) ev.push({ t: r(), k: "pa", n: r() < 0.05 ? 6 : r() < 0.08 ? 8 : 7 });
  for (let i = 0; i < fgs; i++) ev.push({ t: r(), k: "pa", n: 3 });
  const sacks = count(r, 2.5 * lvl, 8), ints = count(r, 0.8 * lvl, 3), frs = count(r, 0.6 * lvl, 2);
  for (let i = 0; i < sacks; i++) ev.push({ t: r(), k: "sack" });
  for (let i = 0; i < ints; i++) { const t = r(); ev.push({ t, k: "int" }); if (r() < 0.09) ev.push({ t, k: "def_td" }); }
  for (let i = 0; i < frs; i++) { const t = r(); ev.push({ t, k: "fum_rec" }); if (r() < 0.1) ev.push({ t, k: "def_td" }); }
  return ev;
}

const PA_BUCKET = (pa: number) => pa === 0 ? "pts_allow_0" : pa <= 6 ? "pts_allow_1_6" : pa <= 13 ? "pts_allow_7_13" : pa <= 20 ? "pts_allow_14_20" : pa <= 27 ? "pts_allow_21_27" : pa <= 34 ? "pts_allow_28_34" : "pts_allow_35p";

/** One K or DEF game as a Sleeper-shaped stat line. `share` is how much of the game has been played (1 for a game
 *  that's over): a game in progress shows only what's happened so far, so its line grows into the final one.
 *  `tag` keeps earlier seasons apart from this one. */
export function demoKDefLine(id: string, pos: "K" | "DEF", w: number, opts: { share?: number; proj?: number; tag?: string } = {}): KDefLine {
  const share = opts.share ?? 1, tag = opts.tag ?? "";
  const proj = level(id, opts.proj ?? 0, w);
  const ev = (pos === "K" ? kickEvents(id, w, proj, tag) : defEvents(id, w, proj, tag)).filter((e) => e.t <= share);
  const s: KDefLine = {};
  const add = (k: string, n = 1) => { s[k] = (s[k] ?? 0) + n; };
  if (pos === "K") {
    // The long-range buckets are always on the line, so the game log can show made / attempted from each
    s.fgm = 0; s.fga = 0; s.xpm = 0; s.xpa = 0; s.fgm_40_49 = 0; s.fgmiss_40_49 = 0; s.fgm_50p = 0; s.fgmiss_50p = 0;
    for (const e of ev) {
      if (e.k === "xpm") { add("xpm"); add("xpa"); }
      else if (e.k === "xpmiss") { add("xpmiss"); add("xpa"); }
      else if (e.k.startsWith("fgm_")) { add(e.k); add("fgm"); add("fga"); }
      else { add(e.k); add("fgmiss"); add("fga"); }
    }
    return s;
  }
  s.pts_allow = 0; s.sack = 0; s.int = 0; s.fum_rec = 0; s.def_td = 0;
  for (const e of ev) add(e.k === "pa" ? "pts_allow" : e.k, e.n ?? 1);
  // Sleeper's points-allowed bucket flag, which is what scoring_settings scores
  s[PA_BUCKET(s.pts_allow)] = 1;
  return s;
}

/** Points for a line under the league's own scoring (the demo's is Sleeper's default). */
export const kdefPts = (pos: "K" | "DEF", line: KDefLine) => scoreStats(line, LEAGUE.scoring ?? {}, pos);
/** The points one K or DEF game scores. */
export const demoKDefPts = (id: string, pos: "K" | "DEF", w: number, opts?: Parameters<typeof demoKDefLine>[3]) => kdefPts(pos, demoKDefLine(id, pos, w, opts));
export const isKDef = (pos: string): pos is "K" | "DEF" => pos === "K" || pos === "DEF";
