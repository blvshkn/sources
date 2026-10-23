// Lineup locks from game state, the one rule every piece of lineup advice follows: Sleeper locks a player at his game's
// kickoff, so a suggested move is only real when BOTH the player going out and the player coming in are still before
// kickoff. Once the week is final nothing moves. Byes have no kickoff, so they stay movable until the week is over.
// Kept free of app imports so the regression check (scripts/check-gamestate.ts) can read it directly.

export type GameNow = "pre_game" | "in_game" | "complete";
/** This week's game states by NFL team, and whether Sleeper's NFL state has moved past the week. */
export interface WeekGames { games: Record<string, GameNow>; past?: boolean }

/** What plain words say when the best move is blocked and no other move is left. */
export const LOCKED_LINE = "Lineups are locked for games that have started.";

/** The week is over: Sleeper says so, or every game on the schedule is final. */
export const weekFinal = (w: WeekGames): boolean => {
  if (w.past) return true;
  const s = Object.values(w.games);
  return s.length > 0 && s.every((x) => x === "complete");
};

/** A team's lock this week: "final" once its game is over (or the week is), "live" while it's on, null before kickoff. */
export const teamLock = (w: WeekGames, nfl: string | undefined): "live" | "final" | null => {
  if (weekFinal(w)) return "final";
  const st = nfl ? w.games[nfl] : undefined;
  return st === "complete" ? "final" : st === "in_game" ? "live" : null;
};

/** Can this move be made in Sleeper right now? Both sides must still be before kickoff. */
export const canMove = (w: WeekGames, outNfl: string | undefined, inNfl: string | undefined) =>
  !weekFinal(w) && !teamLock(w, outNfl) && !teamLock(w, inNfl);
