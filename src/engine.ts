// The trade engine. Every number in the UI comes from here, never from copy.
// AI-written lines elsewhere only explain these numbers; they never invent one.
import {
  Player, Pos, Team, ManagerTag, MyTag, TEAMS, PLAYERS, POS_ORDER, playerById, onBye,
  FREE_AGENTS, FAAB_HISTORY, FAAB, COMPLETED_TRADES, OFFERS_RECEIVED, SLEEPER_SET,
  SLOT_HISTORY, teamById, YOU, LEAGUE, leagueKey, BidTier, SpecialPlayer, demoGame, gameState, lockedThisWeek,
  SPECIAL_FREE_AGENTS, SPECIAL_BIDS, WaiverFA, teamNick, FreeAgent, WEEK,
} from "./data";
import { nameWords, playersInText, teamsInText } from "./search";
import { drain, type Steps, type TraceEv } from "./steps";

// ---- League format --------------------------------------------------------

export type Scoring = "ppr" | "half" | "std";
export interface Format { scoring: Scoring; superflex: boolean; tePremium: boolean }
export const DEFAULT_FORMAT: Format = { scoring: "ppr", superflex: false, tePremium: false };
let FORMAT: Format = DEFAULT_FORMAT;
let avgCache: { key: string; avg: Record<Group, number> } | null = null;
const fkey = (f: Format) => `${f.scoring}|${f.superflex}|${f.tePremium}`;
export function applyFormat(f: Format) {
  if (fkey(f) !== fkey(FORMAT)) { FORMAT = f; avgCache = null; }
}
export const currentFormat = () => FORMAT;
export const formatLabel = (f: Format = FORMAT) =>
  [f.scoring === "ppr" ? "PPR" : f.scoring === "half" ? "Half PPR" : "Standard", f.superflex && "Superflex", f.tePremium && "TE Premium"].filter(Boolean).join(" · ");

// Projections are licensed in PPR. Receptions are estimated by position so
// Half, Standard and TE Premium can be derived from the same number.
const REC_SHARE: Record<Pos, number> = { QB: 0, RB: 0.17, WR: 0.32, TE: 0.36 };
export function scored(p: Pick<Player, "pos" | "proj" | "pts" | "wk">, thisWeek = false) {
  // Live players carry real projections for every scoring type.
  const src = thisWeek && p.wk !== undefined ? p.wk : p.pts;
  if (src) {
    let v = FORMAT.scoring === "ppr" ? src.ppr : FORMAT.scoring === "half" ? src.half : src.std;
    if (FORMAT.tePremium && p.pos === "TE") v += src.rec * 0.5;
    return v;
  }
  const rec = p.proj * REC_SHARE[p.pos];
  let v = p.proj;
  if (FORMAT.scoring === "half") v -= rec * 0.5;
  if (FORMAT.scoring === "std") v -= rec;
  if (FORMAT.tePremium && p.pos === "TE") v += rec * 0.5;
  return v;
}

export type SlotName = "QB" | "RB" | "WR" | "TE" | "FLEX" | "SF";
export const slotsFor = (): SlotName[] => {
  const base = LEAGUE.slots.filter((s) => s !== "SF") as SlotName[];
  const sf = LEAGUE.slots.filter((s) => s === "SF").length;
  return FORMAT.superflex ? [...base, ...Array<SlotName>(Math.max(1, sf)).fill("SF")] : base;
};
const FLEX_OK: Pos[] = ["RB", "WR", "TE"];
export const fits = (slot: SlotName, pos: Pos) =>
  slot === "FLEX" ? FLEX_OK.includes(pos) : slot === "SF" ? true : pos === slot;
export const rosterMax = () => LEAGUE.rosterMax;

// Trades and needs use rest-of-season weekly projections (a bye shouldn't sink a deal).
// The lineup screen passes thisWeek = true so byes count as zero.
export const isOut = (p: Player, thisWeek = false) =>
  (p.status === "O" && (p.longTerm || thisWeek)) || (thisWeek && (onBye(p.nfl) || p.wk === null));
export const eff = (p: Player, thisWeek = false) => (isOut(p, thisWeek) ? 0 : round1(scored(p, thisWeek)));
export const round1 = (n: number) => Math.round(n * 10) / 10;

// ---- Kickers and defenses ----------------------------------------------
// Only for the lineup view and matchup totals. Trades and waivers ignore them.
export interface SpecialLineup { slots: { slot: "K" | "DEF"; player: SpecialPlayer | null }[]; bench: SpecialPlayer[]; total: number }
export const specialPts = (p: SpecialPlayer) => (p.wk ?? 0) * (p.status === "O" ? 0 : 1);
export function specialLineup(team: Team): SpecialLineup {
  const pool = (team.special ?? []).map((id) => LEAGUE.specials?.[id]).filter(Boolean) as SpecialPlayer[];
  pool.sort((a, b) => specialPts(b) - specialPts(a));
  const used = new Set<string>();
  const slots = (LEAGUE.specialSlots ?? []).map((slot) => {
    const p = pool.find((x) => x.pos === slot && !used.has(x.id)) ?? null;
    if (p) used.add(p.id);
    return { slot, player: p };
  });
  const total = slots.reduce((s, x) => s + (x.player ? specialPts(x.player) : 0), 0);
  return { slots, bench: pool.filter((p) => !used.has(p.id)), total };
}
/** The K and DEF a team starts this week, slot by slot, as set in Sleeper. Only a slot Sleeper left empty (or a team
 *  we have no Sleeper lineup for) falls back to the best-projected one on the roster, marked `suggested`. */
export interface StartedSpecial { slot: "K" | "DEF"; player: SpecialPlayer | null; suggested: boolean }
export function startedSpecials(team: Team): StartedSpecial[] {
  const set = team.setSpecial ?? (team.id === YOU.id ? LEAGUE.sleeperSpecial : undefined) ?? [];
  const used = new Set<string>();
  const out: StartedSpecial[] = (LEAGUE.specialSlots ?? []).map((slot) => {
    const id = set.find((x) => !used.has(x) && LEAGUE.specials?.[x]?.pos === slot);
    if (id) used.add(id);
    return { slot, player: id ? LEAGUE.specials![id] : null, suggested: false };
  });
  const pool = (team.special ?? []).map((id) => LEAGUE.specials?.[id]).filter((p): p is SpecialPlayer => !!p && !used.has(p.id) && !set.includes(p.id));
  pool.sort((a, b) => specialPts(b) - specialPts(a));
  for (const s of out) {
    if (s.player) continue;
    const p = pool.find((x) => x.pos === s.slot && !used.has(x.id));
    if (p) { used.add(p.id); s.player = p; s.suggested = true; }
  }
  return out;
}

// ---- Injured reserve -----------------------------------------------------
export interface IrReport {
  slots: number;
  used: Player[];
  open: number;
  /** Active players who qualify for IR right now. Moving them frees a roster spot. */
  moveIn: Player[];
  /** Players sitting on IR who no longer qualify. Sleeper blocks adds until they're activated. */
  mustActivate: Player[];
}
export function irReport(team: Team): IrReport {
  const slots = LEAGUE.irSlots ?? 0;
  const used = (team.ir ?? []).map(playerById);
  const moveIn = slots ? team.roster.map(playerById).filter((p) => p.irEligible).sort((a, b) => b.proj - a.proj) : [];
  const mustActivate = used.filter((p) => !p.irEligible);
  return { slots, used, open: Math.max(0, slots - used.length), moveIn, mustActivate };
}
export const irLabel = (p: Player) => p.injury === "IR" ? "Injured reserve" : p.injury === "PUP" ? "PUP list" : p.injury === "Sus" ? "Suspended" : p.injury === "NA" ? "Not with team" : p.injury ?? "Healthy";

// ---- Market value ---------------------------------------------------------
// Live leagues use the blended value set in sleeper.ts: FantasyCalc redraft or
// dynasty values for this league's QB format, scoring and size, blended with a
// production model and rescaled so the top player is 10,000. The demo league
// estimates value from projections on a similar scale.
export const marketValue = (p: Player): number => {
  if (p.value !== undefined) return p.value;
  if (p.status === "O" && p.longTerm) return 0;
  // Real 1QB markets discount quarterbacks heavily (there are plenty to start); Superflex prices them up.
  const posFactor = p.pos === "QB" ? (FORMAT.superflex ? 1.05 : 0.42) : p.pos === "TE" ? 0.9 : 1;
  return Math.round(9 * Math.pow(Math.max(0, p.proj), 2.2) * posFactor);
};
/**
 * Kickers and defenses have no trade-market feed (FantasyCalc skips them). Price them on the same
 * curve as marketValue, from rest-of-season points per week, normalized so 22 a week is 10,000 like
 * the top of the board, then cut to 30%: real markets treat them as near replacement level.
 */
export const specialValue = (proj: number): number => Math.round(10000 * 0.3 * Math.pow(Math.max(0, proj) / 22, 2.2));
/**
 * Consolidation adjustment: the best player in a package counts in full, each
 * extra piece counts for less, so three bench players can't add up to one star.
 */
// 85% on the second piece reproduces RotoTrade's package adjustment exactly on a tested 2-for-1.
const PIECE_WEIGHTS = [1, 0.85, 0.72, 0.61];
/** Plain sum of player values: the number a trade calculator shows for a side. */
export const sumValue = (ids: string[]) => ids.reduce((s, id) => s + marketValue(playerById(id)), 0);
export const packageValue = (ids: string[]) =>
  Math.round(ids.map((id) => marketValue(playerById(id))).sort((a, b) => b - a).reduce((s, v, i) => s + v * (PIECE_WEIGHTS[i] ?? 0.5), 0));
export const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.round(Math.abs(n) * 100)}%`;


export interface Lineup {
  slots: { slot: SlotName; player: Player | null }[];
  bench: Player[];
  total: number;
}

export function lineupFor(ids: string[], thisWeek = false): Lineup {
  const pool = ids.map(playerById).sort((a, b) => eff(b, thisWeek) - eff(a, thisWeek));
  const used = new Set<string>();
  const slots: Lineup["slots"] = [];
  // Fill fixed slots first, then FLEX, then Superflex, so flex gets the best leftover.
  const order = slotsFor();
  const fixed = order.filter((s) => s !== "FLEX" && s !== "SF");
  const tail = order.filter((s) => s === "FLEX" || s === "SF");
  for (const slot of [...fixed, ...tail]) {
    const pick = pool.find((p) => !used.has(p.id) && fits(slot, p.pos));
    if (pick) used.add(pick.id);
    slots.push({ slot, player: pick ?? null });
  }
  const bench = pool.filter((p) => !used.has(p.id));
  const total = round1(slots.reduce((s, x) => s + (x.player ? eff(x.player, thisWeek) : 0), 0));
  return { slots, bench, total };
}

// ---- Needs map ------------------------------------------------------------

export type Group = "QB" | "RB" | "WR" | "TE" | "FLEX" | "SF";
export const groupsFor = (): Group[] => (FORMAT.superflex ? ["QB", "RB", "WR", "TE", "FLEX", "SF"] : ["QB", "RB", "WR", "TE", "FLEX"]);

export function groupPoints(l: Lineup): Record<Group, number> {
  const g: Record<Group, number> = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SF: 0 };
  l.slots.forEach((s) => { if (s.player) g[s.slot] += eff(s.player); });
  return g;
}

export function leagueAvg(): Record<Group, number> {
  const key = fkey(FORMAT) + leagueKey();
  if (avgCache?.key === key) return avgCache.avg;
  const sums: Record<Group, number> = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SF: 0 };
  TEAMS.forEach((t) => {
    const g = groupPoints(lineupFor(t.roster));
    (Object.keys(sums) as Group[]).forEach((k) => (sums[k] += g[k]));
  });
  (Object.keys(sums) as Group[]).forEach((k) => (sums[k] = sums[k] / TEAMS.length));
  avgCache = { key, avg: sums };
  return sums;
}

export interface TeamNeeds {
  team: Team;
  lineup: Lineup;
  groups: Record<Group, { pts: number; diff: number; pct: number }>;
  need: Pos;
  surplus: Pos | null;
  surplusPlayer: Player | null;
  mode: "Contender" | "Seller" | "Bubble";
  rank: number;
}

export function needsFor(team: Team, rosterOverride?: string[]): TeamNeeds {
  const avg = leagueAvg();
  const lineup = lineupFor(rosterOverride ?? team.roster);
  const g = groupPoints(lineup);
  const groups = {} as TeamNeeds["groups"];
  (Object.keys(g) as Group[]).forEach((k) => {
    const diff = g[k] - avg[k];
    groups[k] = { pts: round1(g[k]), diff: round1(diff), pct: avg[k] ? diff / avg[k] : 0 };
  });
  const need = POS_ORDER.slice().sort((a, b) => groups[a].pct - groups[b].pct)[0];
  // Surplus: a bench player who would start for an average team at that spot
  let surplus: Pos | null = null;
  let surplusPlayer: Player | null = null;
  let best = 0;
  lineup.bench.forEach((p) => {
    const bar = p.pos === "QB" ? avg.QB * 0.8 : avg.FLEX * 0.85;
    const score = eff(p) / bar;
    if (score >= 1 && score > best) { best = score; surplus = p.pos; surplusPlayer = p; }
  });
  // Contender vs seller uses record AND points scored, per the product spec.
  const [w, l] = team.record.split("-").map(Number);
  const pfRank = [...TEAMS].sort((a, b) => b.pf - a.pf).findIndex((t) => t.id === team.id) + 1;
  const score = (w - l) + (pfRank <= 3 ? 1.5 : pfRank >= 8 ? -1.5 : 0);
  const mode = score >= 2 ? "Contender" : score <= -2 ? "Seller" : "Bubble";
  return { team, lineup, groups, need, surplus, surplusPlayer, mode, rank: 0 };
}

export function allNeeds(): TeamNeeds[] { return drain(allNeedsSteps()); }
/** allNeeds, one team at a time, counting the lineups it has built (steps.ts). */
export function* allNeedsSteps(): Steps<TeamNeeds[]> {
  const list: TeamNeeds[] = [];
  for (const t of TEAMS) { list.push(needsFor(t)); yield { t: "n", n: list.length }; }
  [...list].sort((a, b) => b.lineup.total - a.lineup.total).forEach((n, i) => (n.rank = i + 1));
  return list;
}

// ---- Tags -----------------------------------------------------------------

export type FadeWeeks = 2 | 4 | 6;
/** 1 = fresh, falls toward 0.35 as the tag ages past the fade window. */
export const tagStrength = (t: ManagerTag, fade: FadeWeeks) => Math.max(0.35, 1 - t.weeksOld / (fade + 1));
export const isFaded = (t: ManagerTag, fade: FadeWeeks) => t.weeksOld >= fade;
export const activeTags = (tags: ManagerTag[], fade: FadeWeeks) => tags.filter((t) => !isFaded(t, fade));

// ---- Prices for untouchables ---------------------------------------------

export interface Price { mode: "pts" | "pct"; amount: number }
export const DEFAULT_PRICE: Price = { mode: "pts", amount: 3 };
export const priceLabel = (p: Price) => (p.mode === "pts" ? `add ${p.amount.toFixed(1)} pts a week` : `beat his value by ${p.amount}%`);

// ---- Trades ---------------------------------------------------------------

export interface Trade {
  key: string;
  partnerId: string;
  give: string[]; // your players
  get: string[]; // their players
  youBefore: number;
  youAfter: number;
  themBefore: number;
  themAfter: number;
  youDelta: number;
  themDelta: number;
  youDrop: string[]; // bench players you'd cut to make roster room
  themDrop: string[];
  /** Market value of each side: the plain sum of player values, as a trade calculator shows it. */
  marketGive: number;
  marketGet: number;
  /** Each side after the consolidation adjustment (extra pieces count for less). Drives the verdict. */
  adjGive: number;
  adjGet: number;
  /** (adjGet - adjGive) / larger side. Positive = you receive more market value. */
  marketGap: number;
  fillsWant: boolean;
  warnings: string[];
  /** How likely the other manager is to say yes, and why. Set by findTrades. */
  accept?: Acceptance;
}

function settle(roster: string[], incoming: string[]): { ids: string[]; dropped: string[] } {
  const max = rosterMax();
  if (roster.length <= max) return { ids: roster, dropped: [] };
  // Managers move injured players to IR before cutting anyone, and they cut their least valuable
  // healthy bench player, not a hurt starter who'll be back.
  const lu = lineupFor(roster);
  const candidates = lu.bench.filter((p) => !incoming.includes(p.id) && !(p.status === "O" || p.irEligible));
  const cut = candidates.sort((a, b) => marketValue(a) - marketValue(b) || eff(a) - eff(b))
    .slice(0, roster.length - max).map((p) => p.id);
  return { ids: roster.filter((id) => !cut.includes(id)), dropped: cut };
}

export function clearsPrice(pid: string, get: string[], youDelta: number, price: Price) {
  if (price.mode === "pts") return youDelta >= price.amount;
  const incoming = get.reduce((s, id) => s + eff(playerById(id)), 0);
  return incoming >= eff(playerById(pid)) * (1 + price.amount / 100) && youDelta >= 0;
}

export function evaluate(you: Team, them: Team, give: string[], get: string[], tags: ManagerTag[], myTags: Record<string, MyTag>, prices: Record<string, Price>): Trade {
  const youS = settle(you.roster.filter((id) => !give.includes(id)).concat(get), get);
  const themS = settle(them.roster.filter((id) => !get.includes(id)).concat(give), give);
  const youBefore = lineupFor(you.roster).total;
  const themBefore = lineupFor(them.roster).total;
  const youAfter = lineupFor(youS.ids).total;
  const themAfter = lineupFor(themS.ids).total;
  const youDelta = round1(youAfter - youBefore);
  const themDelta = round1(themAfter - themBefore);
  const theirTags = tags.filter((t) => t.teamId === them.id);
  const warnings: string[] = [];
  theirTags.forEach((t) => {
    if (t.kind === "refuses") {
      const hit = get.filter((id) => (t.playerId ? id === t.playerId : t.pos && playerById(id).pos === t.pos));
      hit.forEach((id) => warnings.push(`${them.manager} said they won't move ${playerById(id).name}.`));
    }
    if (t.kind === "notInterested") {
      const hit = give.filter((id) => (t.playerId ? id === t.playerId : t.pos && playerById(id).pos === t.pos));
      hit.forEach((id) => warnings.push(`${them.manager} isn't interested in ${playerById(id).name}.`));
    }
  });
  give.forEach((id) => {
    if (myTags[id] === "untouchable") warnings.push(`${playerById(id).name} is marked untouchable.`);
    // A price applies to "Overpay only" players and to anyone you've set one on
    if (myTags[id] === "amazing" || prices[id]) {
      const price = prices[id] ?? DEFAULT_PRICE;
      if (!clearsPrice(id, get, youDelta, price))
        warnings.push(`${playerById(id).name} only moves if you ${priceLabel(price)}. This deal doesn't get there.`);
    }
  });
  const marketGive = sumValue(give), marketGet = sumValue(get);
  const adjGive = packageValue(give), adjGet = packageValue(get);
  const marketGap = Math.max(adjGive, adjGet) > 0 ? (adjGet - adjGive) / Math.max(adjGive, adjGet) : 0;
  const wants = theirTags.filter((t) => t.kind === "wants");
  const fillsWant = give.some((id) => wants.some((w) => (w.playerId ? w.playerId === id : w.pos === playerById(id).pos)));
  return {
    key: `${them.id}:${give.join(",")}>${get.join(",")}`,
    partnerId: them.id,
    give, get, youBefore, youAfter, themBefore, themAfter, youDelta, themDelta,
    youDrop: youS.dropped, themDrop: themS.dropped, marketGive, marketGet, adjGive, adjGet, marketGap, fillsWant, warnings,
  };
}

function combos(ids: string[], max: number): string[][] {
  const out: string[][] = [];
  ids.forEach((a, i) => {
    out.push([a]);
    if (max > 1) ids.slice(i + 1).forEach((b) => out.push([a, b]));
  });
  return out;
}

export const isWinWin = (t: Trade) => t.youDelta >= 0.5 && t.themDelta >= 0.5;
/** Within 10% on value: fair. */
export const FAIR_GAP = 0.1;
export const isFair = (t: Trade) => Math.abs(t.marketGap) <= FAIR_GAP;

// ---- Would they actually say yes? ------------------------------------------
// A trade idea only shows if a reasonable manager would accept it. Real managers:
// won't lose market value, want a starter back (not bench depth), want their weak
// spot fixed, won't hand over their best player for two lesser ones without a
// premium, and ignore deals that barely move their lineup.
export interface Acceptance { p: number; label: "Likely yes" | "Worth a shot" | "Long shot"; reasons: string[]; blockers: string[]; theirBlockers: string[] }
const starts = (ids: string[], roster: string[]) => { const l = lineupFor(roster); const set = new Set(l.slots.map((s) => s.player?.id)); return ids.filter((id) => set.has(id)); };
export function acceptance(t: Trade, you: Team, them: Team): Acceptance {
  const reasons: string[] = [], blockers: string[] = [], theirBlockers: string[] = [];
  const theirs = (m: string) => { blockers.push(m); theirBlockers.push(m); };
  const themRosterAfter = rosterAfter(them, t, "them");
  const youRosterAfter = rosterAfter(you, t, "you");
  // 1. Value: they won't take a loss on market value. Neither should you.
  const theirGap = -t.marketGap; // positive = they receive more value
  if (theirGap < -0.08) theirs(`${them.manager} gives up ${pct(theirGap).slice(1)} more value`);
  if (t.marketGap < -0.15) blockers.push(`you overpay by ${pct(t.marketGap).slice(1)}`);
  // 2. Their lineup has to get meaningfully better.
  if (t.themDelta < 1) theirs(`${them.manager}'s lineup ${t.themDelta <= -0.05 ? "gets worse" : "barely moves"} (${fmt(t.themDelta)}/wk)`);
  if (t.youDelta < 1) blockers.push(`your lineup ${t.youDelta <= -0.05 ? "gets worse" : "barely moves"} (${fmt(t.youDelta)}/wk)`);
  // 3. Both sides must get at least one player who starts.
  if (!starts(t.give, themRosterAfter).length) theirs(`nothing ${them.manager} gets would start`);
  if (!starts(t.get, youRosterAfter).length) blockers.push("nothing you get would start");
  // 4. No dollar-for-quarters: the best piece each side receives has to be in the same tier as what they give.
  const best = (ids: string[]) => Math.max(...ids.map((id) => marketValue(playerById(id))), 1);
  if (best(t.give) < best(t.get) * 0.7) theirs(`${them.manager} gives the best player and gets lesser pieces back`);
  if (best(t.get) < best(t.give) * 0.7) blockers.push("you give the best player and get lesser pieces back");
  // 5. Don't gut a position they need: their group at the outgoing position can't fall more than it gains elsewhere.
  const before = groupPoints(lineupFor(them.roster)), after = groupPoints(lineupFor(themRosterAfter));
  const worstDrop = Math.min(...(Object.keys(before) as Group[]).map((g) => after[g] - before[g]));
  if (worstDrop < -4) theirs(`it leaves ${them.manager}'s lineup short`);

  // Likelihood. The value term matches RotoTrade's observed acceptance curve: 45% at even value,
  // plus one point for every point of value (on a 0-100 scale) the other side gains. On top of
  // that, things RotoTrade can't see: league need, stated wants, lineup gain and trade history.
  const theirGainPts = (t.adjGive - t.adjGet) / 100;
  let p = 0.45 + Math.max(-40, Math.min(45, theirGainPts)) / 100;
  p += Math.min(0.1, Math.max(0, (t.themDelta - 1) * 0.03));
  const need = needsFor(them).need;
  if (t.give.some((id) => playerById(id).pos === need)) { p += 0.08; reasons.push(`fills their ${need} need`); }
  if (t.fillsWant) { p += 0.08; reasons.push("they're shopping for one"); }
  if (t.give.length === 1 && t.get.length === 1) { p += 0.03; reasons.push("clean 1-for-1"); }
  if (theirGap >= -0.03) reasons.push(theirGap >= 0.03 ? "they win on value" : "even on value");
  if (t.themDelta >= 2) reasons.push(`their lineup +${t.themDelta.toFixed(1)}/wk`);
  const td = tendencies(them.id);
  if (td.closeRate !== null) p += (td.closeRate - 0.35) * 0.2;
  if (theirBlockers.length) p = Math.min(p, 0.2);
  p = Math.max(0.02, Math.min(0.95, p));
  return { p, label: p >= 0.65 ? "Likely yes" : p >= 0.5 ? "Worth a shot" : "Long shot", reasons, blockers, theirBlockers };
}

export function findTrades(you: Team, them: Team, tags: ManagerTag[], myTags: Record<string, MyTag>, prices: Record<string, Price>, limit = 3): Trade[] {
  return drain(scanTrades(you, them, tags, myTags, prices, limit));
}
/** findTrades as steps: after each package from your side it reports how many swaps it has scored. `scored` carries
 *  the count across several teams. */
export function* scanTrades(you: Team, them: Team, tags: ManagerTag[], myTags: Record<string, MyTag>, prices: Record<string, Price>, limit = 3, scored = { n: 0 }): Steps<Trade[]> {
  const results: Trade[] = [];
  for (const give of combos(you.roster, 2)) {
    yield { t: "n", n: scored.n };
    for (const get of combos(them.roster, 2)) {
      if (give.length + get.length > 3) continue;
      scored.n++;
      const t = evaluate(you, them, give, get, tags, myTags, prices);
      if (t.warnings.length) continue;
      if (t.youDelta < 1 || t.themDelta < 1) continue;
      const a = acceptance(t, you, them);
      if (a.blockers.length || a.p < 0.5) continue;
      t.accept = a;
      results.push(t);
    }
  }
  // Rank by how likely they say yes, then by what it does for you
  const score = (t: Trade) => (t.accept?.p ?? 0) * 6 + Math.min(t.youDelta, 4) - (t.give.length + t.get.length - 2) * 0.5;
  results.sort((a, b) => score(b) - score(a));
  // Keep variety: no repeat of the same headline pair, and no padded versions of a simpler deal.
  const seen = new Set<string>();
  const kept: Trade[] = [];
  for (const t of results) {
    const k = t.get[0] + "|" + t.give[0];
    if (seen.has(k)) continue;
    const padded = kept.some((x) => x.give.every((id) => t.give.includes(id)) && x.get.every((id) => t.get.includes(id)));
    if (padded) continue;
    seen.add(k);
    kept.push(t);
    if (kept.length >= limit) break;
  }
  return kept;
}

/** Cheapest offer from `them` that moves your locked player and clears your price. */
export function whatItWouldTake(you: Team, them: Team, playerId: string, tags: ManagerTag[], price: Price): Trade | null {
  let best: Trade | null = null;
  for (const get of combos(them.roster, 2)) {
    const t = evaluate(you, them, [playerId], get, tags, {}, {});
    if (t.warnings.length) continue;
    if (!clearsPrice(playerId, get, t.youDelta, price) || t.themDelta < 0) continue;
    if (acceptance(t, you, them).theirBlockers.length) continue;
    if (!best || t.youDelta < best.youDelta) best = t;
  }
  return best;
}

/** What it would take to GET a player: the package from your roster that works for them and costs you least. */
export function costToGet(you: Team, playerId: string, tags: ManagerTag[], myTags: Record<string, MyTag>, prices: Record<string, Price>): { trade: Trade; works: boolean } | null {
  return drain(costToGetSteps(you, playerId, tags, myTags, prices));
}
/** costToGet as steps, counting the packages from your roster it has tried. */
export function* costToGetSteps(you: Team, playerId: string, tags: ManagerTag[], myTags: Record<string, MyTag>, prices: Record<string, Price>): Steps<{ trade: Trade; works: boolean } | null> {
  const owner = TEAMS.find((t) => t.roster.includes(playerId));
  if (!owner || owner.you) return null;
  let best: Trade | null = null;
  let closest: Trade | null = null;
  let tried = 0;
  for (const give of combos(you.roster, 2)) {
    yield { t: "n", n: tried++ };
    const t = evaluate(you, owner, give, [playerId], tags, myTags, prices);
    if (t.warnings.length) continue;
    if (t.themDelta >= 1 && !acceptance(t, you, owner).theirBlockers.length && (!best || t.youDelta > best.youDelta)) best = t;
    if (t.youDelta >= 0 && (!closest || t.themDelta > closest.themDelta)) closest = t;
  }
  yield { t: "n", n: tried };
  if (best) return { trade: best, works: true };
  return closest ? { trade: closest, works: false } : null;
}

/** Counteroffer coach: tweak a deal by one player so it works for you and still works for them. */
export function counterFor(t: Trade, tags: ManagerTag[], myTags: Record<string, MyTag>, prices: Record<string, Price>): { trade: Trade; line: string } | null {
  const them = teamById(t.partnerId);
  const options: { trade: Trade; line: string }[] = [];
  them.roster.filter((id) => !t.get.includes(id)).forEach((id) => {
    if (t.get.length >= 2) return;
    const n = evaluate(YOU, them, t.give, [...t.get, id], tags, myTags, prices);
    if (!n.warnings.length) options.push({ trade: n, line: `Ask for ${playerById(id).name} too` });
  });
  YOU.roster.filter((id) => !t.give.includes(id)).forEach((id) => {
    if (t.give.length >= 2) return;
    const n = evaluate(YOU, them, [...t.give, id], t.get, tags, myTags, prices);
    if (!n.warnings.length) options.push({ trade: n, line: `Add your ${playerById(id).name}` });
  });
  t.get.forEach((id) => {
    them.roster.filter((x) => !t.get.includes(x)).forEach((alt) => {
      const n = evaluate(YOU, them, t.give, t.get.map((g) => (g === id ? alt : g)), tags, myTags, prices);
      if (!n.warnings.length) options.push({ trade: n, line: `Ask for ${playerById(alt).name} instead of ${playerById(id).name}` });
    });
  });
  t.give.forEach((id) => {
    if (t.give.length < 2) return;
    const n = evaluate(YOU, them, t.give.filter((x) => x !== id), t.get, tags, myTags, prices);
    if (!n.warnings.length) options.push({ trade: n, line: `Keep ${playerById(id).name} out of it` });
  });
  // Only counters they'd plausibly accept: nothing on their side blocks it, and it still helps you.
  const scored = options.map((o) => ({ ...o, a: acceptance(o.trade, YOU, them) }))
    .filter((o) => !o.a.theirBlockers.length && o.a.p >= 0.5 && o.trade.youDelta >= 0.5 && o.trade.marketGap >= -0.15)
    .sort((a, b) => b.a.p - a.a.p || b.trade.youDelta - a.trade.youDelta);
  if (!scored[0]) return null;
  scored[0].trade.accept = scored[0].a;
  return { trade: scored[0].trade, line: scored[0].line };
}

/** Live tip for the trade builder, phrased from engine numbers. */
export function builderTip(t: Trade, tags: ManagerTag[], myTags: Record<string, MyTag>, prices: Record<string, Price>): string | null {
  if (t.warnings.length) return null;
  if (isWinWin(t)) {
    if (t.themDelta > t.youDelta + 3) return `They gain a lot more than you do (${fmt(t.themDelta)} vs ${fmt(t.youDelta)}). You have room to ask for a little more.`;
    return "Both starting lineups improve. This is ready to pitch.";
  }
  const c = counterFor(t, tags, myTags, prices);
  if (!c) return t.youDelta < 0.5 ? "You lose points here and no single add fixes it. Try a different target." : "They lose points on this one. Try offering a starter at their thinnest spot.";
  return `${c.line} and ${isWinWin(c.trade) ? "you both gain" : "it gets close"}: you ${fmt(c.trade.youDelta)}, they ${fmt(c.trade.themDelta)} a week.`;
}

// ---- Show our work --------------------------------------------------------

export function lineupChanges(before: Lineup, after: Lineup): { slot: SlotName; out: Player | null; in: Player | null; delta: number }[] {
  // Compare slot by slot in the same order
  const out: { slot: SlotName; out: Player | null; in: Player | null; delta: number }[] = [];
  before.slots.forEach((b, i) => {
    const a = after.slots[i];
    if ((b.player?.id ?? "") !== (a.player?.id ?? "")) {
      out.push({ slot: b.slot, out: b.player, in: a.player, delta: round1((a.player ? eff(a.player) : 0) - (b.player ? eff(b.player) : 0)) });
    }
  });
  return out;
}

export function rosterAfter(team: Team, t: Trade, side: "you" | "them") {
  const r = side === "you"
    ? team.roster.filter((id) => !t.give.includes(id)).concat(t.get).filter((id) => !t.youDrop.includes(id))
    : team.roster.filter((id) => !t.get.includes(id)).concat(t.give).filter((id) => !t.themDrop.includes(id));
  return r;
}

export const fmt = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(1)}`;

export function verdict(t: Trade): { label: string; tone: "good" | "warn" | "bad"; line: string } {
  const them = teamById(t.partnerId).manager;
  const market = Math.abs(t.marketGap) <= FAIR_GAP ? "Fair by market value" : t.marketGap > 0 ? `You get ${pct(t.marketGap).slice(1)} more market value` : `You give up ${pct(t.marketGap).slice(1)} more market value`;
  if (isWinWin(t) && isFair(t))
    return { label: "Win-win", tone: "good", line: `${market}, and both lineups improve: you ${fmt(t.youDelta)} a week, ${them} ${fmt(t.themDelta)}. Both sides have a reason to say yes.` };
  if (isWinWin(t) && t.marketGap > 0)
    return { label: "Helps both, tilted your way", tone: "good", line: `${market}. Both lineups improve, but ${them} may want a little more before saying yes.` };
  if (isWinWin(t))
    return { label: "Helps both, you overpay", tone: "warn", line: `${market}. Both lineups improve, so it can still be worth it if you need the fit.` };
  if (t.youDelta >= 0.5)
    return { label: "Tough sell", tone: "warn", line: `Great for you (${fmt(t.youDelta)}), but ${them}'s lineup ${t.themDelta <= -0.05 ? `drops ${Math.abs(t.themDelta).toFixed(1)}` : `barely moves (${fmt(t.themDelta)})`}. ${market}. Expect a no unless you add something.` };
  if (t.themDelta >= 0.5)
    return { label: "You're overpaying", tone: "bad", line: `${them} gains ${fmt(t.themDelta)} while you go ${fmt(t.youDelta)}. ${market}. Ask for a little more before you send it.` };
  return { label: "Lateral", tone: "warn", line: `Neither lineup moves much (you ${fmt(t.youDelta)}, ${them} ${fmt(t.themDelta)}). ${market}.` };
}

/** Plain-English read on an offer someone sent you. */
export function offerRead(t: Trade): { label: string; tone: "good" | "warn" | "bad"; line: string } {
  if (t.youDelta >= 0.5 && t.marketGap >= -FAIR_GAP) return { label: "Take it", tone: "good", line: `Smash accept. Your lineup gains ${fmt(t.youDelta)} pts a week and the value is ${t.marketGap >= 0 ? "in your favor" : "about even"}.` };
  if (t.youDelta >= 0.5) return { label: "Win-now move", tone: "warn", line: `Your lineup gains ${fmt(t.youDelta)} pts a week, but you give up ${pct(t.marketGap).slice(1)} more trade value.` };
  if (t.youDelta > -1) return { label: "Close", tone: "warn", line: `About even (${fmt(t.youDelta)} pts a week). Ask for a small sweetener.` };
  return { label: "Lowball", tone: "bad", line: `Your lineup drops ${fmt(t.youDelta).replace("−", "")} pts a week.` };
}

// ---- Lineup day -----------------------------------------------------------

const started = (team: string) => { const g = gameState(team); return g === "in_game" || g === "complete"; };

export function sleeperDiff(opt: Lineup): { benched: Player; start: Player; slot: string; gain: number }[] {
  const setIds = Object.values(SLEEPER_SET).flat();
  const optIds = opt.slots.map((s) => s.player?.id).filter(Boolean) as string[];
  const shouldStart = optIds.filter((id) => !setIds.includes(id)).map(playerById);
  const shouldSit = setIds.filter((id) => !optIds.includes(id)).map(playerById);
  return shouldStart.map((p, i) => {
    const sit = shouldSit[i];
    const slot = Object.entries(SLEEPER_SET).find(([, ids]) => ids.includes(sit?.id ?? ""))?.[0] ?? "FLEX";
    return { benched: sit, start: p, slot, gain: round1(eff(p, true) - (sit ? eff(sit, true) : 0)) };
    // Sleeper won't move anyone whose game has kicked off, so never suggest those swaps
  }).filter((d) => d.benched && !started(d.benched.nfl) && !started(d.start.nfl));
}

export function weakSlots(): { slot: string; misses: number; weeks: number; gap: number }[] {
  return SLOT_HISTORY.map((h) => {
    const misses = h.you.filter((v, i) => v < h.avg[i]).length;
    const gap = round1(h.you.reduce((s, v, i) => s + (v - h.avg[i]), 0) / h.you.length);
    return { slot: h.slot, misses, weeks: h.you.length, gap };
  }).filter((x) => x.misses >= 4).sort((a, b) => a.gap - b.gap);
}

// ---- Roster tag suggestions ----------------------------------------------

export function suggestTags(lineup: Lineup, myTags: Record<string, MyTag>, tags: ManagerTag[]): { id: string; tag: MyTag; why: string }[] {
  const out: { id: string; tag: MyTag; why: string }[] = [];
  const avg = leagueAvg();
  lineup.slots.forEach((s) => {
    if (!s.player) return;
    const p = s.player;
    const backup = lineup.bench.filter((b) => fits(s.slot, b.pos)).sort((a, b) => eff(b) - eff(a))[0];
    const gap = eff(p) - (backup ? eff(backup) : 0);
    if (gap >= 6 && !myTags[p.id] && !out.some((o) => o.tag === "untouchable"))
      out.push({ id: p.id, tag: "untouchable", why: `${gap.toFixed(1)} pts a week better than anyone behind him. Irreplaceable.` });
  });
  lineup.bench.forEach((p) => {
    if (myTags[p.id]) return;
    if (eff(p) >= avg.FLEX * 0.75) out.push({ id: p.id, tag: "available", why: `Rides your bench but would start for a team thin at ${p.pos}.` });
  });
  const wantedPos = new Set(tags.filter((t) => t.kind === "wants" && t.pos).map((t) => t.pos));
  lineup.slots.forEach((s) => {
    const p = s.player;
    if (!p || myTags[p.id] || out.find((o) => o.id === p.id)) return;
    const depth = lineup.bench.filter((b) => b.pos === p.pos && eff(b) >= eff(p) - 1.5);
    if (wantedPos.has(p.pos) && depth.length) out.push({ id: p.id, tag: "shopping", why: `Teams are asking for a ${p.pos} and you have a backup within 1.5 pts.` });
  });
  return out.slice(0, 3);
}

// ---- Waivers and FAAB -----------------------------------------------------


const DEFAULT_BIDS: Record<BidTier["tier"], number[]> = { Starter: [10, 14, 18, 24], Flex: [4, 6, 9], Depth: [1, 2, 3], Stash: [0, 1, 2] };
export const bidsFor = (tier: BidTier["tier"]): { bids: number[]; estimated: boolean } => {
  const t = FAAB_HISTORY.find((h) => h.tier === tier);
  return t && t.bids.length >= 2 ? { bids: t.bids, estimated: !!t.estimated } : { bids: DEFAULT_BIDS[tier], estimated: true };
};

/** What a kicker or defense pickup does for you. Only set on K/DEF recs. */
export interface KdefRec {
  /** The K/DEF you start now: the one set in Sleeper, else the best you roster. Null when the slot is empty. */
  current: SpecialPlayer | null;
  /** Your best K/DEF projection this week, what the free agent has to beat. */
  baseline: number;
  /** Set when your slot scores zero this week: a must-fix. */
  fix: "bye" | "out" | "empty" | null;
  /** True for the single best fix at his position, the one that ranks with the top pickups. */
  lead?: boolean;
  /** Streaming: the K/DEF to cut for him. Null when you'd drop a bench player or have room. */
  drop: SpecialPlayer | null;
  /** One line for the row and the top pickup card, e.g. "Your DEF is on bye. Seahawks D/ST projects 8.0 vs the Rams." */
  line: string;
}
export interface WaiverRec {
  fa: WaiverFA; value: number; gain: number; drop: Player | null; bid: [number, number]; tier: BidTier["tier"] | "Stream"; estimated: boolean; kdef?: KdefRec;
  /** What he adds to your lineup a week the rest of the way (ROS projections). */
  ros?: number;
  /** The starting slot he'd take the rest of the way, or this week when he only helps this week. */
  slot?: string | null;
  /** This week every one of your players at his position is out or on bye. */
  hole?: boolean;
  /** Weakness-first rank: see fitScore. Higher is a better add for you. */
  score?: number;
  /** Why he fits, naming the weak spot he fixes (or the hole he fills). Null when he's depth. */
  fit?: string | null;
  /** Your roster is full and nobody on your bench is worth cutting for him. */
  noDrop?: boolean;
  /** The slot he'd take the rest of the way, null when he doesn't crack your ROS lineup. */
  rosSlot?: string | null;
  /** Worth recommending: helps a weak slot, helps the rest of the way, or fills a real hole. A one-week fill at a
   *  slot that's already fine (a third QB the week your starter faces a tough defense) still lists, but is never
   *  the top pickup, a nudge or a quick move. */
  pick?: boolean;
}

// ---- Weakness first ---------------------------------------------------------
// Recommendations rank by how much they fix your weakest starting slots. A rest-of-season gain at a slot that's
// below the league average counts for FIT_WEEKS weeks, scaled up by how far below it is. A one-week fill at a slot
// that's already fine counts half, once. A real hole (everyone you have at the position is out or on bye) counts
// in full for that week, so it only outranks rest-of-season help at a weak slot when the hole is bigger.
export const FIT_WEEKS = 3;

/** Points a week each starting slot is above (+) or below (−) the league average: the Slot report where it has
 *  weeks, else this week's needs map. */
export function slotGaps(): Record<string, number> {
  const n = needsFor(YOU);
  const out: Record<string, number> = {};
  groupsFor().forEach((g) => (out[g] = n.groups[g].diff));
  SLOT_HISTORY.forEach((h) => { if (h.you.length) out[h.slot] = round1(h.you.reduce((s, v, i) => s + (v - (h.avg[i] ?? v)), 0) / h.you.length); });
  return out;
}
/** Slots that count as weak: short most weeks in the Slot report, or 2+ points a week under the average. */
export function weakSet(gaps = slotGaps()): Set<string> {
  const s = new Set(weakSlots().map((w) => w.slot));
  Object.entries(gaps).forEach(([k, v]) => { if (v <= -2) s.add(k); });
  return s;
}
/** How much a gain at this slot is worth: 1 at an average slot, up to 2 at a slot 10+ points under. */
const slotWeight = (slot: string | null | undefined, gaps: Record<string, number>, weak: Set<string>) =>
  slot && weak.has(slot) ? 1 + Math.min(1, Math.max(0, -(gaps[slot] ?? 0)) / 10) : 1;
/** Positions whose depth protects a weak slot: RB when RB is weak, every flex position when FLEX is. */
const weakPositions = (weak: Set<string>): Set<string> => {
  const s = new Set<string>();
  weak.forEach((slot) => { if (slot === "FLEX") FLEX_OK.forEach((p) => s.add(p)); else if (slot === "SF") POS_ORDER.forEach((p) => s.add(p)); else s.add(slot); });
  return s;
};
const last = (name: string) => name.split(" ").slice(-1)[0];
const listNames = (ns: string[]) => (ns.length <= 1 ? ns.join("") : `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`);

export interface FitInput {
  name: string; pos: string; week: number;
  /** Lineup gain that week, and a week rest of season. */
  weekGain: number; ros: number;
  /** Slot he'd take ROS, and the one he'd take that week. */
  rosSlot: string | null; weekSlot: string | null;
  /** Names of your players at his position who are all off that week (empty = no hole). */
  holeNames: string[];
}
/** Score and why-line for one add. Shared by the engine (this week) and the Waivers week view (other weeks). */
export function fitScore(x: FitInput, gaps = slotGaps(), weak = weakSet(gaps)): { score: number; line: string | null; slot: string | null; pick: boolean } {
  const hole = x.holeNames.length > 0 && x.weekGain > 0.05;
  const rosW = slotWeight(x.rosSlot, gaps, weak);
  const wkW = x.weekSlot && weak.has(x.weekSlot) ? 1 : 0.5;
  const rosPart = x.ros > 0.05 ? x.ros * FIT_WEEKS * rosW : 0;
  const weekPart = x.weekGain > 0.05 ? x.weekGain * (hole ? 1 : wkW) : 0;
  const score = round1(rosPart + weekPart);
  const gapOf = (slot: string) => gaps[slot] ?? 0;
  let line: string | null = null;
  const slot = x.ros > 0.05 ? x.rosSlot : x.weekGain > 0.05 ? x.weekSlot : null;
  if (hole) {
    const off = x.holeNames.length === 1 ? `${x.holeNames[0]} is off` : x.holeNames.length === 2 ? `${listNames(x.holeNames)} are both off` : `${listNames(x.holeNames)} are all off`;
    line = `${off} in week ${x.week}. He'd fill your ${x.weekSlot ?? x.pos} spot for ${x.weekGain.toFixed(1)}.`;
  } else if (x.ros > 0.05 && x.rosSlot && weak.has(x.rosSlot) && gapOf(x.rosSlot) < 0) {
    line = `Your ${x.rosSlot} spot is ${Math.abs(gapOf(x.rosSlot)).toFixed(1)} below the league average. He'd start there and add ${x.ros.toFixed(1)} a week.`;
  } else if (x.ros > 0.05 && x.rosSlot) {
    line = `He'd start at ${x.rosSlot} and add ${x.ros.toFixed(1)} a week the rest of the way.`;
  } else if (x.weekGain > 0.05 && x.weekSlot) {
    const g = gapOf(x.weekSlot);
    line = `A one-week fill at ${x.weekSlot}${g >= 0.5 ? `, where you're already ${g.toFixed(1)} above the league average` : ""}. Doesn't help after week ${x.week}.`;
  }
  const pick = hole || x.ros > 0.05 || (x.weekGain > 0.05 && !!x.weekSlot && weak.has(x.weekSlot));
  return { score, line, slot, pick };
}
/** Who to cut for a rec, and a short note on him, for copy shared by every waiver surface. */
export const recDrop = (r: WaiverRec): { name: string; note: string } | null =>
  r.kdef?.drop ? { name: r.kdef.drop.name, note: r.kdef.drop.wk === null ? "on bye" : r.kdef.drop.status === "O" ? "out" : `${specialPts(r.kdef.drop).toFixed(1)} projected` }
    : r.drop ? { name: r.drop.name, note: `${eff(r.drop).toFixed(1)} projected` } : null;
/** "vs the Rams" / "at the 49ers", from "vs LAR", "@ SF" or a bare "LAR". */
export const oppPhrase = (opp?: string) => {
  if (!opp) return "";
  const m = /^(vs|@)\s*(.+)$/.exec(opp);
  return m ? `${m[1] === "@" ? "at" : "vs"} ${teamNick(m[2])}` : `against ${teamNick(opp)}`;
};
/** Bid range for a K/DEF: the league's own winning K/DEF bids when there are a few, else $0 to 1% of budget. */
export const specialBidRange = (): { bid: [number, number]; estimated: boolean; bids: number[] } => {
  if (SPECIAL_BIDS.length >= 2) {
    const sorted = SPECIAL_BIDS.slice().sort((a, b) => a - b);
    const q = (x: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(x * (sorted.length - 1))))];
    return { bid: [q(0.25), Math.max(1, q(0.85))], estimated: false, bids: SPECIAL_BIDS };
  }
  return { bid: [0, 1], estimated: true, bids: [] };
};

/** Free agents Sleeper won't let you add for this week: their game kicked off already, or they're on bye. */
export function waiverHidden() {
  let played = 0, bye = 0;
  for (const fa of FREE_AGENTS) { const s = gameState(fa.nfl); if (s === "bye") bye++; else if (s === "in_game" || s === "complete") played++; }
  return { played, bye };
}

export function waiverRecs(you: Team): WaiverRec[] { return drain(waiverRecsSteps(you)); }
/** waiverRecs as steps: counts the free agents it has put in your lineup. */
export function* waiverRecsSteps(you: Team): Steps<WaiverRec[]> {
  const ctx = recCtx(you);
  const skill: WaiverRec[] = [];
  for (const fa of FREE_AGENTS) {
    if (lockedThisWeek(fa.nfl)) continue;
    skill.push(skillRec(you, ctx, fa));
    yield { t: "n", n: skill.length };
  }
  const all: WaiverRec[] = [...skill, ...specialRecs(you, ctx.base)];
  yield { t: "n", n: all.length };
  // Only the best K/DEF fix per slot jumps the line: you need one defense, not four. A fix is a hole and counts
  // in full; a stream that only beats what you have counts half, like any one-week fill at a slot that's fine.
  const bestFix = new Map<string, string>();
  all.filter((r) => r.kdef?.fix).sort((a, b) => b.gain - a.gain).forEach((r) => { if (!bestFix.has(r.fa.pos)) bestFix.set(r.fa.pos, r.fa.id); });
  all.forEach((r) => {
    if (!r.kdef) return;
    if (bestFix.get(r.fa.pos) === r.fa.id) r.kdef.lead = true;
    r.score = r.gain > 0.05 ? round1(r.gain * (r.kdef.lead ? 1 : 0.5)) : 0;
    r.pick = r.gain > 0.05;
  });
  // Weakness first: anyone who helps ranks by fitScore; then K/DEF streams that don't help, then plain depth
  const helps = (r: WaiverRec) => (r.score ?? 0) > 0.05;
  return all.sort((a, b) => Number(helps(b)) - Number(helps(a)) || Number(!!b.pick) - Number(!!a.pick) || (b.score ?? 0) - (a.score ?? 0) || Number(!!a.noDrop) - Number(!!b.noDrop) || Number(!!a.kdef) - Number(!!b.kdef) || b.gain - a.gain || b.value - a.value);
}

/** Claim details for skill players whose game already kicked off this week, so a later week can still show a bid and a drop. */
export const lockedRecs = (you: Team): WaiverRec[] => {
  const ctx = recCtx(you);
  return FREE_AGENTS.filter((fa) => lockedThisWeek(fa.nfl)).map((fa) => skillRec(you, ctx, fa));
};

interface RecCtx { base: Lineup; baseRos: Lineup; gaps: Record<string, number>; weak: Set<string>; weakPos: Set<string> }
const recCtx = (you: Team): RecCtx => {
  const gaps = slotGaps(), weak = weakSet(gaps);
  return { base: lineupFor(you.roster, true), baseRos: lineupFor(you.roster), gaps, weak, weakPos: weakPositions(weak) };
};

/** Your players at a position who are all off this week (out or on bye), when that leaves the slot with nobody. */
function holeAt(base: Lineup, you: Team, pos: Pos): string[] {
  const exact = base.slots.filter((s) => s.slot === pos);
  if (!exact.length || exact.some((s) => s.player && eff(s.player, true) > 0)) return [];
  return you.roster.map(playerById).filter((p) => p.pos === pos).sort((a, b) => eff(b) - eff(a)).map((p) => last(p.name));
}

/** Who to cut for an add. Never a better same-position player, never depth at a weak spot that's comparable to the
 *  add (or any of it for an add who doesn't help you the rest of the way), and never a K or DEF. The lowest
 *  rest-of-season value among what's left. A real hole may cut the cheapest weak-spot depth if that's all there is. */
function pickDrop(you: Team, ctx: RecCtx, fa: FreeAgent, value: number, ros: number, hole: boolean, starters: Set<string>): Player | null {
  const bench = you.roster.map(playerById).filter((x) => x && !starters.has(x.id));
  const sameBetter = (x: Player) => x.pos === fa.pos && eff(x) >= value - 0.5;
  const guarded = (x: Player) => ctx.weakPos.has(x.pos) && (ros <= 0.05 || eff(x) >= value - 1);
  const byValue = (a: Player, b: Player) => eff(a) - eff(b);
  const ok = bench.filter((x) => !sameBetter(x) && !guarded(x)).sort(byValue)[0];
  if (ok) return ok;
  if (hole) return bench.filter((x) => !sameBetter(x)).sort(byValue)[0] ?? null;
  return null;
}

function skillRec(you: Team, ctx: RecCtx, fa: FreeAgent): WaiverRec {
  // Live free agents are already in PLAYERS; demo ones get a temporary entry.
  const existed = !!PLAYERS[fa.id];
  if (!existed) { const g = demoGame(fa.nfl); PLAYERS[fa.id] = { id: fa.id, name: fa.name, pos: fa.pos, nfl: fa.nfl, proj: fa.proj, opp: g ? `${g.home ? "vs" : "@"} ${g.opp}` : undefined, gameDate: g?.date }; }
  const p = PLAYERS[fa.id];
  const withFa = lineupFor([...you.roster, fa.id], true);
  const withRos = lineupFor([...you.roster, fa.id]);
  const gain = round1(withFa.total - ctx.base.total);
  const ros = round1(Math.max(0, withRos.total - ctx.baseRos.total));
  const value = eff(p);
  const weekSlot = gain > 0.05 ? withFa.slots.find((s) => s.player?.id === fa.id)?.slot ?? null : null;
  const rosSlot = ros > 0.05 ? withRos.slots.find((s) => s.player?.id === fa.id)?.slot ?? null : null;
  const holeNames = gain > 0.05 ? holeAt(ctx.base, you, fa.pos) : [];
  const f = fitScore({ name: fa.name, pos: fa.pos, week: WEEK, weekGain: gain, ros, rosSlot, weekSlot, holeNames }, ctx.gaps, ctx.weak);
  // Drop by rest-of-season value, never by a one-week bye. Anyone who'd start for you either week stays.
  const starters = new Set([...withFa.slots, ...withRos.slots].map((s) => s.player?.id).filter(Boolean) as string[]);
  const drop = pickDrop(you, ctx, fa, value, ros, holeNames.length > 0, starters);
  // Same room rule as K/DEF: skill spots plus K/DEF spots on the full Sleeper roster
  const full = you.roster.length + (you.special ?? []).length >= LEAGUE.rosterMax + (LEAGUE.specialSlots ?? []).length;
  const noDrop = !drop && full;
  // Tier is what he'd be for you, not in a vacuum: a 15-point QB behind two better QBs is depth, not a starter
  const useful = ros > 0.05 || holeNames.length > 0;
  const tier: BidTier["tier"] = gain >= 2 && useful || ros >= 2 ? "Starter" : useful && value >= 9.5 ? "Flex" : fa.rookie ? "Stash" : "Depth";
  const { estimated } = bidsFor(tier);
  const bid = recBid(fa, value, ros, holeNames.length > 0 && gain > 0.05);
  if (!existed) delete PLAYERS[fa.id];
  // No one worth cutting: he still lists, but ranks under anything you can actually claim
  const score = noDrop ? round1(f.score * 0.25) : f.score;
  return { fa, value, gain, drop, bid, tier, estimated, ros, slot: f.slot, hole: holeNames.length > 0 && gain > 0.05, score, fit: f.line, noDrop, rosSlot, pick: f.pick && !noDrop };
}

/** Kickers and defenses on the wire against the one you start this week. */
function specialRecs(you: Team, base: Lineup): WaiverRec[] {
  const slots = LEAGUE.specialSlots ?? [];
  const mine = (you.special ?? []).map((id) => LEAGUE.specials?.[id]).filter(Boolean) as SpecialPlayer[];
  const setIds = you.setSpecial ?? (you.id === YOU.id ? LEAGUE.sleeperSpecial : undefined) ?? [];
  const { bid, estimated } = specialBidRange();
  // Room on the full Sleeper roster (skill spots plus K/DEF spots) means no one has to go
  const room = you.roster.length + mine.length < LEAGUE.rosterMax + slots.length;
  const benchDrop = room ? null : base.bench.slice().sort((a, b) => eff(a) - eff(b))[0] ?? null;
  return SPECIAL_FREE_AGENTS.filter((fa) => slots.includes(fa.pos) && !lockedThisWeek(fa.nfl) && fa.status !== "O").map((fa) => {
    const pos = fa.pos;
    const have = mine.filter((p) => p.pos === pos);
    const current = have.find((p) => setIds.includes(p.id)) ?? have.slice().sort((a, b) => specialPts(b) - specialPts(a) || b.proj - a.proj)[0] ?? null;
    const baseline = Math.max(0, ...have.map(specialPts));
    const fix: KdefRec["fix"] = baseline > 0 ? null : !current ? "empty" : current.status === "O" ? "out" : "bye";
    const wk = fa.wk ?? 0;
    const gain = round1(wk - baseline);
    // Streaming: cut the K/DEF you'd stop using (the weakest this week), never a skill player
    const drop = have.slice().sort((a, b) => specialPts(a) - specialPts(b) || a.proj - b.proj)[0] ?? null;
    const opp = oppPhrase(fa.opp);
    const proj = `${fa.name} projects ${wk.toFixed(1)}${opp ? ` ${opp}` : ""}.`;
    const line = fix === "empty" ? `You have no ${pos} this week. ${proj}`
      : fix ? `Your ${pos} is ${fix === "bye" ? "on bye" : "out"}. ${proj}`
      : `${proj} Your ${current!.name} projects ${specialPts(current!).toFixed(1)}.`;
    return { fa, value: wk, gain, drop: drop ? null : benchDrop, bid, tier: "Stream" as const, estimated, kdef: { current, baseline, fix, drop, line } };
  });
}
/** Percent of budget to dollars. Suggested amounts round the way Sleeper's do ($1 steps under $20, $5 under $100,
 *  then $10); pass exact for a real bid from league history. */
export const bidDollars = (pct: number, exact = false) => {
  const d = (pct / 100) * FAAB.budget;
  const step = exact ? 1 : d >= 100 ? 10 : d >= 20 ? 5 : 1;
  return Math.round(d / step) * step;
};
/** A Sugg. bid range in dollars, "$100-$200", the same shape Sleeper shows. */
export const bidRange = (b: [number, number] | number[]) => { const lo = bidDollars(b[0]), hi = bidDollars(b[1]); return lo === hi ? `$${hi}` : `$${lo}-$${hi}`; };
/** Where the Sugg. bid numbers come from, for the note beside them. */
export const bidSourceNote = () => FAAB.source === "Sleeper" ? "From Sleeper."
  : `From Sources. Sized to your $${FAAB.budget.toLocaleString("en-US")} budget, how fast he's being added and what your lineup needs.`;

// ---- Sugg. bid ----------------------------------------------------------------
// Sized the way Sleeper sizes its own suggested bid: what the player is worth, how fast he's being added across the
// platform and how much your lineup needs him, scaled to how high winning bids run in your league. Sleeper shows
// its number only in its mobile app, from a signed-in private endpoint, so Sources computes its own and tunes it to
// land near Sleeper's (Tyrone Tracy, $100-$200 in a $1,000 league, week 7 of 2026).
const POS_FLOOR: Record<string, number> = { QB: 12, RB: 5, WR: 5, TE: 4 };
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** How hot he is across the platform, 0 to 1: Sleeper-wide adds this week (100k is the top), else roster % and trend. */
export const demandOf = (fa: FreeAgent) => fa.adds !== undefined ? clamp01(Math.log10(fa.adds + 1) / 5)
  : clamp01((fa.rostered ?? 0) / 80 + (fa.trend === "up" ? 0.35 : 0));
/** How high winning skill bids run in your league, as a percent of budget: the 90th percentile, else 15. */
const leagueTop = () => {
  const all = FAAB_HISTORY.flatMap((h) => h.bids).filter((b) => b > 0).sort((a, b) => a - b);
  return all.length >= 4 ? Math.max(5, all[Math.round(0.9 * (all.length - 1))]) : 15;
};
/** Sugg. bid for a skill player, as [low, high] percent of the full budget, never more than you have left. */
export function recBid(fa: FreeAgent, value: number, ros: number, hole: boolean): [number, number] {
  const worth = clamp01((value - (POS_FLOOR[fa.pos] ?? 5)) / 10);
  const need = clamp01(ros / 4) * 0.8 + (hole ? 0.2 : 0);
  const mid = leagueTop() * 2.5 * (0.35 * worth + 0.4 * demandOf(fa) + 0.25 * need);
  const left = FAAB.budget > 0 ? (FAAB.remaining / FAAB.budget) * 100 : 0;
  return [round1(Math.min(left, mid * 0.65)), round1(Math.min(left, Math.max(1, mid * 1.3)))];
}

// ---- Manager tendencies ---------------------------------------------------

export interface Tendency { teamId: string; trades: number; offers: number | null; closeRate: number | null; buys: Pos[]; rookieShare: number; summary: string }

export function tendencies(teamId: string): Tendency {
  const done = COMPLETED_TRADES.filter((t) => t.a === teamId || t.b === teamId);
  const got = done.flatMap((t) => (t.a === teamId ? t.aGot : t.bGot));
  const count: Partial<Record<Pos, number>> = {};
  got.forEach((g) => (count[g.pos] = (count[g.pos] ?? 0) + 1));
  const buys = (Object.keys(count) as Pos[]).sort((a, b) => (count[b] ?? 0) - (count[a] ?? 0)).filter((p) => (count[p] ?? 0) >= 1).slice(0, 2);
  const rookieShare = got.length ? got.filter((g) => g.rookie).length / got.length : 0;
  const offers = OFFERS_RECEIVED ? OFFERS_RECEIVED[teamId] ?? 0 : null;
  const closeRate = offers ? done.length / offers : null;
  const mgr = teamById(teamId).manager;
  const parts: string[] = [];
  if (!done.length) parts.push(`${mgr} hasn't completed a trade ${OFFERS_RECEIVED ? "in the last year" : "this season"}. Expect a slow reply and a hard bargain.`);
  else {
    parts.push(closeRate !== null ? `${mgr} has closed ${done.length} of ${offers} offers.` : `${mgr} has made ${done.length} trade${done.length === 1 ? "" : "s"} this season.`);
    if (buys.length) parts.push(`Usually buys ${buys.join(" and ")}.`);
    if (rookieShare >= 0.5) parts.push("Chases rookies, so lead with youth.");
    else if (closeRate !== null ? closeRate >= 0.4 : done.length >= 2) parts.push("Says yes more than most. Lead with a clean 1-for-1.");
    else parts.push("Tough to close. Don't open with a lowball.");
  }
  return { teamId, trades: done.length, offers, closeRate, buys, rookieShare, summary: parts.join(" ") };
}

// ---- Tags from what people say -------------------------------------------

const POS_WORDS: [RegExp, Pos][] = [
  [/\b(qb|quarterback)s?\b/i, "QB"], [/\b(rb|running ?back)s?\b/i, "RB"],
  [/\b(wr|receiver|wide ?out)s?\b/i, "WR"], [/\b(te|tight ?end)s?\b/i, "TE"],
];

export interface ParsedTag { tag: Omit<ManagerTag, "id"> | null; reason?: string }

export function parseTag(text: string, teamId?: string): ParsedTag {
  const s = text.trim();
  if (!s) return { tag: null, reason: "Type what they said." };
  // A manager or team named in the sentence wins ("Sk4zi won't move cook"); otherwise whoever the composer has picked.
  // One loose word of a team name ("griddy") only decides when nobody is picked.
  const said = teamInText(s);
  const named = said && (said.score >= 2 || !teamId) ? said : null;
  const team = named ? named.item : teamId ? TEAMS.find((t) => t.id === teamId && !t.you) : undefined;
  if (!team) return { tag: null, reason: `Couldn't tell who said it. Start with their name, like "${TEAMS.find((t) => !t.you)?.manager ?? "Mike"} said…".` };
  const lower = s.toLowerCase();
  let kind: ManagerTag["kind"] | null = null;
  if (/(not interested|(isn|aren)'?t interested|no interest|doesn'?t want|does not want|pass(ed)? on|no thanks|don'?t want)/.test(lower)) kind = "notInterested";
  else if (/(won'?t (move|trade|give|deal)|not (moving|trading|selling)|refuses?|untouchable|keeping|off the table)/.test(lower)) kind = "refuses";
  else if (/(wants?|looking for|needs?|shopping|interested in|after|would take|open to)/.test(lower)) kind = "wants";
  if (!kind) return { tag: null, reason: "Couldn't tell if they want, refuse, or passed. Try words like \"wants\", \"won't move\", or \"not interested\"." };
  // Player: refuses → their roster, notInterested → your roster, wants → either
  const pool = kind === "refuses" ? team.roster : kind === "notInterested" ? YOU.roster : [...YOU.roster, ...team.roster];
  // Same folding as the pickers: "jamarr", "st brown", "aj brown", "ken walker", "cook's". A shared last name goes to this pool's order.
  const player = playersInText(s, pool.map(playerById).filter(Boolean), (p) => p.name, { skip: named ? [named.span] : undefined, names: playerWords().names })[0]?.item;
  const pos = POS_WORDS.find(([re]) => re.test(s))?.[1];
  if (!player && !pos) return { tag: null, reason: "Name a player or a position so Sources knows what it applies to." };
  const subject = player ? player.name : `their ${pos}`;
  const label = kind === "wants" ? (player ? `Wants ${player.name}` : `Looking for ${pos} help`) : kind === "refuses" ? `Won't move ${player ? player.name : `his ${pos}`}` : `Not interested in ${subject.replace("their", "your")}`;
  return { tag: { teamId: team.id, kind, playerId: player?.id, pos: player ? undefined : pos, text: label, weeksOld: 0 } };
}

let wordsKey = "", wordsCache: ReturnType<typeof nameWords> = { words: new Set(), names: new Set() };
/** Words of every player's name, so a team called "Bijan Mustard" isn't found by "bijan". */
function playerWords() {
  const key = `${leagueKey()}:${Object.keys(PLAYERS).length}`;
  if (key !== wordsKey) { wordsKey = key; wordsCache = nameWords(Object.values(PLAYERS).map((p) => p.name)); }
  return wordsCache;
}

/** The other team a sentence names, by manager ("sk4zi", "Mike's") or team name ("jalen my way", "griddy"). */
export function teamInText(text: string) {
  return teamsInText(text, TEAMS.filter((t) => !t.you), (t) => t, playerWords())[0] ?? null;
}

/**
 * The player a sentence names. Other teams' players come first, then yours, then free agents, so a shared
 * last name lands on someone you could trade for.
 */
export function playerInText(text: string, skip?: [number, number][]) {
  const order = [...TEAMS.filter((t) => !t.you).flatMap((t) => t.roster), ...YOU.roster, ...Object.keys(PLAYERS)];
  return playersInText(text, [...new Set(order)].map(playerById).filter(Boolean), (p) => p.name, { skip, names: playerWords().names })[0]?.item;
}

// ---- Ask your league ------------------------------------------------------

export interface Answer { text: string; points: string[]; links: { label: string; tab: string; teamId?: string; trade?: Trade }[] }

export function ask(q: string, tags: ManagerTag[], myTags: Record<string, MyTag>, prices: Record<string, Price>, passed: string[] = []): Answer {
  return drain(askSteps(q, tags, myTags, prices, passed));
}

const poss = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
const names = (ids: string[]) => ids.map((id) => playerById(id).name).join(" + ");
const yourRoster = (): TraceEv => ({ t: "step", doing: "Reading your roster", done: `Read your roster (${YOU.roster.length} players)`, chips: [{ label: YOU.name, kind: "team" }] });

/**
 * Ask, as the steps it really takes. It reads the question, says in a sentence what it's going to do, then reports
 * each piece of work with real counts (rosters checked, lineups built, swaps scored) before it returns the answer.
 * ask() runs the same steps straight through.
 */
export function* askSteps(q: string, tags: ManagerTag[], myTags: Record<string, MyTag>, prices: Record<string, Price>, passed: string[] = []): Steps<Answer> {
  const s = q.toLowerCase();
  const pos = POS_WORDS.find(([re]) => re.test(q))?.[1];
  const said = teamInText(q);
  const named = playerInText(q, said ? [said.span] : undefined);
  const others = TEAMS.filter((t) => !t.you);

  if (/(who has|who owns|who'?s got|who got|whose team|where is|which team)/.test(s) && named) {
    yield { t: "think", text: `You want to know who has ${named.name}. I'll go through every roster in the league, IR spots included.` };
    yield { t: "step", doing: "Checking {n} rosters", done: "Checked {n} rosters", n: 0, chips: [{ label: named.name, kind: "player" }] };
    let owner: Team | undefined;
    let n = 0;
    for (const x of TEAMS) {
      n++;
      if (x.roster.includes(named.id) || x.ir?.includes(named.id)) { owner = x; yield { t: "n", n, chip: { label: x.name, kind: "team" } }; break; }
      yield { t: "n", n };
    }
    if (!owner) return { text: `${named.name} isn't on a roster. He's a free agent.`, points: [`${named.pos} · ${named.nfl}`], links: [{ label: "Open waivers", tab: "waivers" }] };
    if (owner.you) return { text: `${named.name} is on your team.`, points: [`${named.pos} · ${named.nfl}`], links: [{ label: "Open your lineup", tab: "roster" }] };
    return {
      text: `${owner.manager} has ${named.name}.`,
      points: [`${owner.name} · ${owner.record}`, `${named.pos} · ${named.nfl}`],
      links: [{ label: `Build a trade with ${owner.manager}`, tab: "trade", teamId: owner.id }],
    };
  }

  if (/(what would it take|cost|get|trade for|acquire)/.test(s) && named && !YOU.roster.includes(named.id)) {
    const owner = TEAMS.find((x) => x.roster.includes(named.id))!;
    yield { t: "think", text: `You want ${named.name}${owner ? ` from ${owner.manager}` : ""}. I'll try every one and two player package from your roster, skip anyone you've marked untouchable, and keep the cheapest one ${owner?.manager ?? "they"} would say yes to.` };
    yield yourRoster();
    yield { t: "step", doing: `Pricing {n} packages for ${named.name}`, done: `Priced {n} packages for ${named.name}`, n: 0, chips: owner ? [{ label: owner.name, kind: "team" }] : [] };
    const r = yield* costToGetSteps(YOU, named.id, tags, myTags, prices);
    if (r) yield { t: "step", doing: "Picking the closest offer", done: r.works ? "Picked the cheapest offer that works" : "Nothing clears, so kept the closest", chips: r.trade.give.map((id) => ({ label: playerById(id).name, kind: "player" as const })) };
    if (r && !r.works) {
      const t = r.trade;
      return {
        text: `${named.name} is expensive. The closest you get is ${names(t.give)}, and ${owner.manager} still loses ${fmt(t.themDelta).replace("−", "")} a week.`,
        points: [`Your starters go ${fmt(t.youDelta)} a week.`, `${owner.manager}'s starters go ${fmt(t.themDelta)}. They'd need a reason, like a need you fill.`, "Your untouchables and his tags were left out."],
        links: [{ label: "Open it in builder", tab: "trade", trade: t }],
      };
    }
    const t = r?.trade;
    if (!t) return { text: `Nothing on your roster gets ${named.name} from ${owner.manager} without breaking a tag or your own lineup.`, points: [`${owner.name} would need to gain at least +0.5 a week to say yes.`], links: [{ label: `Open ${owner.name} in builder`, tab: "trade", teamId: owner.id }] };
    return {
      text: `${names(t.give)} gets it done with ${owner.manager}.`,
      points: [`${owner.manager}'s starters gain ${fmt(t.themDelta)} a week.`, `Your starters go ${fmt(t.youDelta)} a week.`, ...(t.youDrop.length ? [`You'd drop ${t.youDrop.map((id) => playerById(id).name).join(", ")} to make room.`] : [])],
      links: [{ label: "Open in builder", tab: "trade", trade: t }],
    };
  }
  if (/(need|thin|weak|hurting|short)/.test(s) && pos) {
    yield { t: "think", text: `You asked who's thin at ${pos}. I'll build every team's best lineup, compare its ${pos} points with the league average, and rank the biggest gaps.` };
    yield { t: "step", doing: "Building {n} best lineups", done: "Built {n} best lineups", n: 0 };
    const needs = yield* allNeedsSteps();
    const ranked = needs.filter((n) => !n.team.you).sort((a, b) => a.groups[pos].pct - b.groups[pos].pct).slice(0, 3);
    yield { t: "step", doing: `Ranking ${others.length} teams at ${pos}`, done: `Ranked ${others.length} teams at ${pos}`, chips: ranked.map((n) => ({ label: n.team.name, kind: "team" as const })) };
    return {
      text: `${ranked[0].team.name} needs a ${pos} most.`,
      points: ranked.map((n) => `${n.team.name}: ${fmt(n.groups[pos].diff)} pts a week vs league average at ${pos}.`),
      links: [{ label: "See the needs map", tab: "league", teamId: ranked[0].team.id }],
    };
  }
  if (/(start|sit|flex|lineup)/.test(s)) {
    yield { t: "think", text: "You asked about your lineup. I'll project everyone on your roster for this week, set the best lineup, and check it against what's set in Sleeper." };
    yield yourRoster();
    const lu = lineupFor(YOU.roster, true);
    const off = lu.bench.filter((p) => isOut(p, true));
    yield { t: "step", doing: `Projecting ${YOU.roster.length} players for week ${WEEK}`, done: `Set the best lineup: ${lu.total.toFixed(1)} projected`, chips: off.map((p) => ({ label: `${p.name} ${p.status === "O" ? "out" : "bye"}`, kind: "player" as const })) };
    const flex = lu.slots.find((x) => x.slot === "FLEX")?.player;
    const diff = sleeperDiff(lu);
    yield { t: "step", doing: "Checking your Sleeper lineup", done: diff.length ? `Found ${diff.length} better ${diff.length === 1 ? "swap" : "swaps"} than Sleeper` : "Your Sleeper lineup is already the best", chips: diff.map((d) => ({ label: d.start.name, kind: "player" as const })) };
    return {
      text: diff.length ? `Swap ${diff[0].start.name} in for ${diff[0].benched.name}. That's ${fmt(diff[0].gain)} pts.` : `Your lineup in Sleeper is already optimal at ${lu.total.toFixed(1)} projected.`,
      points: [`FLEX: ${flex?.name ?? "empty"} at ${flex ? eff(flex, true).toFixed(1) : "0"} projected.`, ...off.map((p) => `${p.name} is ${p.status === "O" ? "out" : "on bye"} this week.`)],
      links: [{ label: "Open your lineup", tab: "roster" }],
    };
  }
  if (/(waiver|pick ?up|add|faab|bid|free agent)/.test(s)) {
    yield { t: "think", text: "You asked about waivers. I'll find your weak spots, drop every free agent into your lineup to see what he adds, and pick the best claim." };
    yield yourRoster();
    yield { t: "step", doing: "Comparing your starting slots with the league average", done: "Found {n} weak spots in your lineup", n: 0 };
    const weak = weakSet(slotGaps());
    let wn = 0;
    for (const w of weak) yield { t: "n", n: ++wn, chip: { label: w, kind: "pos" } };
    yield { t: "step", doing: "Testing {n} free agents in your lineup", done: "Tested {n} free agents in your lineup", n: 0 };
    const recs = yield* waiverRecsSteps(YOU);
    const r = recs.find((x) => x.pick && !passed.includes(x.fa.id));
    yield { t: "step", doing: "Picking the best add", done: r ? "Picked the best add" : "Nobody beats your bench", chips: r ? [{ label: r.fa.name, kind: "player" }] : [] };
    if (!r) return { text: "Nothing on the wire beats your bench this week.", points: [], links: [{ label: "Open waivers", tab: "waivers" }] };
    return {
      text: `${r.fa.name} is your best add.${FAAB.enabled ? ` Sugg. bid ${bidRange(r.bid)}.` : " Put in a claim."}`,
      points: [r.kdef?.fix ? r.kdef.line : r.fit ?? `Adds ${fmt(r.gain)} to your starters this week.`, (() => { const d = recDrop(r); return d ? `Drop ${d.name} (${d.note}).` : "You have an open spot."; })(),
        r.kdef ? (r.estimated ? `Kickers and defenses usually go for ${bidRange(r.bid)}, so bid low.` : `Based on ${SPECIAL_BIDS.length} winning K/DEF bids in your league this season.`)
        : bidSourceNote()],
      links: [{ label: "Open waivers", tab: "waivers" }],
    };
  }
  if (/(trade with|partner|who should i trade|best trade|deal)/.test(s)) {
    yield { t: "think", text: `You asked who to trade with. I'll check what each of the ${others.length} other teams needs, score every one and two player swap with each of them, and keep the deals both sides would take.` };
    yield yourRoster();
    yield { t: "step", doing: "Checking {n} teams' needs", done: "Checked {n} teams' needs", n: 0 };
    const needs = yield* allNeedsSteps();
    yield { t: "step", doing: "Scoring {n} trade combos", done: "Scored {n} trade combos", n: 0 };
    const scored = { n: 0 };
    const found: { n: TeamNeeds; t: Trade }[] = [];
    for (const n of needs.filter((x) => !x.team.you)) {
      const t = (yield* scanTrades(YOU, n.team, activeTags(tags, 4), myTags, prices, 1, scored))[0];
      yield { t: "n", n: scored.n, chip: { label: n.team.name, kind: "team" } };
      if (t) found.push({ n, t });
    }
    const top = found.sort((a, b) => Math.min(b.t.youDelta, b.t.themDelta) - Math.min(a.t.youDelta, a.t.themDelta)).slice(0, 3);
    yield { t: "step", doing: "Picking the best deals", done: !top.length ? "No deal works for both sides" : found.length === 1 ? "Kept the one deal both sides would take" : `Kept the best ${top.length} of ${found.length} deals both sides would take`, chips: top.map((x) => ({ label: x.n.team.name, kind: "team" as const })) };
    if (!top.length) return { text: "No clean win-win trades right now.", points: [], links: [{ label: "See the needs map", tab: "league" }] };
    return {
      text: `${top[0].n.team.name} is your best trade partner this week.`,
      points: top.map((x) => `${x.n.team.name}: your ${names(x.t.give)} for ${names(x.t.get)} (you ${fmt(x.t.youDelta)}, them ${fmt(x.t.themDelta)}).`),
      links: [{ label: "Open the top deal", tab: "trade", trade: top[0].t }],
    };
  }
  const team = said?.item;
  if (team) {
    yield { t: "think", text: `You asked about ${team.name}. I'll compare their lineup with the league average at each spot, look for a spare starter on their bench, and read how ${team.manager} trades.` };
    yield { t: "step", doing: `Reading ${poss(team.name)} lineup`, done: `Read ${poss(team.name)} lineup (${team.roster.length} players)`, chips: [{ label: team.name, kind: "team" }] };
    const n = needsFor(team);
    const td = tendencies(team.id);
    yield { t: "step", doing: `Reading ${poss(team.manager)} trades`, done: `Read ${poss(team.manager)} trades (${td.trades})`, chips: td.buys.map((p) => ({ label: `Buys ${p}`, kind: "pos" as const })) };
    return {
      text: `${team.name} is a ${n.mode.toLowerCase()} that needs a ${n.need}.`,
      points: [`${fmt(n.groups[n.need].diff)} pts a week vs league average at ${n.need}.`, n.surplusPlayer ? `Has a spare ${n.surplus}: ${n.surplusPlayer.name}.` : "No obvious spare starter on the bench.", td.summary],
      links: [{ label: `Build a trade with ${team.manager}`, tab: "trade", teamId: team.id }],
    };
  }
  yield { t: "think", text: "I couldn't match that to a player, team, position or move in your league, so here's what I can answer." };
  return {
    text: "I can answer questions about your league's rosters, needs, trades, lineup and waivers.",
    points: ["Try: \"Who needs a WR most?\"", "\"Who should I trade with?\"", "\"Who should I start at flex?\""],
    links: [],
  };
}

export const allPlayers = () => Object.values(PLAYERS);

// ---- Multi-team deals ------------------------------------------------------
// You at the hub, trading with two or three teams at once. Each partner has its own leg: what you send
// that team and what it sends you. Sleeper proposes the whole thing as one trade that every team accepts.
export interface DealLeg { teamId: string; give: string[]; get: string[] }
export interface LegRead {
  team: Team; give: string[]; get: string[];
  /** The leg on its own as a two-team trade. Its "them" side is exact, since a partner only touches its own leg. */
  trade: Trade; accept: Acceptance;
}
export interface MultiTrade {
  key: string; legs: LegRead[];
  youBefore: number; youAfter: number; youDelta: number; youDrop: string[];
  give: string[]; get: string[];
  /** Plain sums for display; adj* after the consolidation adjustment, which drives marketGap. */
  marketGive: number; marketGet: number; adjGive: number; adjGet: number; marketGap: number;
  /** Chance every partner says yes. */
  allAccept: number;
  warnings: string[];
}

export function evaluateMulti(you: Team, legs: DealLeg[], tags: ManagerTag[], myTags: Record<string, MyTag>, prices: Record<string, Price>): MultiTrade {
  const give = legs.flatMap((l) => l.give), get = legs.flatMap((l) => l.get);
  const youS = settle(you.roster.filter((id) => !give.includes(id)).concat(get), get);
  const youBefore = lineupFor(you.roster).total, youAfter = lineupFor(youS.ids).total;
  const youDelta = round1(youAfter - youBefore);
  const reads: LegRead[] = legs.map((l) => {
    const team = teamById(l.teamId);
    const t = evaluate(you, team, l.give, l.get, tags, myTags, prices);
    // Your side of each leg is the whole deal, not the leg alone
    const trade: Trade = { ...t, youBefore, youAfter, youDelta, youDrop: youS.dropped };
    return { team, give: l.give, get: l.get, trade, accept: acceptance(trade, you, team) };
  });
  const warnings = [...new Set(reads.flatMap((r) => r.trade.warnings))];
  // A price on one of your players is judged against everything coming back, not one leg
  give.forEach((id) => {
    if (myTags[id] !== "amazing" && !prices[id]) return;
    const price = prices[id] ?? DEFAULT_PRICE;
    const w = `${playerById(id).name} only moves if you ${priceLabel(price)}. This deal doesn't get there.`;
    const i = warnings.indexOf(w);
    if (clearsPrice(id, get, youDelta, price)) { if (i >= 0) warnings.splice(i, 1); } else if (i < 0) warnings.push(w);
  });
  const marketGive = sumValue(give), marketGet = sumValue(get);
  const adjGive = packageValue(give), adjGet = packageValue(get);
  const marketGap = Math.max(adjGive, adjGet) > 0 ? (adjGet - adjGive) / Math.max(adjGive, adjGet) : 0;
  return {
    key: legs.map((l) => `${l.teamId}:${l.give.join(",")}>${l.get.join(",")}`).join("|"),
    legs: reads, youBefore, youAfter, youDelta, youDrop: youS.dropped, give, get, marketGive, marketGet, adjGive, adjGet, marketGap,
    allAccept: reads.reduce((p, r) => p * r.accept.p, 1), warnings,
  };
}

/** Plain read of a multi-team deal: does everyone come out ahead, and who's the holdout. */
export function verdictMulti(m: MultiTrade): { label: string; tone: "good" | "warn" | "bad"; line: string } {
  const losers = m.legs.filter((l) => l.trade.themDelta < 0.5).map((l) => l.team.manager);
  const n = m.legs.length + 1;
  const odds = `${Math.round(m.allAccept * 100)}% chance ${m.legs.length === 2 ? "both" : `all ${m.legs.length}`} say yes.`;
  const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  if (m.youDelta >= 0.5 && !losers.length)
    return { label: `All ${n} teams improve`, tone: "good", line: `You ${fmt(m.youDelta)} a week, and every partner's lineup gets better. ${odds}` };
  if (m.youDelta >= 0.5)
    return { label: "Tough sell", tone: "warn", line: `Great for you (${fmt(m.youDelta)}), but ${list(losers)} ${losers.length > 1 ? "don't" : "doesn't"} gain enough to say yes. ${odds}` };
  if (m.youDelta > -0.5)
    return { label: "Barely moves you", tone: "warn", line: `Your lineup goes ${fmt(m.youDelta)} a week. A ${n}-team trade is a lot of work for that.` };
  const gainers = m.legs.filter((l) => l.trade.themDelta >= 0.5).map((l) => l.team.manager);
  if (!gainers.length)
    return { label: "Nobody wins", tone: "bad", line: `Every lineup in this trade gets worse, yours by ${fmt(m.youDelta).slice(1)} a week. Start from what each team needs.` };
  return { label: "You're overpaying", tone: "bad", line: `Your lineup goes ${fmt(m.youDelta)} a week while ${gainers.length === m.legs.length ? "your partners gain" : `${list(gainers)} ${gainers.length > 1 ? "gain" : "gains"}`}. Ask for a little more before you send it.` };
}
