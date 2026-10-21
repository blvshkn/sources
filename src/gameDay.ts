// Game day checks: what still needs a look before lock (hurt starters, a coin flip at flex, an empty K or DEF, a thin
// bench), and the K/DEF swap hint on the Lineup rows. Every one follows the lock rule in locks.ts: a player whose game
// has kicked off can't move, so nothing here suggests moving him, and a final week gets no lineup checks at all.
// Each check carries the kickoff it's racing (that player's own, not the week's first). The inbox shows these.
import { YOU, onBye, weekGames, type Player, type SpecialPlayer } from "./data";
import { eff, irReport, isOut, lockedNow, sleeperSlots, specialPts, startedSpecials, type Lineup } from "./engine";
import { moveLock, lockWhen } from "./kickoff";
import { weekFinal } from "./locks";
import type { IconName } from "./components/icons";

/** "Questionable, Groin" becomes "Groin". */
const LONG_WORD: Record<string, string> = { IR: "Injured reserve", PUP: "PUP list", Sus: "Suspended", NA: "Not active", DNR: "Did not report", COV: "COVID list" };
export const injuryDetail = (p: Player) => (p.note ?? "").replace(/^(Questionable|Doubtful|Out|IR|PUP|Sus|NA|DNR|COV)\b,?\s*/i, "") || LONG_WORD[p.injury ?? ""] || (p.status === "O" ? "Out" : "Game-time decision");

export interface Check {
  key: string; tone: "warn" | "bad" | "info"; icon: IconName; text: string; player?: Player;
  /** When the move it asks for locks: the earliest kickoff among the players in it ("Sun 4:05 PM"). */
  lockAt?: string;
}

/** What needs a look before lock: IR moves, hurt starters, a coin flip at flex, an empty or thin bench, an empty K or
 *  DEF. Only players still before kickoff, and nothing about the lineup once the week is final. */
export function gameDayChecks(lineup: Lineup, w = weekGames()): Check[] {
  const ir = irReport(YOU);
  const irChecks: Check[] = [
    ...ir.mustActivate.map((p) => ({ key: `ira-${p.id}`, tone: "bad" as const, icon: "alert" as IconName, text: `Activate ${p.name} from IR. Sleeper blocks adds and trades until he's moved.`, player: p })),
    ...(ir.open > 0 && ir.moveIn[0] ? [{ key: "irm", tone: "info" as const, icon: "plug" as IconName, text: `Move ${ir.moveIn[0].name} to IR. It frees a bench spot without a drop.` }] : []),
  ];
  if (weekFinal(w)) return irChecks;
  const locked = lockedNow(w);
  const open = (p: { id: string } | null | undefined) => !!p && !locked(p.id);
  const s = lineup.slots.filter((x) => x.player) as { slot: string; player: Player }[];
  const flex = s.find((x) => x.slot === "FLEX");
  // The coin flip only counts when both could still trade places in Sleeper
  const bestBench = lineup.bench.filter((p) => p.pos !== "QB" && !isOut(p, true) && open(p))[0];
  const closeCall = flex && open(flex.player) && bestBench && eff(flex.player, true) - eff(bestBench, true) < 1.5;
  const benchOut = lineup.bench.filter((p) => isOut(p, true));
  // A thin bench matters only while a Sleeper starter can still be replaced
  const anyOpen = sleeperSlots().some((x) => x.id && open({ id: x.id }));
  // A K/DEF slot Sleeper has empty, even with one rostered (the suggested pick is the one to start, if he still can)
  const emptySpecial = startedSpecials(YOU).filter((x) => (!x.player || x.suggested) && (!x.player || open(x.player)));
  return [
    ...irChecks,
    ...s.filter((x) => x.player.status && open(x.player)).map((x) => ({ key: `inj-${x.player.id}`, tone: (x.player.status === "O" ? "bad" : "warn") as "bad" | "warn", icon: "alert" as IconName, player: x.player,
      lockAt: lockWhen(x.player) || undefined,
      text: x.player.status === "O" ? `${x.player.name} is out (${injuryDetail(x.player)}). Swap him before lock.` : `${x.player.name} is questionable (${injuryDetail(x.player)}). Check the inactives 90 minutes before kickoff.` })),
    ...emptySpecial.map((x) => ({ key: `empty-${x.slot}`, tone: "bad" as const, icon: "helmet" as IconName, ...(x.player ? { lockAt: lockWhen(x.player) || undefined } : {}),
      text: x.player ? `Your ${x.slot} slot is empty in Sleeper. Start ${x.player.name} before lock.` : `Your ${x.slot} slot is empty. Pick up a ${x.slot === "K" ? "kicker" : "defense"} in Sleeper before lock.` })),
    ...(closeCall ? [{ key: "flex", tone: "info" as const, icon: "trade" as IconName, lockAt: moveLock(flex.player, bestBench) || undefined,
      text: `Close call at flex: ${flex.player.name} ${eff(flex.player, true).toFixed(1)} vs ${bestBench.name} ${eff(bestBench, true).toFixed(1)}. Basically a coin flip.` }] : []),
    ...(benchOut.length && anyOpen ? [{ key: "bench", tone: "info" as const, icon: "roster" as IconName,
      text: `Thin bench this week. ${benchOut.map((p) => `${p.name} (${onBye(p.nfl) ? "bye" : "out"})`).join(" and ")} can't cover a starter.` }] : []),
  ];
}

/** The K/DEF to start in place of `p` on his Lineup row: the best one at that slot when he isn't shown already, adds
 *  half a point or more, and both are still before kickoff. */
export function kdefHint(p: SpecialPlayer, best: SpecialPlayer | null | undefined, shown: (SpecialPlayer | null)[], w = weekGames()): SpecialPlayer | undefined {
  if (!best || best.id === p.id || shown.some((x) => x?.id === best.id) || specialPts(best) - specialPts(p) < 0.5) return undefined;
  const locked = lockedNow(w);
  return locked(p.id) || locked(best.id) ? undefined : best;
}
