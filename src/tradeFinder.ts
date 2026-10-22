// Trade finder: a wider search than the two-way ideas (engine.ts scanTrades), sorted into three tiers instead of an
// empty state.
//
//   Both sides win   the current rule: both starting lineups gain a point a week and the acceptance check passes
//                    (no blockers, at least 50%). Includes every idea scanTrades already found.
//   Fair             value within FAIR_GAP (10%) after the bench-pile discount (packageValue), your lineup gains at
//                    least a point a week, theirs moves by no more than a point a week either way (THEM_BAND), and their
//                    chance to make the playoffs drops by no more than ODDS_DROP (3 points) in the sims.
//   Long shots       your lineup gains at least LONG_GAIN (2.5) a week and the partner comes out behind (lineup down,
//                    more value out than in, or playoff odds down past ODDS_DROP), with one line on why they'd balk.
//
// Candidates: 1-for-1, 2-for-1, 1-for-2, 2-for-2, 3-for-1 and 3-for-2 with every other team. Single players come from
// the whole roster; pairs and triples from each side's most valuable players (POOL_*), which keeps the search near
// 10,000 swaps a team. A value prefilter skips swaps no tier could use before any lineup is built.
import { Player, Pos, Team, ManagerTag, MyTag, LEAGUE, WEEK, POS_ORDER, TEAMS, playerById, isDemo } from "./data";
import {
  Acceptance, FAIR_GAP, Price, Trade, acceptance, eff, evaluate, fits, gapRatio, groupPoints, lineupFor, lineupTotal,
  currentFormat, marketValue, round1, scored, slotsFor, valueEdge, type SlotName,
} from "./engine";
import { demoCell } from "./schedule";
import { Odds, SimTeam, recordWins, simulate } from "./playoffSim";
import type { Steps } from "./steps";

export type Tier = "both" | "fair" | "long";
export const TIER_ORDER: Tier[] = ["both", "fair", "long"];
/** Most groups with one partner in a tier, so one manager can't fill it */
export const PER_PARTNER = 2;
/** Most groups each tier shows */
export const TIER_CAP: Record<Tier, number> = { both: 5, fair: 5, long: 3 };

/** Their lineup can move this much a week, either way, and still count as about even. */
export const THEM_BAND = 1;
/** Your lineup has to gain at least this much a week for a long shot. */
export const LONG_GAIN = 2.5;
/** A drop in their make-the-playoffs chance bigger than this (3 points) is meaningful. */
export const ODDS_DROP = 0.03;
/** Value prefilter, as (get - give) / bigger side after the bench-pile discount. Outside it no tier can use the swap. */
const MAX_THEY_GIVE = 0.3, MAX_YOU_GIVE = 0.2;
/** How many of each side's most valuable players make pairs and triples. Singles use the whole roster. */
const POOL_PAIR = 11, POOL_TRIPLE = 9, POOL_THEIR_PAIR = 10;
/** Most candidates kept per team and tier before the full read (the rest are near copies or weaker). */
const KEEP_FAIR = 30, KEEP_LONG = 20;
/** Sims per trade for the before and after odds. Standings uses 3,000; deltas here share their random draws, so
 *  1,000 is steady enough to read a few points. */
export const FINDER_RUNS = 1000;

const SHAPES: [number, number][] = [[1, 1], [2, 1], [1, 2], [2, 2], [3, 1], [3, 2]];

export interface Split { whole: number; reg: number; po: number; regWeeks: number; poWeeks: number }
export interface FinderIdea {
  t: Trade;
  tier: Tier;
  /** Long shots: one plain line on why they'd likely say no */
  balk: string | null;
  /** The main piece each way (most valuable player on each side): ideas that share it are near copies */
  core: string;
  /** Your points gain over the rest of the season, the regular season left, and the playoff weeks */
  gain: Split;
  /** Your starting points a week at each position after the trade, minus before */
  posGain: Record<Pos, number>;
  /** Within 10% on value, the "Fair offer" badge */
  fair: boolean;
  accept?: Acceptance;
  /** Ranking inside its tier for the Whole season view */
  score: number;
}
/** `tried`: swaps scored after the value prefilter. Times in ms: the search, the fair-tier odds gate, both. */
export interface FinderResult { ideas: FinderIdea[]; tried: number; searchMs: number; oddsMs: number; ms: number; teams: number }

// ---- Weeks -----------------------------------------------------------------------------------------------------
export const playoffStart = () => LEAGUE.playoffStart ?? 15;
export const lastWeek = () => LEAGUE.lastWeek ?? 17;
/** Regular-season weeks left, this one included, the same count Standings simulates. */
export const regWeeksLeft = () => Math.max(0, playoffStart() - WEEK);
export const playoffWeeks = () => Math.max(0, lastWeek() - Math.max(WEEK, playoffStart()) + 1);
export const playoffSpots = () => LEAGUE.playoffTeams ?? 6;

// ---- Playoff-week points ---------------------------------------------------------------------------------------
// Live players carry their average over the fantasy playoff weeks (sleeper.ts `playoff`). The demo has no feed, so it
// averages the demo season's own projections for those weeks (schedule.ts demoCell), scaled to this league's scoring.
const poCache = new Map<string, number>();
let poKey = "";
export function playoffPts(p: Player): number {
  const k = p.id;
  const hit = poCache.get(k);
  if (hit !== undefined) return hit;
  let v: number;
  const base = eff(p);
  if (base === 0) v = 0;
  else if (p.playoff) v = round1(scored({ ...p, pts: p.playoff }));
  else if (isDemo() && p.proj > 0) {
    const ws: number[] = [];
    for (let w = playoffStart(); w <= lastWeek(); w++) { const c = demoCell(p, w); ws.push(c.opp ? c.proj ?? p.proj : 0); }
    v = ws.length ? round1((ws.reduce((a, b) => a + b, 0) / ws.length) * (base / p.proj)) : base;
  } else v = base;
  poCache.set(k, v);
  return v;
}

/** A lineup total from any per-player number, filled the way lineupFor fills it: fixed slots, then FLEX, then SF. */
function totalBy(ids: string[], val: (p: Player) => number, slots: SlotName[]): number {
  const n = ids.length;
  const ps: Player[] = new Array(n), es: number[] = new Array(n), order: number[] = new Array(n);
  for (let i = 0; i < n; i++) { ps[i] = playerById(ids[i]); es[i] = val(ps[i]); order[i] = i; }
  order.sort((a, b) => es[b] - es[a]);
  const used: boolean[] = new Array(n).fill(false);
  let s = 0;
  const fill = (slot: SlotName) => { for (let k = 0; k < n; k++) { const i = order[k]; if (!used[i] && fits(slot, ps[i].pos)) { used[i] = true; s += es[i]; return; } } };
  for (const slot of slots) if (slot !== "FLEX" && slot !== "SF") fill(slot);
  for (const slot of slots) if (slot === "FLEX" || slot === "SF") fill(slot);
  return round1(s);
}
export const playoffTotal = (ids: string[]) => {
  // Cached per league, week and scoring format
  const key = `${LEAGUE.id}|${WEEK}|${JSON.stringify(currentFormat())}`;
  if (key !== poKey) { poKey = key; poCache.clear(); }
  return totalBy(ids, playoffPts, slotsFor());
};

// ---- Playoff odds ----------------------------------------------------------------------------------------------
interface SimBase { key: string; teams: SimTeam[]; idx: Record<string, number>; before: Odds[] }
let simBase: SimBase | null = null;
const oddsCache = new Map<string, TradeOdds>();
export interface SideOdds { before: Odds; after: Odds }
export interface TradeOdds { you: SideOdds; them: SideOdds }

function base(): SimBase {
  const key = `${LEAGUE.id}|${WEEK}|${JSON.stringify(currentFormat())}|${TEAMS.map((t) => t.roster.join(",")).join(";")}|${lineupTotal(TEAMS[0]?.roster ?? [])}`;
  if (simBase?.key === key) return simBase;
  const teams = TEAMS.map((t) => ({ w: recordWins(t.record), pf: t.pf, total: lineupTotal(t.roster), playoff: playoffTotal(t.roster) }));
  const idx: Record<string, number> = {};
  TEAMS.forEach((t, i) => (idx[t.id] = i));
  simBase = { key, teams, idx, before: simulate(teams, regWeeksLeft(), playoffSpots(), FINDER_RUNS, seedOf(teams)) };
  oddsCache.clear();
  return simBase;
}
// One seed per league state, from the starting teams only, so every trade's after sim reuses the before sim's draws
const seedOf = (teams: SimTeam[]) => teams.length * 7919 + regWeeksLeft() * 104729 + Math.round(teams.reduce((a, x) => a + x.total, 0));

/** Make the playoffs, top seed and win it all for you and the partner, before and after the trade. Memoized. */
export function tradeOdds(t: Trade, you: Team): TradeOdds {
  const b = base();
  const hit = oddsCache.get(t.key);
  if (hit) return hit;
  const yi = b.idx[you.id], ti = b.idx[t.partnerId];
  const them = TEAMS[ti];
  const youIds = you.roster.filter((id) => !t.give.includes(id)).concat(t.get);
  const themIds = them.roster.filter((id) => !t.get.includes(id)).concat(t.give);
  const teams = b.teams.slice();
  teams[yi] = { ...teams[yi], total: t.youAfter, playoff: playoffTotal(youIds) };
  teams[ti] = { ...teams[ti], total: t.themAfter, playoff: playoffTotal(themIds) };
  const after = simulate(teams, regWeeksLeft(), playoffSpots(), FINDER_RUNS, seedOf(b.teams));
  const o = { you: { before: b.before[yi], after: after[yi] }, them: { before: b.before[ti], after: after[ti] } };
  oddsCache.set(t.key, o);
  return o;
}
export const hasOdds = (key: string) => oddsCache.has(key);

// ---- Search ----------------------------------------------------------------------------------------------------
function combosOf(ids: string[], k: number): string[][] {
  const out: string[][] = [];
  const rec = (start: number, acc: string[]) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = start; i < ids.length; i++) { acc.push(ids[i]); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return out;
}
const PIECE_WEIGHTS = [1, 0.85, 0.72, 0.61];
/** packageValue from precomputed values (same weights, same rounding) */
const pkg = (vals: number[]) => Math.round(vals.slice().sort((a, b) => b - a).reduce((s, v, i) => s + v * (PIECE_WEIGHTS[i] ?? 0.5), 0));

interface Light { give: string[]; get: string[]; yd: number; td: number; gap: number }
const pieces = (t: { give: string[]; get: string[] }) => t.give.length + t.get.length;
/** Long shots rank by your gain, less for every point of value past fair they'd hand over and for extra pieces, so
 *  the top ones are the least lopsided big gains, not the biggest fleeces. */
const longScore = (yd: number, gap: number, n: number) => yd - Math.max(0, gap - FAIR_GAP) * 10 - (n - 2) * 0.3;
const WORDS = ["", "One", "Two", "Three", "Four"];

function splitOf(t: Trade, you: Team): Split {
  const regWeeks = regWeeksLeft(), poWeeks = playoffWeeks();
  const after = you.roster.filter((id) => !t.give.includes(id)).concat(t.get);
  const poDelta = playoffTotal(after) - playoffTotal(you.roster);
  const reg = round1(t.youDelta * regWeeks), po = round1(poDelta * poWeeks);
  return { whole: round1(reg + po), reg, po, regWeeks, poWeeks };
}
function posGainOf(t: Trade, you: Team): Record<Pos, number> {
  const before = groupPoints(lineupFor(you.roster)), after = groupPoints(lineupFor(you.roster.filter((id) => !t.give.includes(id)).concat(t.get)));
  const out = {} as Record<Pos, number>;
  POS_ORDER.forEach((p) => (out[p] = round1(after[p] - before[p])));
  return out;
}

/** Why a long shot would likely get a no, as one plain line. */
function balkOf(t: Trade, you: Team, them: Team, starStar: number, oddsDrop: number | null): string {
  const yourStarters = new Set(lineupFor(you.roster).slots.map((s) => s.player?.id));
  const benchPile = t.give.length >= 2 && t.give.length > t.get.length && t.give.every((id) => !yourStarters.has(id));
  if (benchPile) {
    const best = Math.max(...t.get.map((id) => marketValue(playerById(id))));
    const what = t.get.length === 1 ? (best >= starStar ? "one star" : "one starter") : `${WORDS[t.get.length].toLowerCase()} starters`;
    return `${WORDS[t.give.length]} bench players for ${what}`;
  }
  const before = groupPoints(lineupFor(them.roster)), after = groupPoints(lineupFor(them.roster.filter((id) => !t.get.includes(id)).concat(t.give)));
  const worst = POS_ORDER.map((p) => ({ p, d: after[p] - before[p] })).sort((a, b) => a.d - b.d)[0];
  if (worst && worst.d <= -3) return `They'd lose a starter at ${worst.p}`;
  if (oddsDrop !== null && oddsDrop > ODDS_DROP) return `Their playoff odds drop ${Math.round(oddsDrop * 100)} points`;
  if (t.marketGap > FAIR_GAP) return `They ${valueEdge("give", gapRatio(-t.marketGap), "value", true).replace(/^gives up/, "give up")}`;
  return `Their lineup drops ${Math.abs(t.themDelta).toFixed(1)} a week`;
}

/**
 * The finder, as steps: one yield per team so a caller can run it in idle slices. `seed` is the two-way ideas the
 * app already has (scanTrades), so every one of them shows in Both sides win.
 */
export function* finderSteps(you: Team, partners: Team[], tags: ManagerTag[], myTags: Record<string, MyTag>, prices: Record<string, Price>, seed: Trade[] = []): Steps<FinderResult> {
  const t0 = performance.now();
  const slots = slotsFor();
  const effOf = (p: Player) => eff(p);
  const total = (ids: string[]) => totalBy(ids, effOf, slots);
  const youBefore = lineupTotal(you.roster);
  const val = (id: string) => marketValue(playerById(id));
  const byValue = (ids: string[]) => ids.slice().sort((a, b) => val(b) - val(a));
  // A "star" is a top 24 value among rostered players
  const rostered = TEAMS.flatMap((t) => t.roster).map(val).sort((a, b) => b - a);
  const starStar = rostered[Math.min(23, rostered.length - 1)] ?? Infinity;
  const mine = you.roster.filter((id) => myTags[id] !== "untouchable");
  const mineSorted = byValue(mine);
  const giveSets: Record<number, string[][]> = { 1: mine.map((id) => [id]), 2: combosOf(mineSorted.slice(0, POOL_PAIR), 2), 3: combosOf(mineSorted.slice(0, POOL_TRIPLE), 3) };
  const giveVals = new Map<string[], number>();
  [1, 2, 3].forEach((k) => giveSets[k].forEach((g) => giveVals.set(g, pkg(g.map(val)))));
  // Your total after only depends on what you give and get, so it's cached across teams by the swap
  const ideas: FinderIdea[] = [];
  const seen = new Set<string>();
  let tried = 0;
  for (const them of partners) {
    yield { t: "n", n: tried };
    const themBefore = lineupTotal(them.roster);
    const theirs = byValue(them.roster);
    const getSets: Record<number, string[][]> = { 1: them.roster.map((id) => [id]), 2: combosOf(theirs.slice(0, POOL_THEIR_PAIR), 2) };
    const getVals = new Map<string[], number>();
    [1, 2].forEach((k) => getSets[k].forEach((g) => getVals.set(g, pkg(g.map(val)))));
    const both: Light[] = [], fair: Light[] = [], long: Light[] = [];
    for (const [gk, tk] of SHAPES) {
      yield { t: "n", n: tried };
      for (const give of giveSets[gk]) {
        const gv = giveVals.get(give)!;
        const youKeep = you.roster.filter((id) => !give.includes(id));
        for (const get of getSets[tk]) {
          const tv = getVals.get(get)!;
          const big = Math.max(gv, tv);
          const gap = big > 0 ? (tv - gv) / big : 0;
          if (gap > MAX_THEY_GIVE || gap < -MAX_YOU_GIVE) continue;
          tried++;
          const yd = round1(total(youKeep.concat(get)) - youBefore);
          if (yd < 1) continue;
          const td = round1(total(them.roster.filter((id) => !get.includes(id)).concat(give)) - themBefore);
          const l: Light = { give, get, yd, td, gap };
          if (td >= 1) both.push(l);
          else if (Math.abs(gap) <= FAIR_GAP && td >= -THEM_BAND) fair.push(l);
          else if (yd >= LONG_GAIN && (td < -0.05 || gap > FAIR_GAP)) long.push(l);
        }
      }
    }
    const read = (l: Light) => evaluate(you, them, l.give, l.get, tags, myTags, prices, { you: youBefore, them: themBefore });
    const push = (t: Trade, tier: Tier, score: number, extra: Partial<FinderIdea> = {}) => {
      if (seen.has(t.key)) return;
      seen.add(t.key);
      ideas.push({ t, tier, balk: null, core: `${byValue(t.give)[0]}>${byValue(t.get)[0]}`, gain: splitOf(t, you), posGain: posGainOf(t, you), fair: Math.abs(t.marketGap) <= FAIR_GAP, score, ...extra });
    };
    // Both sides win: the ideas the app already has with this team, then any wider shape that passes the same check
    for (const t of seed.filter((x) => x.partnerId === them.id)) push(t, "both", (t.accept?.p ?? 0) * 6 + Math.min(t.youDelta, 4) - (pieces(t) - 2) * 0.5, { accept: t.accept });
    const failedBoth: Light[] = [];
    yield { t: "n", n: tried };
    for (const l of both) {
      const t = read(l);
      if (t.warnings.length) continue;
      const a = acceptance(t, you, them);
      if (!a.blockers.length && a.p >= 0.5) { t.accept = a; push(t, "both", a.p * 6 + Math.min(t.youDelta, 4) - (pieces(t) - 2) * 0.5, { accept: a }); }
      else failedBoth.push(l);
    }
    // Lineups both up but the yes check failed: about even on value reads as fair, more value out as a long shot
    for (const l of failedBoth) { if (Math.abs(l.gap) <= FAIR_GAP) fair.push(l); else if (l.yd >= LONG_GAIN && l.gap > FAIR_GAP) long.push(l); }
    fair.sort((a, b) => b.yd + Math.min(b.td, 2) * 0.5 - (pieces(b) - 2) * 0.4 - (a.yd + Math.min(a.td, 2) * 0.5 - (pieces(a) - 2) * 0.4));
    let kept = 0;
    for (const l of fair) {
      if (kept >= KEEP_FAIR) break;
      if (kept % 10 === 9) yield { t: "n", n: tried };
      const t = read(l);
      if (t.warnings.length) continue;
      kept++;
      push(t, "fair", t.youDelta + Math.min(t.themDelta, 2) * 0.5 - (pieces(t) - 2) * 0.4);
    }
    long.sort((a, b) => longScore(b.yd, b.gap, pieces(b)) - longScore(a.yd, a.gap, pieces(a)));
    kept = 0;
    for (const l of long) {
      if (kept >= KEEP_LONG) break;
      if (kept % 10 === 9) yield { t: "n", n: tried };
      const t = read(l);
      if (t.warnings.length) continue;
      kept++;
      push(t, "long", longScore(t.youDelta, t.marketGap, pieces(t)), { balk: balkOf(t, you, them, starStar, null) });
    }
  }
  const searchMs = performance.now() - t0;
  const t1 = performance.now();
  // Fair has to keep their playoff odds: run the sims for every fair idea, and move the ones that cost them more than
  // ODDS_DROP to the long shots (when you gain enough) or drop them
  yield { t: "n", n: tried };
  const out: FinderIdea[] = [];
  let sims = 0;
  for (const x of ideas) {
    if (x.tier !== "fair") { out.push(x); continue; }
    if (++sims % 8 === 0) yield { t: "n", n: tried };
    const o = tradeOdds(x.t, you);
    const drop = o.them.before.playoff - o.them.after.playoff;
    if (drop <= ODDS_DROP) { out.push(x); continue; }
    if (x.t.youDelta >= LONG_GAIN) out.push({ ...x, tier: "long", score: longScore(x.t.youDelta, x.t.marketGap, pieces(x.t)), balk: balkOf(x.t, you, teamOf(x.t.partnerId), starStar, drop) });
  }
  const oddsMs = performance.now() - t1;
  return { ideas: out, tried, searchMs, oddsMs, ms: performance.now() - t0, teams: partners.length };
}
const teamOf = (id: string) => TEAMS.find((t) => t.id === id)!;

// ---- Grouping and filters --------------------------------------------------------------------------------------
export type Horizon = "whole" | "reg" | "po";
export interface FinderFilter { fairOnly: boolean; buy: string; sell: string; pos: Pos | "" }
export const NO_FILTER: FinderFilter = { fairOnly: false, buy: "", sell: "", pos: "" };
export interface IdeaGroup { lead: FinderIdea; similar: FinderIdea[] }

export const passes = (x: FinderIdea, f: FinderFilter) =>
  (!f.fairOnly || x.fair) && (!f.buy || x.t.get.includes(f.buy)) && (!f.sell || x.t.give.includes(f.sell)) && (!f.pos || x.posGain[f.pos] >= 1);

/** Each tier's ideas, filtered, ranked for the horizon, near copies (same main piece each way) folded under the best
 *  one, and cut to the tier's cap. */
export function tiersOf(ideas: FinderIdea[], f: FinderFilter, h: Horizon): Record<Tier, IdeaGroup[]> {
  const out = { both: [], fair: [], long: [] } as Record<Tier, IdeaGroup[]>;
  for (const tier of TIER_ORDER) {
    const list = ideas.filter((x) => x.tier === tier && passes(x, f));
    // Whole season ranks by the tier's own score; the other views by that stretch's points
    list.sort((a, b) => h === "whole" ? b.score - a.score || b.gain.whole - a.gain.whole : b.gain[h] - a.gain[h] || b.score - a.score);
    const groups = new Map<string, IdeaGroup>();
    for (const x of list) {
      const g = groups.get(x.core);
      if (g) g.similar.push(x);
      else groups.set(x.core, { lead: x, similar: [] });
    }
    const per: Record<string, number> = {};
    out[tier] = [...groups.values()].filter((g) => (per[g.lead.t.partnerId] = (per[g.lead.t.partnerId] ?? 0) + 1) <= PER_PARTNER).slice(0, TIER_CAP[tier]);
  }
  return out;
}

/** The best idea worth pitching for a summary line: Both sides win first, then Fair. Never a long shot. */
export const topIdea = (ideas: FinderIdea[]): FinderIdea | null => {
  const t = tiersOf(ideas, NO_FILTER, "whole");
  return t.both[0]?.lead ?? t.fair[0]?.lead ?? null;
};
