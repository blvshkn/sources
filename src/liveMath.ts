// Sleeper's live-scoring math, with no app imports so scripts/check-live.ts can test it on its own.
//
// Sleeper's public API has no live projection or win probability field. Its web app computes both in the
// browser from three feeds: /projections (each player's projection for the week), /stats (points so far)
// and the scores feed (quarter and clock). These functions reproduce that math, so Sources shows the same
// projected totals and win % as the Sleeper matchup page. Checked against three live readings of week 6, 2026.

export type GameState = "pre_game" | "in_game" | "complete";

/** Where Sleeper projects a live player to finish.
 *  pts: points so far. proj: his projection for the week. left: share of his game still to play (0 to 1).
 *  Sleeper extrapolates his scoring rate so far over the time left (damped by the share left), then
 *  slides from his projection (or his points, if he's already past it) toward that pace as the game runs. */
export function sleeperLiveProj(pts: number, proj: number, left: number): number {
  const l = Math.max(0, Math.min(1, left));
  if (l >= 1) return proj; // not started: the projection
  if (l <= 0 && pts < 0) return pts;
  const minLeft = 60 * l, minPlayed = 60 - minLeft || 1;
  const pace = Math.max(pts + (pts / minPlayed) * minLeft * l, pts);
  const base = Math.max(proj, pts);
  return base + (1 - l) * (pace - base);
}

/** Sleeper's win chance for team A, 0 to 1, from each team's points so far and projected finish.
 *  Each side's outcome is normal around its projected finish, with a variance that shrinks as points come in:
 *  (projected - scored)^2 / (1 + 10 * (1 - scored / projected)). Clamped to 1% to 99% until both are final. */
export function sleeperWinProb(aScored: number, aProj: number, bScored: number, bProj: number): number {
  const r2 = (n: number) => Number(n.toFixed(2));
  if (r2(aScored) === r2(aProj) && r2(bScored) === r2(bProj)) {
    return r2(aScored) > r2(bScored) ? 1 : r2(aScored) < r2(bScored) ? 0 : 0.5;
  }
  const variance = (scored: number, proj: number) => {
    const n = proj > 0 ? 1 + 10 * (1 - scored / proj) : 1;
    return (scored - proj) ** 2 / (n > 0 ? n : 1) || 0.1;
  };
  const sd = Math.sqrt(variance(aScored, aProj) + variance(bScored, bProj));
  return Math.max(0.01, Math.min(0.99, normCdf((aProj - bProj) / sd)));
}

/** Standard normal CDF (Abramowitz and Stegun 26.2.17, error under 1e-7). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
  const tail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - tail : tail;
}

export interface PlayCount { done: number; live: number; left: number }
/** How many starters are finished, playing right now, and yet to kick off, by their NFL teams. Byes count as done. */
export function countPlays(games: Record<string, GameState>, isBye: (nfl: string) => boolean, nfls: (string | null | undefined)[]): PlayCount {
  const c = { done: 0, live: 0, left: 0 };
  for (const t of nfls) {
    if (!t) continue;
    const st = games[t];
    if (st === "complete" || (!st && isBye(t))) c.done++; else if (st === "in_game") c.live++; else c.left++;
  }
  return c;
}

/** The short label for a side's starters still going, worded like Sleeper's "Yet to play": players in a live
 *  game count as live, not as left to play. */
export function playLabel(c: PlayCount): string {
  if (c.left && c.live) return `${c.left} to play, ${c.live} live`;
  if (c.live) return `${c.live} live`;
  return `${c.left} to play`;
}
