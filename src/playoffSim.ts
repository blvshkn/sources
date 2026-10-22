// Season sims for playoff odds. Standings' "Playoff picture" and the trade finder's before and after odds both run
// this one model: each remaining regular-season week, teams pair at random and score around their projected weekly
// total (sd 22). Seeds go by wins, then points for. The top seeds play a single-elimination bracket over the playoff
// weeks (byes to the top seeds when the field isn't a power of two), scoring around their playoff-week totals.
//
// The random draws are made once per league state and reused (common random numbers), so a trade's before and after
// odds differ only because of the trade, not because of sim noise.

/** Small seeded RNG so the odds don't jump around between renders. */
export function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export interface SimTeam {
  /** Wins so far (ties count half) and points for */
  w: number; pf: number;
  /** Projected starting total a week, rest of season */
  total: number;
  /** Projected starting total a week over the playoff weeks. Falls back to total. */
  playoff?: number;
}
export interface Odds { playoff: number; top: number; champ: number }

interface Draws { n: number; runs: number; weeks: number; rounds: number; pair: Uint8Array; g: Float64Array; pg: Float64Array }
/** Draws for the last few league states: Standings (3,000 runs) and the trade finder (fewer) each keep theirs. */
const drawCache = new Map<string, Draws>();

function draws(n: number, weeks: number, rounds: number, runs: number, seed: number): Draws {
  const key = `${n}|${weeks}|${rounds}|${runs}|${seed}`;
  const hit = drawCache.get(key);
  if (hit) return hit;
  const rand = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
  const pair = new Uint8Array(runs * weeks * n), g = new Float64Array(runs * weeks * n), pg = new Float64Array(runs * rounds * n);
  const order = new Array(n);
  for (let r = 0; r < runs; r++) for (let wk = 0; wk < weeks; wk++) {
    for (let i = 0; i < n; i++) order[i] = i;
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    const o = (r * weeks + wk) * n;
    for (let i = 0; i < n; i++) { pair[o + i] = order[i]; g[o + i] = gauss() * 22; }
  }
  for (let i = 0; i < pg.length; i++) pg[i] = gauss() * 22;
  const d = { n, runs, weeks, rounds, pair, g, pg };
  drawCache.set(key, d);
  if (drawCache.size > 4) drawCache.delete(drawCache.keys().next().value!);
  return d;
}

/** Playoff odds for every team: make the playoffs, finish as the top seed, and win the title. */
export function simulate(teams: SimTeam[], weeksLeft: number, spots: number, runs = 3000, seed?: number): Odds[] {
  const n = teams.length;
  const field = Math.max(1, Math.min(spots, n));
  const rounds = Math.ceil(Math.log2(Math.max(2, field)));
  const s = seed ?? n * 7919 + weeksLeft * 104729 + Math.round(teams.reduce((a, x) => a + x.total, 0));
  const d = draws(n, weeksLeft, rounds, runs, s);
  const playoff = new Float64Array(n), top = new Float64Array(n), champ = new Float64Array(n);
  const wins = new Float64Array(n), pf = new Float64Array(n);
  const tot = Float64Array.from(teams, (t) => t.total), po = Float64Array.from(teams, (t) => t.playoff ?? t.total);
  const w0 = Float64Array.from(teams, (t) => t.w), pf0 = Float64Array.from(teams, (t) => t.pf);
  const seeds = new Int32Array(n);
  const size = 1 << rounds;
  // Bracket slots, -1 for a bye: slot k plays slot m-1-k each round
  const alive = new Int32Array(size);
  for (let r = 0; r < runs; r++) {
    wins.set(w0); pf.set(pf0);
    for (let wk = 0; wk < weeksLeft; wk++) {
      const o = (r * weeksLeft + wk) * n;
      for (let i = 0; i + 1 < n; i += 2) {
        const a = d.pair[o + i], b = d.pair[o + i + 1];
        const sa = tot[a] + d.g[o + a], sb = tot[b] + d.g[o + b];
        pf[a] += sa; pf[b] += sb; wins[sa >= sb ? a : b] += 1;
      }
    }
    // Seeds by wins, then points for (insertion sort: ten or so teams)
    for (let i = 0; i < n; i++) {
      let j = i;
      while (j > 0) { const p = seeds[j - 1]; if (wins[p] > wins[i] || (wins[p] === wins[i] && pf[p] >= pf[i])) break; seeds[j] = p; j--; }
      seeds[j] = i;
    }
    for (let i = 0; i < field; i++) playoff[seeds[i]] += 1;
    top[seeds[0]] += 1;
    for (let k = 0; k < size; k++) alive[k] = k < field ? seeds[k] : -1;
    for (let rd = 0, m = size; rd < rounds; rd++, m >>= 1) {
      const o = (r * rounds + rd) * n;
      for (let k = 0; k < m / 2; k++) {
        const a = alive[k], b = alive[m - 1 - k];
        alive[k] = a < 0 ? b : b < 0 ? a : po[a] + d.pg[o + a] >= po[b] + d.pg[o + b] ? a : b;
      }
    }
    if (alive[0] >= 0) champ[alive[0]] += 1;
  }
  return teams.map((_, i) => ({ playoff: playoff[i] / runs, top: top[i] / runs, champ: champ[i] / runs }));
}

/** Wins from a "W-L" or "W-L-T" record, ties counted as half. */
export const recordWins = (record: string) => { const [w = 0, , t = 0] = record.split("-").map(Number); return (w || 0) + (t || 0) / 2; };
