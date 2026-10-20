// The what-if lineup: swaps tried inside Sources, shared by the Lineup page and the full matchup (page and sheet), so
// a swap made in one shows in the other. Nothing here writes to Sleeper. This week keeps skill slots and K/DEF slots
// apart (the way the matchup always has); weeks ahead keep one id per starter slot in Sleeper's lineup order.
// A tiny module store read through useSyncExternalStore; it resets when the league changes.
import { useSyncExternalStore } from "react";
import { LEAGUE, OPPONENT_ID, SLEEPER_SET, SpecialPlayer, Team, YOU, playerById, teamById } from "./data";
import { eff, fits, lineupFor, round1, SlotName, startedSpecials, StartedSpecial } from "./engine";
import { Live, MatchScore, matchNow, scoreMatch, sideScore } from "./live";
import { order, peekWeek, slotFits, WeekPlayer } from "./weeks";
import { useWeekMatch, withMine } from "./weekMatch";

export type SkillSlot = { slot: SlotName; id: string | null };

/** Fill the league's slots in order from a list of starters, so both lineups line up slot for slot. */
export function slotted(team: Team, starters: string[] | undefined): SkillSlot[] {
  const base = lineupFor(team.roster, true);
  if (!starters?.length) return base.slots.map((s) => ({ slot: s.slot, id: s.player?.id ?? null }));
  const pool = starters.filter((id) => team.roster.includes(id));
  const used = new Set<string>();
  return base.slots.map((s) => {
    const id = pool.find((x) => !used.has(x) && fits(s.slot, playerById(x).pos)) ?? null;
    if (id) used.add(id);
    return { slot: s.slot, id };
  });
}

// ---- Store ------------------------------------------------------------------
let leagueId = "";
let now: { mine: SkillSlot[]; mineK: (SpecialPlayer | null)[] } | null = null;
const ahead = new Map<number, (string | null)[]>();
let ver = 0;
const subs = new Set<() => void>();
const emit = () => { ver++; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const sync = () => { if (leagueId !== LEAGUE.id) { leagueId = LEAGUE.id; now = null; ahead.clear(); } };
const useVer = () => useSyncExternalStore(subscribe, () => ver);

/** Your Sleeper lineup this week: skill slots in league order, and the K/DEF Sleeper starts (suggested when empty). */
let baseKey = "", baseVal: { mine: SkillSlot[]; k: StartedSpecial[] } | null = null;
export function sleeperNow() {
  const set = Object.values(SLEEPER_SET).flat();
  const key = [LEAGUE.id, YOU.roster.join(), (YOU.starters ?? []).join(), set.join(), (YOU.special ?? []).join(), (LEAGUE.sleeperSpecial ?? []).join()].join("|");
  if (key !== baseKey || !baseVal) {
    baseKey = key;
    baseVal = { mine: slotted(YOU, YOU.starters?.length ? YOU.starters : set.length ? set : undefined), k: startedSpecials(YOU) };
  }
  return baseVal;
}

/** This week's shown lineup and how to change it. `changed` is true when it differs from Sleeper's. */
export function useNowLineup() {
  useVer();
  sync();
  const base = sleeperNow();
  const baseK = base.k.map((x) => x.player);
  const mine = now?.mine ?? base.mine, mineK = now?.mineK ?? baseK;
  const changed = mine.some((s, i) => s.id !== base.mine[i]?.id) || mineK.some((p, i) => p?.id !== baseK[i]?.id);
  const put = (m: SkillSlot[], k: (SpecialPlayer | null)[]) => { now = { mine: m, mineK: k }; emit(); };
  return {
    base, baseK, mine, mineK, changed,
    setMine: (next: SkillSlot[] | ((cur: SkillSlot[]) => SkillSlot[])) => put(typeof next === "function" ? next(now?.mine ?? base.mine) : next, now?.mineK ?? baseK),
    setMineK: (next: (SpecialPlayer | null)[] | ((cur: (SpecialPlayer | null)[]) => (SpecialPlayer | null)[])) => put(now?.mine ?? base.mine, typeof next === "function" ? next(now?.mineK ?? baseK) : next),
    reset: () => { now = null; emit(); },
  };
}

/** Put a bench player (or another starter) into a skill slot. The starter he replaces takes his old slot when he fits
 *  it, else that slot goes empty. The matchup's swap, shared. */
export function swapInto(cur: SkillSlot[], slotIdx: number, id: string): SkillSlot[] {
  const next = cur.map((s) => ({ ...s }));
  const other = next.findIndex((s) => s.id === id);
  const prev = next[slotIdx].id;
  next[slotIdx].id = id;
  if (other >= 0 && other !== slotIdx) next[other].id = prev && fits(next[other].slot, playerById(prev).pos) ? prev : null;
  return next;
}

/** Fixed slots fill first, then FLEX, then Superflex, so flex gets the best leftover (the same order as lineupFor). */
const rank = (slot: string) => (slot === "SF" || slot === "SUPER_FLEX" ? 2 : slot === "FLEX" || /FLEX/.test(slot) ? 1 : 0);

/**
 * The best skill lineup you can still set: a locked starter keeps his slot, a locked bench player stays on the bench,
 * and every other slot takes the best unlocked player who fits. K/DEF are left out, so callers compare skill players
 * to skill players. Used by Lineup's "Use optimal lineup" and the matchup's "Use best lineup", so they never disagree.
 */
export function bestUnderLocks(mine: SkillSlot[], locked: (id: string) => boolean): SkillSlot[] {
  const next = mine.map((s) => ({ slot: s.slot, id: s.id && locked(s.id) ? s.id : null }));
  const kept = new Set(next.map((s) => s.id).filter(Boolean));
  const pool = YOU.roster.filter((id) => !kept.has(id) && !locked(id)).map(playerById).sort((a, b) => eff(b, true) - eff(a, true));
  const used = new Set<string>();
  next.map((s, i) => ({ s, i })).filter((x) => !x.s.id).sort((a, b) => rank(a.s.slot) - rank(b.s.slot)).forEach(({ s }) => {
    const p = pool.find((q) => !used.has(q.id) && fits(s.slot, q.pos));
    if (p) { used.add(p.id); s.id = p.id; }
  });
  return next;
}
/** That best lineup and what it adds over the shown one, skill players only on both sides. */
export function bestNow(live: Live, mine: SkillSlot[], locked: (id: string) => boolean) {
  const slots = bestUnderLocks(mine, locked);
  const skill = (xs: SkillSlot[]) => sideScore(live, YOU, xs.map((x) => x.id), [], false).proj;
  const same = slots.every((s, i) => s.id === mine[i]?.id);
  return { slots, gain: same ? 0 : round1(skill(slots) - skill(mine)) };
}

/** This week's score with the shown lineup: Sleeper's own numbers until you change it, then your what-if added up
 *  against the same opponent side the Wire card and the strip use. */
export function nowScore(live: Live, mine: SkillSlot[], mineK: (SpecialPlayer | null)[], changed: boolean): MatchScore {
  const base = matchNow(live);
  if (!changed) return base;
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  return scoreMatch(sideScore(live, YOU, mine.map((s) => s.id), mineK, false), opp ? base.opp : null, live.past);
}

// ---- Weeks ahead --------------------------------------------------------------
type AheadSlot = { slot: string; p: WeekPlayer | null; suggested?: boolean };

/** A week ahead with your what-if applied over `base` (that view's own projected starters). `pool` is everyone you
 *  can start that week, starters and bench. */
export function useAheadLineup(week: number, base: AheadSlot[] | null, pool: WeekPlayer[]) {
  useVer();
  sync();
  const ids = ahead.get(week);
  const byId = new Map(pool.map((p) => [p.id, p]));
  const starters: AheadSlot[] = !base ? [] : !ids ? base : base.map((x, i) => {
    const id = ids[i] ?? null;
    if (id === (x.p?.id ?? null)) return x;
    return { slot: x.slot, p: id ? byId.get(id) ?? null : null };
  });
  const inLineup = new Set(starters.map((x) => x.p?.id).filter(Boolean));
  const bench = pool.filter((p) => !inLineup.has(p.id)).sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1));
  const changed = !!base && starters.some((x, i) => (x.p?.id ?? null) !== (base[i]?.p?.id ?? null));
  const raw = order();
  return {
    starters, bench, changed,
    /** Can this player play starter slot i? Sleeper's slot names, so FLEX kinds and superflex read right. */
    fitsAt: (i: number, pos: string) => slotFits(raw[i] ?? starters[i]?.slot ?? "", pos),
    swap: (slotIdx: number, id: string) => {
      const cur = starters.map((x) => x.p?.id ?? null);
      const other = cur.indexOf(id), prev = cur[slotIdx];
      cur[slotIdx] = id;
      if (other >= 0 && other !== slotIdx) cur[other] = prev && slotFits(raw[other] ?? "", byId.get(prev)?.pos ?? "") ? prev : null;
      ahead.set(week, cur);
      emit();
    },
    reset: () => { ahead.delete(week); emit(); },
  };
}

/** A week other than this one with the what-if applied: the matchup as loaded (`raw`), with your starters swapped in
 *  (`m`, total and win chance recomputed), and the what-if controls. Past weeks pass through untouched. */
export function useWeekWhatIf(week: number) {
  const { m: raw, err } = useWeekMatch(week);
  const future = raw?.kind === "future";
  const pool = future && raw ? [...raw.me.starters.map((x) => x.p).filter((p): p is WeekPlayer => !!p), ...(peekWeek(week)?.bench ?? [])] : [];
  const wi = useAheadLineup(week, future && raw ? raw.me.starters : null, pool);
  const m = raw && future ? withMine(raw, wi.starters) : raw;
  return { m, raw, err, wi };
}
