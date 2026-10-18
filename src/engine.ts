// The trade engine. Every number in the UI comes from here, never from copy.
// AI-written lines elsewhere only explain these numbers; they never invent one.
import {
  Player, Pos, Team, ManagerTag, MyTag, TEAMS, PLAYERS, POS_ORDER, playerById, onBye,
  FREE_AGENTS, FAAB_HISTORY, FAAB, FreeAgent, COMPLETED_TRADES, OFFERS_RECEIVED, SLEEPER_SET,
  SLOT_HISTORY, teamById, YOU, LEAGUE, leagueKey, BidTier, SpecialPlayer, demoGame,
} from "./data";

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
const fits = (slot: SlotName, pos: Pos) =>
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
// Live leagues use FantasyCalc values (real fantasy trades, matched to league
// settings). The demo league estimates value from projections on a similar scale.
export const marketValue = (p: Player): number => {
  if (p.value !== undefined) return p.value;
  if (p.status === "O" && p.longTerm) return 0;
  // Real 1QB markets discount quarterbacks heavily (there are plenty to start); Superflex prices them up.
  const posFactor = p.pos === "QB" ? (FORMAT.superflex ? 1.05 : 0.42) : p.pos === "TE" ? 0.9 : 1;
  return Math.round(9 * Math.pow(Math.max(0, p.proj), 2.2) * posFactor);
};
/**
 * Consolidation adjustment: the best player in a package counts in full, each
 * extra piece counts for less, so three bench players can't add up to one star.
 */
// 85% on the second piece reproduces RotoTrade's package adjustment exactly on a tested 2-for-1.
const PIECE_WEIGHTS = [1, 0.85, 0.72, 0.61];
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
  mode: "Contender" | "Seller" | "Middle";
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
  const mode = score >= 2 ? "Contender" : score <= -2 ? "Seller" : "Middle";
  return { team, lineup, groups, need, surplus, surplusPlayer, mode, rank: 0 };
}

export function allNeeds(): TeamNeeds[] {
  const list = TEAMS.map((t) => needsFor(t));
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
  /** Market value of each side's package after the consolidation adjustment. */
  marketGive: number;
  marketGet: number;
  /** (get - give) / larger side. Positive = you receive more market value. */
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
    if (myTags[id] === "amazing") {
      const price = prices[id] ?? DEFAULT_PRICE;
      if (!clearsPrice(id, get, youDelta, price))
        warnings.push(`${playerById(id).name} only moves if you ${priceLabel(price)}. This deal doesn't get there.`);
    }
  });
  const marketGive = packageValue(give);
  const marketGet = packageValue(get);
  const marketGap = Math.max(marketGive, marketGet) > 0 ? (marketGet - marketGive) / Math.max(marketGive, marketGet) : 0;
  const wants = theirTags.filter((t) => t.kind === "wants");
  const fillsWant = give.some((id) => wants.some((w) => (w.playerId ? w.playerId === id : w.pos === playerById(id).pos)));
  return {
    key: `${them.id}:${give.join(",")}>${get.join(",")}`,
    partnerId: them.id,
    give, get, youBefore, youAfter, themBefore, themAfter, youDelta, themDelta,
    youDrop: youS.dropped, themDrop: themS.dropped, marketGive, marketGet, marketGap, fillsWant, warnings,
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
  if (t.themDelta < 1) theirs(`${them.manager}'s lineup barely moves (${fmt(t.themDelta)}/wk)`);
  if (t.youDelta < 1) blockers.push(`your lineup barely moves (${fmt(t.youDelta)}/wk)`);
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
  if (worstDrop < -4) theirs(`it opens a big hole in ${them.manager}'s lineup`);

  // Likelihood. The value term matches RotoTrade's observed acceptance curve: 45% at even value,
  // plus one point for every point of value (on a 0-100 scale) the other side gains. On top of
  // that, things RotoTrade can't see: league need, stated wants, lineup gain and trade history.
  const theirGainPts = (t.marketGive - t.marketGet) / 100;
  let p = 0.45 + Math.max(-40, Math.min(45, theirGainPts)) / 100;
  p += Math.min(0.1, Math.max(0, (t.themDelta - 1) * 0.03));
  const need = needsFor(them).need;
  if (t.give.some((id) => playerById(id).pos === need)) { p += 0.08; reasons.push(`fills their ${need} need`); }
  if (t.fillsWant) { p += 0.08; reasons.push("they said they want this position"); }
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
  const results: Trade[] = [];
  for (const give of combos(you.roster, 2)) {
    for (const get of combos(them.roster, 2)) {
      if (give.length + get.length > 3) continue;
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
  const owner = TEAMS.find((t) => t.roster.includes(playerId));
  if (!owner || owner.you) return null;
  let best: Trade | null = null;
  let closest: Trade | null = null;
  for (const give of combos(you.roster, 2)) {
    const t = evaluate(you, owner, give, [playerId], tags, myTags, prices);
    if (t.warnings.length) continue;
    if (t.themDelta >= 1 && !acceptance(t, you, owner).theirBlockers.length && (!best || t.youDelta > best.youDelta)) best = t;
    if (t.youDelta >= 0 && (!closest || t.themDelta > closest.themDelta)) closest = t;
  }
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
    return { label: "Tough sell", tone: "warn", line: `Great for you (${fmt(t.youDelta)}), but ${them}'s lineup drops ${fmt(t.themDelta)}. ${market}. Expect a no unless you add something.` };
  if (t.themDelta >= 0.5)
    return { label: "You're overpaying", tone: "bad", line: `${them} gains ${fmt(t.themDelta)} while you go ${fmt(t.youDelta)}. ${market}. Ask for more or walk.` };
  return { label: "Lateral", tone: "warn", line: `Neither lineup moves much (you ${fmt(t.youDelta)}, ${them} ${fmt(t.themDelta)}). ${market}.` };
}

/** Plain-English read on an offer someone sent you. */
export function offerRead(t: Trade): { label: string; tone: "good" | "warn" | "bad"; line: string } {
  if (t.youDelta >= 0.5 && t.marketGap >= -FAIR_GAP) return { label: "Take it", tone: "good", line: `This one helps you. Your starters gain ${fmt(t.youDelta)} a week and the market value is ${t.marketGap >= 0 ? "in your favor" : "close to even"}.` };
  if (t.youDelta >= 0.5) return { label: "Helps now, costs value", tone: "warn", line: `Your starters gain ${fmt(t.youDelta)} a week, but you give up ${pct(t.marketGap).slice(1)} more market value.` };
  if (t.youDelta > -1) return { label: "Close", tone: "warn", line: `It's close to even (${fmt(t.youDelta)} a week). A small add makes it fair.` };
  return { label: "Light", tone: "bad", line: `This one's light. Your starters lose ${fmt(t.youDelta).replace("−", "")} a week.` };
}

// ---- Lineup day -----------------------------------------------------------

export function sleeperDiff(opt: Lineup): { benched: Player; start: Player; slot: string; gain: number }[] {
  const setIds = Object.values(SLEEPER_SET).flat();
  const optIds = opt.slots.map((s) => s.player?.id).filter(Boolean) as string[];
  const shouldStart = optIds.filter((id) => !setIds.includes(id)).map(playerById);
  const shouldSit = setIds.filter((id) => !optIds.includes(id)).map(playerById);
  return shouldStart.map((p, i) => {
    const sit = shouldSit[i];
    const slot = Object.entries(SLEEPER_SET).find(([, ids]) => ids.includes(sit?.id ?? ""))?.[0] ?? "FLEX";
    return { benched: sit, start: p, slot, gain: round1(eff(p, true) - (sit ? eff(sit, true) : 0)) };
  }).filter((d) => d.benched);
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
      out.push({ id: p.id, tag: "untouchable", why: `${gap.toFixed(1)} pts a week better than anyone behind him. Hard to replace.` });
  });
  lineup.bench.forEach((p) => {
    if (myTags[p.id]) return;
    if (eff(p) >= avg.FLEX * 0.75) out.push({ id: p.id, tag: "available", why: `Bench player who'd start on a team that's thin at ${p.pos}.` });
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

export interface WaiverRec { fa: FreeAgent; value: number; gain: number; drop: Player | null; bid: [number, number]; tier: BidTier["tier"]; estimated: boolean }

export function waiverRecs(you: Team): WaiverRec[] {
  const base = lineupFor(you.roster, true);
  return FREE_AGENTS.map((fa) => {
    // Live free agents are already in PLAYERS; demo ones get a temporary entry.
    const existed = !!PLAYERS[fa.id];
    if (!existed) { const g = demoGame(fa.nfl); PLAYERS[fa.id] = { id: fa.id, name: fa.name, pos: fa.pos, nfl: fa.nfl, proj: fa.proj, opp: g ? `${g.home ? "vs" : "@"} ${g.opp}` : undefined, gameDate: g?.date }; }
    const p = PLAYERS[fa.id];
    const withFa = lineupFor([...you.roster, fa.id], true);
    const gain = round1(withFa.total - base.total);
    // Drop by rest-of-season value, never by a one-week bye
    const drop = you.roster.map(playerById).filter((x) => !withFa.slots.some((sl) => sl.player?.id === x.id)).sort((a, b) => eff(a) - eff(b))[0] ?? null;
    const value = eff(p);
    const tier: BidTier["tier"] = gain >= 2 || value >= 12 ? "Starter" : value >= 9.5 ? "Flex" : fa.rookie ? "Stash" : "Depth";
    const { bids, estimated } = bidsFor(tier);
    const sorted = bids.slice().sort((a, b) => a - b);
    const q = (x: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(x * (sorted.length - 1))))];
    if (!existed) delete PLAYERS[fa.id];
    return { fa, value, gain, drop, bid: [q(0.25), q(0.85)] as [number, number], tier, estimated };
  }).sort((a, b) => b.gain - a.gain || b.value - a.value);
}
export const bidDollars = (pct: number) => Math.round((pct / 100) * FAAB.budget);

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
    else parts.push("Tough to close. Make the first offer clearly fair.");
  }
  return { teamId, trades: done.length, offers, closeRate, buys, rookieShare, summary: parts.join(" ") };
}

// ---- Tags from what people say -------------------------------------------

const POS_WORDS: [RegExp, Pos][] = [
  [/\b(qb|quarterback)s?\b/i, "QB"], [/\b(rb|running ?back)s?\b/i, "RB"],
  [/\b(wr|receiver|wide ?out)s?\b/i, "WR"], [/\b(te|tight ?end)s?\b/i, "TE"],
];

export interface ParsedTag { tag: Omit<ManagerTag, "id"> | null; reason?: string }

export function parseTag(text: string): ParsedTag {
  const s = text.trim();
  if (!s) return { tag: null, reason: "Type what they said." };
  const team = TEAMS.filter((t) => !t.you).find((t) => new RegExp(`\\b${t.manager}\\b`, "i").test(s) || s.toLowerCase().includes(t.name.toLowerCase()));
  if (!team) return { tag: null, reason: `Couldn't tell who said it. Start with their name, like "${TEAMS.find((t) => !t.you)?.manager ?? "Mike"} said…".` };
  const lower = s.toLowerCase();
  let kind: ManagerTag["kind"] | null = null;
  if (/(not interested|doesn'?t want|does not want|pass(ed)? on|no thanks|don'?t want)/.test(lower)) kind = "notInterested";
  else if (/(won'?t (move|trade|give|deal)|not (moving|trading|selling)|refuses?|untouchable|keeping|off the table)/.test(lower)) kind = "refuses";
  else if (/(wants?|looking for|needs?|shopping|interested in|after|would take|open to)/.test(lower)) kind = "wants";
  if (!kind) return { tag: null, reason: "Couldn't tell if they want, refuse, or passed. Try words like \"wants\", \"won't move\", or \"not interested\"." };
  // Player: refuses → their roster, notInterested → your roster, wants → either
  const pool = kind === "refuses" ? team.roster : kind === "notInterested" ? YOU.roster : [...YOU.roster, ...team.roster];
  const player = pool.map(playerById).find((p) => {
    const last = p.name.split(" ").slice(-1)[0].replace(/(III|II|Jr\.)$/, "");
    return new RegExp(`\\b${p.name}\\b`, "i").test(s) || (last.length > 3 && new RegExp(`\\b${last}\\b`, "i").test(s));
  });
  const pos = POS_WORDS.find(([re]) => re.test(s))?.[1];
  if (!player && !pos) return { tag: null, reason: "Name a player or a position so Sources knows what it applies to." };
  const subject = player ? player.name : `their ${pos}`;
  const label = kind === "wants" ? (player ? `Wants ${player.name}` : `Looking for ${pos} help`) : kind === "refuses" ? `Won't move ${player ? player.name : `his ${pos}`}` : `Not interested in ${subject.replace("their", "your")}`;
  return { tag: { teamId: team.id, kind, playerId: player?.id, pos: player ? undefined : pos, text: label, weeksOld: 0 } };
}

// ---- Ask your league ------------------------------------------------------

export interface Answer { text: string; points: string[]; links: { label: string; tab: string; teamId?: string; trade?: Trade }[] }

export function ask(q: string, tags: ManagerTag[], myTags: Record<string, MyTag>, prices: Record<string, Price>): Answer {
  const s = q.toLowerCase();
  const needs = allNeeds();
  const pos = POS_WORDS.find(([re]) => re.test(q))?.[1];
  const named = Object.values(PLAYERS).find((p) => {
    const last = p.name.split(" ").slice(-1)[0];
    return s.includes(p.name.toLowerCase()) || (last.length > 3 && new RegExp(`\\b${last.toLowerCase()}\\b`).test(s));
  });

  if (/(what would it take|cost|get|trade for|acquire)/.test(s) && named && !YOU.roster.includes(named.id)) {
    const r = costToGet(YOU, named.id, tags, myTags, prices);
    const owner = TEAMS.find((x) => x.roster.includes(named.id))!;
    if (r && !r.works) {
      const t = r.trade;
      return {
        text: `${named.name} is expensive. The closest you get is ${t.give.map((id) => playerById(id).name).join(" + ")}, and ${owner.manager} still loses ${fmt(t.themDelta).replace("−", "")} a week.`,
        points: [`Your starters go ${fmt(t.youDelta)} a week.`, `${owner.manager}'s starters go ${fmt(t.themDelta)}. They'd need a reason, like a need you fill.`, "Your untouchables and his tags were left out."],
        links: [{ label: "Open it in builder", tab: "trade", trade: t }],
      };
    }
    const t = r?.trade;
    if (!t) return { text: `Nothing on your roster gets ${named.name} from ${owner.manager} without breaking a tag or your own lineup.`, points: [`${owner.name} would need to gain at least +0.5 a week to say yes.`], links: [{ label: `Open ${owner.name} in builder`, tab: "trade", teamId: owner.id }] };
    return {
      text: `${t.give.map((id) => playerById(id).name).join(" + ")} gets it done with ${owner.manager}.`,
      points: [`${owner.manager}'s starters gain ${fmt(t.themDelta)} a week.`, `Your starters go ${fmt(t.youDelta)} a week.`, ...(t.youDrop.length ? [`You'd drop ${t.youDrop.map((id) => playerById(id).name).join(", ")} to make room.`] : [])],
      links: [{ label: "Open in builder", tab: "trade", trade: t }],
    };
  }
  if (/(need|thin|weak|hurting|short)/.test(s) && pos) {
    const ranked = needs.filter((n) => !n.team.you).sort((a, b) => a.groups[pos].pct - b.groups[pos].pct).slice(0, 3);
    return {
      text: `${ranked[0].team.name} needs a ${pos} most.`,
      points: ranked.map((n) => `${n.team.name}: ${fmt(n.groups[pos].diff)} pts a week vs league average at ${pos}.`),
      links: [{ label: "See the needs map", tab: "league", teamId: ranked[0].team.id }],
    };
  }
  if (/(start|sit|flex|lineup)/.test(s)) {
    const lu = lineupFor(YOU.roster, true);
    const flex = lu.slots.find((x) => x.slot === "FLEX")?.player;
    const diff = sleeperDiff(lu);
    return {
      text: diff.length ? `Swap ${diff[0].start.name} in for ${diff[0].benched.name}. That's ${fmt(diff[0].gain)} pts.` : `Your lineup in Sleeper is already optimal at ${lu.total.toFixed(1)} projected.`,
      points: [`FLEX: ${flex?.name ?? "empty"} at ${flex ? eff(flex, true).toFixed(1) : "0"} projected.`, ...lu.bench.filter((p) => isOut(p, true)).map((p) => `${p.name} is ${p.status === "O" ? "out" : "on bye"} this week.`)],
      links: [{ label: "Open your lineup", tab: "roster" }],
    };
  }
  if (/(waiver|pick ?up|add|faab|bid|free agent)/.test(s)) {
    const r = waiverRecs(YOU)[0];
    return {
      text: `${r.fa.name} is your best add.${FAAB.enabled ? ` Bid ${r.bid[0]} to ${r.bid[1]} percent.` : " Put in a claim."}`,
      points: [`Adds ${fmt(r.gain)} to your starters this week.`, r.drop ? `Drop ${r.drop.name} (${eff(r.drop).toFixed(1)} projected).` : "You have an open spot.", r.estimated ? "Your league doesn't have enough winning bids yet, so this range is a typical one." : `Based on ${bidsFor(r.tier).bids.length} winning ${r.tier.toLowerCase()} bids in your league this season.`],
      links: [{ label: "Open waivers", tab: "waivers" }],
    };
  }
  if (/(trade with|partner|who should i trade|best trade|deal)/.test(s)) {
    const top = needs.filter((n) => !n.team.you).map((n) => ({ n, t: findTrades(YOU, n.team, activeTags(tags, 4), myTags, prices, 1)[0] })).filter((x) => x.t)
      .sort((a, b) => Math.min(b.t.youDelta, b.t.themDelta) - Math.min(a.t.youDelta, a.t.themDelta)).slice(0, 3);
    if (!top.length) return { text: "No clean win-win trades right now.", points: [], links: [{ label: "See the needs map", tab: "league" }] };
    return {
      text: `${top[0].n.team.name} is your best trade partner this week.`,
      points: top.map((x) => `${x.n.team.name}: your ${x.t.give.map((id) => playerById(id).name).join(" + ")} for ${x.t.get.map((id) => playerById(id).name).join(" + ")} (you ${fmt(x.t.youDelta)}, them ${fmt(x.t.themDelta)}).`),
      links: [{ label: "Open the top deal", tab: "trade", trade: top[0].t }],
    };
  }
  const team = TEAMS.find((t) => !t.you && (new RegExp(`\\b${t.manager.toLowerCase()}\\b`).test(s) || s.includes(t.name.toLowerCase())));
  if (team) {
    const n = needs.find((x) => x.team.id === team.id)!;
    const td = tendencies(team.id);
    return {
      text: `${team.name} is a ${n.mode.toLowerCase()} that needs a ${n.need}.`,
      points: [`${fmt(n.groups[n.need].diff)} pts a week vs league average at ${n.need}.`, n.surplusPlayer ? `Has a spare ${n.surplus}: ${n.surplusPlayer.name}.` : "No obvious spare starter on the bench.", td.summary],
      links: [{ label: `Build a trade with ${team.manager}`, tab: "trade", teamId: team.id }],
    };
  }
  return {
    text: "I can answer questions about your league's rosters, needs, trades, lineup and waivers.",
    points: ["Try: \"Who needs a WR most?\"", "\"Who should I trade with?\"", "\"Who should I start at flex?\""],
    links: [],
  };
}

export const allPlayers = () => Object.values(PLAYERS);
