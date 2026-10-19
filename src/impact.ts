// "What it means for you": a short read on a news story, written by Sources from this league's data,
// never from the article. Status, your lineup, the matchup and the market. Returns null when there's
// nothing specific to say, so the card shows no block instead of filler.
import { LEAGUE, OPPONENT_ID, Player, TEAMS, Team, WEEK, YOU, onBye, playerById } from "./data";
import { SlotName, eff, fits, lineupFor, round1 } from "./engine";
import { seasonFor } from "./schedule";
import type { NewsItem } from "./news";

const SLOT: Record<SlotName, string> = { QB: "QB", RB: "RB", WR: "WR", TE: "TE", FLEX: "flex", SF: "superflex" };
const n1 = (n: number) => n.toFixed(1);
/** "at RB", "in your flex" */
const atSlot = (s?: SlotName) => !s ? "in your lineup" : s === "FLEX" || s === "SF" ? `in your ${SLOT[s]}` : `at ${s}`;
const last = (p: Player) => p.name.replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, "").split(" ").slice(-1)[0];

export type Role = "starter" | "bench" | "ir" | "taxi" | "opp" | "rival" | "fa";
export interface PlayerContext {
  role: Role;
  team?: Team;
  slot?: SlotName;
  /** Your best fill-in at his slot if he can't play. */
  fill?: Player;
  /** The weakest starter he could replace (bench and free agents). */
  weakest?: { p: Player; slot: SlotName };
  proj: number;
  bye: boolean;
  byeNext: boolean;
  matchup?: { tone: "good" | "tough"; opp: string };
  trend?: number;
}

const allOf = (t: Team) => [...t.roster, ...(t.ir ?? []), ...(t.taxi ?? [])];

/** Where this player sits relative to you, plus the numbers the copy draws on. */
export function contextFor(p: Player): PlayerContext {
  const team = TEAMS.find((t) => allOf(t).includes(p.id));
  const mine = !!team?.you || team?.id === YOU?.id;
  // Rest-of-season lineup decides his role, so a player ruled out this week still reads as your starter
  const lu = lineupFor(YOU.roster);
  const at = lu.slots.find((s) => s.player?.id === p.id);
  const setStarter = YOU.starters ? YOU.starters.includes(p.id) : !!at;
  const role: Role = !team ? "fa"
    : !mine ? (team.id === OPPONENT_ID ? "opp" : "rival")
    : (YOU.ir ?? []).includes(p.id) ? "ir" : (YOU.taxi ?? []).includes(p.id) ? "taxi"
    : setStarter || at ? "starter" : "bench";
  const slot = at?.slot ?? (role === "starter" ? (["FLEX", p.pos] as SlotName[]).find((s) => lu.slots.some((x) => x.slot === s)) : undefined);
  const fill = slot ? lu.bench.filter((b) => b.id !== p.id && fits(slot, b.pos) && eff(b, true) > 0).sort((a, b) => eff(b, true) - eff(a, true))[0] : undefined;
  const weakest = role === "starter" ? undefined : lu.slots
    .filter((s): s is { slot: SlotName; player: Player } => !!s.player && s.player.id !== p.id && fits(s.slot, p.pos))
    .sort((a, b) => eff(a.player, true) - eff(b.player, true))
    .map((s) => ({ p: s.player, slot: s.slot }))[0];
  const cells = seasonFor(p);
  const now = cells.find((c) => c.week === WEEK), next = cells.find((c) => c.week === WEEK + 1);
  const opp = now?.opp ? now.opp.replace(/^v/, "vs ").replace(/^@/, "at ") : "";
  const tone = now?.tone === "good" || now?.tone === "tough" ? now.tone : undefined;
  const row = LEAGUE.board?.find((b) => b.id === p.id);
  return {
    role, team, slot, fill, weakest, proj: eff(p, true), bye: onBye(p.nfl),
    byeNext: !!next && !next.opp && WEEK + 1 <= (LEAGUE.lastWeek ?? 17),
    matchup: tone && opp ? { tone, opp } : undefined,
    trend: row && row.value > 0 && Math.abs(row.trend) >= row.value * 0.06 ? row.trend : undefined,
  };
}

const matchupBit = (c: PlayerContext) => c.matchup ? `, with a ${c.matchup.tone} matchup ${c.matchup.opp}` : "";
const trendBit = (c: PlayerContext) => c.trend === undefined ? "" : `His trade value is ${c.trend > 0 ? "up" : "down"} ${Math.abs(Math.round(c.trend)).toLocaleString()} over 30 days.`;
const statusWord = (p: Player) => p.injury === "IR" ? "on IR" : p.status === "O" ? (p.longTerm ? "out long term" : "out this week") : p.status === "Q" ? "questionable" : "";

/** One or two plain sentences for this story, or null. */
export function impactFor(p: Player, n: NewsItem, c: PlayerContext = contextFor(p)): string | null {
  const kind = n.kind ?? "feature";
  if (kind === "feature") return null;
  const status = statusWord(p);
  const where = atSlot(c.slot);
  const s: string[] = [];

  if (c.role === "starter") {
    if (c.bye) s.push(`He's on bye this week, so ${c.fill ? `${c.fill.name} (${n1(eff(c.fill, true))}) is your best fill-in ${where}` : `you need a fill-in ${where}`}.`);
    else if (status && (kind === "status" || kind === "move" || p.status === "O")) {
      const fill = c.fill ? `${c.fill.name} (${n1(eff(c.fill, true))} projected)` : null;
      s.push(p.status === "O"
        ? `He's ${status} and starts ${where}. ${fill ? `${fill} is your best option there.` : "Nobody on your bench fits that slot, so check waivers."}`
        : `He's questionable and starts ${where}. ${fill ? `If he can't go, ${fill} is your best option there.` : "If he can't go, nobody on your bench fits that slot, so check waivers now."}`);
    } else if (kind === "status") s.push(`No injury designation yet, so he stays your starter ${where}: ${n1(c.proj)} projected${matchupBit(c)}.`);
    else s.push(`He starts ${where} and projects ${n1(c.proj)} this week${matchupBit(c)}.`);
    if (c.byeNext && !c.bye) s.push(`Bye next week, so line up a fill-in now.`);
    else if (s.length < 2 && (kind === "role" || kind === "move")) { const t = trendBit(c); if (t) s.push(t); }
  } else if (c.role === "bench") {
    if (p.status === "O" && kind === "status") s.push(`He's ${status}, but he's on your bench, so your lineup doesn't change.`);
    else if (c.weakest && !c.bye && c.proj > 0) {
      const gap = round1(c.proj - eff(c.weakest.p, true));
      if (gap >= 0.5) s.push(`He projects ${n1(c.proj)}, ${n1(gap)} more than ${c.weakest.p.name} ${atSlot(c.weakest.slot)}. Worth a look before lock.`);
      else if (kind === "role" || kind === "recap") s.push(`He projects ${n1(c.proj)} this week, still behind ${last(c.weakest.p)} (${n1(eff(c.weakest.p, true))}) ${atSlot(c.weakest.slot)}.`);
    }
    if (kind === "role" || kind === "move") { const t = trendBit(c); if (t) s.push(t); }
  } else if (c.role === "ir") {
    if (kind === "status" && !p.status) s.push(`He's healthy again but still in your IR slot. Move him to your bench before lock.`);
    else if (kind === "status" && p.status) s.push(`He stays in your IR slot for now. Once ${p.nfl} activates him he'll need a bench spot, so know who you'd drop.`);
    else if (kind === "status" && p.irEligible === false) s.push(`He's no longer IR eligible, so he'll need a bench spot.`);
  } else if (c.role === "opp") {
    const mgr = c.team!.manager;
    if (status) s.push(`${mgr}, your opponent this week, has him and he's ${status}. ${p.status === "O" ? `That's ${n1(eff(p))} a week off their side.` : "Watch his status before lock."}`);
    else if (c.proj > 0) s.push(`He's on ${mgr}'s roster, your opponent this week, and projects ${n1(c.proj)}${matchupBit(c)}.`);
  } else if (c.role === "rival") {
    const mgr = c.team!.manager;
    if (p.status === "O" && (kind === "status" || p.longTerm)) s.push(`${mgr} loses him ${p.longTerm ? "for a while" : "this week"}. A thin ${p.pos} room can make them a trade partner.`);
    const t = trendBit(c);
    if (t && (kind === "role" || kind === "move" || kind === "recap")) s.push(`${mgr} has him. ${t}`);
  } else if (c.role === "fa") {
    if (c.weakest && c.proj > 0 && !c.bye && !status) {
      const gap = round1(c.proj - eff(c.weakest.p, true));
      s.push(gap >= 0.5 ? `He's a free agent in your league and projects ${n1(c.proj)}, ${n1(gap)} more than ${c.weakest.p.name} ${atSlot(c.weakest.slot)}.`
        : kind === "role" || kind === "move" ? `He's a free agent in your league. ${n1(c.proj)} projected this week, short of your starter ${atSlot(c.weakest.slot)} for now.` : "");
    }
  }
  // Two sentences at most: a second point only rides along when the first was a single sentence
  const parts = s.filter(Boolean);
  const out = (parts.length > 1 && /\.\s+\S/.test(parts[0]) ? [parts[0]] : parts.slice(0, 2)).join(" ");
  return out || null;
}

/** For Wire ordering: how much a player's news matters to you right now. */
export function playerWeight(p: Player, c: PlayerContext): number {
  return (c.role === "starter" ? 30 : c.role === "bench" ? 10 : c.role === "ir" ? 0 : -10) + (p.status ? 25 : 0);
}

/** Your players, starters first in slot order, then bench, IR and taxi. */
export function yourPlayers(): Player[] {
  const lu = lineupFor(YOU.roster);
  const starters = YOU.starters?.length ? YOU.starters.filter((id) => YOU.roster.includes(id)).map(playerById) : lu.slots.map((s) => s.player).filter((x): x is Player => !!x);
  const seen = new Set(starters.map((p) => p.id));
  const bench = lu.bench.filter((p) => !seen.has(p.id));
  return [...starters, ...bench, ...[...(YOU.ir ?? []), ...(YOU.taxi ?? [])].map(playerById)].filter((p): p is Player => !!p && !!p.name);
}

/** Short role label for a player row: "Starter · RB", "Bench", "IR". */
export function roleLabel(c: PlayerContext): string {
  return c.role === "starter" ? `Starter${c.slot ? ` · ${c.slot === "SF" ? "SF" : c.slot}` : ""}` : c.role === "bench" ? "Bench" : c.role === "ir" ? "IR" : c.role === "taxi" ? "Taxi" : "";
}
