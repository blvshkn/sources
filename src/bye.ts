// Bye weeks come from the NFL schedule and nothing else: a team that's on the season schedule but has no game this
// week. A missing or zero projection is not a bye, and neither is an injury. A player with a game and no projection
// is read by his injury status (Questionable, Out) or as "no projection yet". Kept free of app imports so the
// regression check (scripts/check-bye.ts) can run it directly.
import type { Player } from "./data";

/** Teams on bye in `week`. Empty when the schedule has no games for that week (not loaded, or not posted yet). */
export function byeTeamsFrom(schedule: { week: number; home: string; away: string }[], week: number): string[] {
  const all = new Set<string>(), playing = new Set<string>();
  for (const g of schedule) {
    all.add(g.home); all.add(g.away);
    if (g.week === week) { playing.add(g.home); playing.add(g.away); }
  }
  if (!playing.size) return [];
  return Array.from(all).filter((t) => !playing.has(t)).sort();
}

type Who = Pick<Player, "status" | "longTerm" | "wk" | "injury">;

/** Scores nothing: Out (this week, or long term for rest-of-season math), or on bye this week. Never from projections. */
export const sitsOut = (p: Who, bye: boolean, thisWeek: boolean) =>
  (p.status === "O" && (!!p.longTerm || thisWeek)) || (thisWeek && bye);

/** Why a player might not help this week, in order of certainty. */
export type WeekAvail = "bye" | "out" | "injured" | "no-proj" | "ok";
export function weekAvail(p: Who, bye: boolean): WeekAvail {
  if (bye) return "bye";
  if (p.status === "O") return "out";
  if (p.status === "Q") return "injured";
  if (p.wk === null) return "no-proj";
  return "ok";
}

/** Sleeper's designation in words: Questionable, Doubtful, Out. */
export const injuryWord = (p: Who) =>
  p.injury && p.injury !== "IR" && p.injury !== "PUP" && p.injury !== "Sus" ? p.injury : p.status === "Q" ? "Questionable" : "Out";

/** The Before lock card for a starter Sleeper has in a slot the engine would fill with someone else. */
export function lineupCard(benched: Who & { name: string }, start: { name: string }, slot: string, bye: boolean): { headline: string; emph: string } {
  switch (weekAvail(benched, bye)) {
    case "bye": return { headline: `${benched.name} is in your ${slot} in Sleeper`, emph: "and he's on bye." };
    case "out": return { headline: `${benched.name} is in your ${slot} in Sleeper`, emph: "and he's out." };
    case "injured": return { headline: `${benched.name} is ${injuryWord(benched)} and in your ${slot}.`, emph: "Have a backup ready." };
    case "no-proj": return { headline: `${benched.name} is in your ${slot} in Sleeper`, emph: "and has no projection yet." };
    default: return { headline: `${benched.name} is in your ${slot} in Sleeper`, emph: `but ${start.name} projects higher.` };
  }
}
