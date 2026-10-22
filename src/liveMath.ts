// Sleeper's live-scoring math, with no app imports so scripts/check-live.ts can test it on its own.
//
// Sleeper's public API has no live projection or win probability field. Its web app computes both in the
// browser from three feeds: /projections (each player's projection for the week), /stats (points so far)
// and the scores feed (quarter and clock). These functions reproduce that math, so Source shows the same
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

// ---- Team scores and final results ----------------------------------------------------------------------

/** One row of Sleeper's /v1/league/<id>/matchups/<week> response. Rows come sorted by roster_id, not by who
 *  plays whom: the two teams in a matchup share a matchup_id. The demo uses its string team ids as roster_id. */
export interface SleeperMatchupRow {
  roster_id: number | string;
  matchup_id?: number | null;
  starters?: string[] | null;
  starters_points?: number[] | null;
  players?: string[] | null;
  players_points?: Record<string, number> | null;
  points?: number | null;
}

/** A roster's score for the week: Sleeper's `points` when present, else the sum of its starters' points. */
export function rowScore(row: SleeperMatchupRow): number | undefined {
  if (typeof row.points === "number") return row.points;
  if (row.starters_points?.length) return row.starters_points.reduce((a, n) => a + (n || 0), 0);
  const pp = row.players_points, st = row.starters?.filter((id) => id && id !== "0");
  if (pp && st?.length) return st.reduce((a, id) => a + (pp[id] ?? 0), 0);
  return undefined;
}

/** Every player's points and every roster's score from one week of matchups, keyed by String(roster_id), so a
 *  team's score never depends on where its row sits in the response. */
export function fromMatchups(rows: SleeperMatchupRow[]): { points: Record<string, number>; teamPts: Record<string, number> } {
  const points: Record<string, number> = {}, teamPts: Record<string, number> = {};
  for (const row of rows) {
    Object.assign(points, row.players_points ?? {});
    // starters_points covers a starter missing from players_points
    (row.starters ?? []).forEach((id, i) => { const v = row.starters_points?.[i]; if (id && id !== "0" && points[id] === undefined && typeof v === "number") points[id] = v; });
    const s = rowScore(row);
    if (s !== undefined) teamPts[String(row.roster_id)] = s;
  }
  return { points, teamPts };
}

/** A side's header numbers. `sleeper` is Sleeper's team score for that roster (undefined when we don't have one);
 *  `scored` and `expected` are our sums over the same starters. Sleeper's score wins, and the projection moves
 *  with it, so the header, the Wire card and win % all read one number per team. */
export function passScore(sleeper: number | undefined, scored: number, expected: number): { scored: number; proj: number } {
  if (sleeper === undefined || !Number.isFinite(sleeper)) return { scored, proj: expected };
  return { scored: sleeper, proj: expected + (sleeper - scored) };
}

/** Sleeper's /v1/state/nfl, the fields weekPast reads. */
export interface NflState { season: string; week: number; display_week?: number; season_type: string }
/** True once Sleeper has moved on from `week` of `season`: a later season, the regular season over (post or off),
 *  or a later week. Makes a week final even when a game state is missing or stale, so it never shows a live win %. */
export function weekPast(state: NflState | null | undefined, season: string, week: number): boolean {
  if (!state) return false;
  const s = Number(state.season), mine = Number(season);
  if (s !== mine) return s > mine;
  if (state.season_type === "pre") return false;
  if (state.season_type !== "regular") return true;
  return Math.max(state.week, state.display_week ?? 0) > week;
}

/** A matchup is final once no starter on either side is live or still to play, or the week is behind us. */
export const isFinal = (a: PlayCount, b: PlayCount, past = false) =>
  past || (a.live + a.left + b.live + b.left === 0 && a.done + b.done > 0);

const cents = (n: number) => Math.round(n * 100);
/** Who's ahead on a head-to-head score, from your side. Final: the winner leads. Live: whoever has more points right
 *  now leads. Pregame (projections, or 0 to 0): even, so neither side dims. A tie is even. Every matchup score in the
 *  app reads its tones from here and paints them with .sc-lead / .sc-trail (score-tone.css). */
export type ScoreTone = "lead" | "trail" | "even";
export type ScoreState = "pre" | "live" | "final";
export function scoreTone(you: number, them: number | null | undefined, state: ScoreState): ScoreTone {
  if (state === "pre" || them === null || them === undefined) return "even";
  const a = cents(you), b = cents(them);
  return a > b ? "lead" : a < b ? "trail" : "even";
}
/** The other side's tone. */
export const flipTone = (t: ScoreTone): ScoreTone => (t === "lead" ? "trail" : t === "trail" ? "lead" : "even");
/** The class for a score in that tone: trailing dims, leading and even stay full ink. */
export const toneCls = (t: ScoreTone) => (t === "trail" ? "sc-trail" : "sc-lead");

/** Final result as a win percent: 100 if A scored more, 0 if less, 50 on a tie. No clamp. */
export const finalPct = (a: number, b: number) => (cents(a) > cents(b) ? 100 : cents(a) < cents(b) ? 0 : 50);

/** Win percent for A, a whole number. Final: from the scores alone. Otherwise Sleeper's model, 1 to 99. */
export function winPct(aScored: number, aProj: number, bScored: number, bProj: number, final: boolean): number {
  if (final) return finalPct(aScored, bScored);
  return Math.round(Math.min(99, Math.max(1, sleeperWinProb(aScored, aProj, bScored, bProj) * 100)));
}

export interface Result { tone: "up" | "down" | "even"; letter: "W" | "L" | "T"; short: string; long: string }
/** How a final reads, from your side: "Lost by 1.4" and "You lost 137.3 to 138.7". */
export function resultOf(mine: number, theirs: number): Result {
  const pct = finalPct(mine, theirs), d = Math.abs(mine - theirs);
  const by = d.toFixed(1) === "0.0" ? d.toFixed(2) : d.toFixed(1);
  const score = `${mine.toFixed(1)} to ${theirs.toFixed(1)}`;
  if (pct === 100) return { tone: "up", letter: "W", short: `Won by ${by}`, long: `You won ${score}` };
  if (pct === 0) return { tone: "down", letter: "L", short: `Lost by ${by}`, long: `You lost ${score}` };
  return { tone: "even", letter: "T", short: "Tied", long: `You tied ${score}` };
}
