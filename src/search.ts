/**
 * One player matcher for every search in the app (add-player picker, player search, Waivers).
 *
 * - Case, accents, punctuation and suffixes don't matter: "jamarr" finds Ja'Marr Chase, "walker" finds Kenneth Walker III.
 * - Initials: "jc" or "j c" finds Jalen Coker and James Cook. Three-part names work too: "as", "asb", "ars" find Amon-Ra St. Brown.
 * - Word starts: "j co" finds Jalen Coker, "ja coo" finds James Cook. "cook j" works too, at a slightly lower rank.
 * - Last name alone: "cok" or "coker".
 * - A token that is exactly the player's position or NFL team narrows: "rb buf" shows Bills running backs.
 *
 * Returns null for no match, or a score (higher is better) and the ranges of the original name to highlight.
 * Ties are left to the caller's own sort (Value, Proj and so on).
 */

export type Match = { score: number; marks: [number, number][] };

/** Rank tiers, best first. */
export const TIER = { exact: 60, prefix: 50, initials: 40, words: 30, wordsAnyOrder: 25, inner: 20, substring: 10, filter: 5 } as const;

const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
const DROP = /['‘’.`]/;

type Word = { s: string; at: number[] };
type Prep = { compact: string; cmap: number[]; words: Word[] };

const cache = new Map<string, Prep>();

/** Lowercase letters and digits only, with each kept character's index in the original string. */
function fold(name: string): { chars: string[]; at: number[] } {
  const chars: string[] = [], at: number[] = [];
  for (let i = 0; i < name.length; i++) {
    const c = name[i];
    if (DROP.test(c)) continue;
    const base = c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (/^[a-z0-9]+$/.test(base)) { for (const b of base) { chars.push(b); at.push(i); } }
    else { chars.push(" "); at.push(i); }
  }
  return { chars, at };
}

function prep(name: string): Prep {
  const hit = cache.get(name);
  if (hit) return hit;
  const { chars, at } = fold(name);
  const words: Word[] = [];
  let cur: Word | null = null;
  chars.forEach((c, k) => {
    if (c === " ") { cur = null; return; }
    if (!cur) { cur = { s: "", at: [] }; words.push(cur); }
    cur.s += c; cur.at.push(at[k]);
  });
  // Jr., III and friends never need typing, and never block an initials match
  while (words.length > 1 && SUFFIX.has(words[words.length - 1].s)) words.pop();
  const compact = words.map((w) => w.s).join("");
  const cmap = words.flatMap((w) => w.at);
  const p = { compact, cmap, words };
  if (cache.size > 4000) cache.clear();
  cache.set(name, p);
  return p;
}

/** Query to tokens: "Ja'Marr  C." -> ["jamarr", "c"]. */
export function tokens(q: string): string[] {
  return fold(q).chars.join("").split(" ").filter(Boolean);
}

const range = (at: number[], from: number, len: number): [number, number] => [at[from], at[from + len - 1] + 1];

/** First letters of words, in order, starting with the first word ("asb" = Amon St Brown, "ars" = Amon Ra St). */
function initials(q: string, words: Word[]): number[] | null {
  if (q.length < 2 || q.length > words.length || !/^[a-z]+$/.test(q) || words[0].s[0] !== q[0]) return null;
  const used = [0];
  let w = 1;
  for (let k = 1; k < q.length; k++) {
    while (w < words.length && words[w].s[0] !== q[k]) w++;
    if (w >= words.length) return null;
    used.push(w++);
  }
  return used;
}

/** Each token starts a different word. In order if possible; otherwise any order. Returns the word for each token. */
function wordStarts(toks: string[], words: Word[], ordered: boolean): number[] | null {
  const out: number[] = [];
  const taken = new Set<number>();
  const go = (t: number, from: number): boolean => {
    if (t === toks.length) return true;
    for (let w = ordered ? from : 0; w < words.length; w++) {
      if (taken.has(w) || !words[w].s.startsWith(toks[t])) continue;
      taken.add(w); out[t] = w;
      if (go(t + 1, w + 1)) return true;
      taken.delete(w);
    }
    return false;
  };
  return go(0, 0) ? out : null;
}

function matchName(toks: string[], p: Prep): Match | null {
  const { words, compact, cmap } = p;
  if (!words.length) return null;
  const q = toks.join("");
  const last = words.length - 1;
  if (q === compact) return { score: TIER.exact, marks: [range(cmap, 0, compact.length)] };
  // "j c" types the same thing as "jc"
  const allSingles = toks.length > 1 && toks.every((t) => t.length === 1);
  if (toks.length === 1 || allSingles) {
    const t = toks.length === 1 ? toks[0] : q;
    if (toks.length === 1) {
      if (words[0].s.startsWith(t)) return { score: TIER.prefix + 1, marks: [range(words[0].at, 0, t.length)] };
      if (words[last].s.startsWith(t)) return { score: TIER.prefix, marks: [range(words[last].at, 0, t.length)] };
      // "jalenco": the full name typed without the space
      if (t.length > words[0].s.length && compact.startsWith(t)) return { score: TIER.prefix, marks: [range(cmap, 0, t.length)] };
    }
    const ini = initials(t, words);
    if (ini) return { score: TIER.initials, marks: ini.map((w) => range(words[w].at, 0, 1)) };
    if (toks.length === 1) {
      const inner = words.findIndex((w) => w.s.startsWith(t));
      if (inner >= 0) return { score: TIER.inner, marks: [range(words[inner].at, 0, t.length)] };
    }
  }
  if (toks.length > 1) {
    const inOrder = wordStarts(toks, words, true);
    const any = inOrder ?? wordStarts(toks, words, false);
    if (any) return { score: inOrder ? TIER.words : TIER.wordsAnyOrder, marks: any.map((w, t) => range(words[w].at, 0, toks[t].length)) };
  }
  const i = compact.indexOf(q);
  if (i >= 0) return { score: TIER.substring, marks: [range(cmap, i, q.length)] };
  return null;
}

/**
 * Does `query` find this player? `extra` carries the position and NFL team so "rb", "buf" or "rb buf" can narrow.
 * An empty query matches everyone with score 0.
 */
export function matchPlayer(query: string, name: string, extra?: { pos?: string; team?: string }): Match | null {
  const toks = tokens(query);
  if (!toks.length) return { score: 0, marks: [] };
  const p = prep(name);
  const named = matchName(toks, p);
  if (named || !extra) return named;
  // Tokens that are exactly this player's position or team narrow instead of naming
  const pos = extra.pos?.toLowerCase(), team = extra.team?.toLowerCase();
  const rest = toks.filter((t) => t !== pos && t !== team);
  if (rest.length === toks.length) return null;
  if (!rest.length) return { score: TIER.filter, marks: [] };
  const m = matchName(rest, p);
  return m && { score: m.score, marks: m.marks };
}

/** Filter and rank: best match first, then the caller's order (pass the list already sorted by Value, Proj...). */
export function rankPlayers<T>(query: string, items: T[], get: (x: T) => { name: string; pos?: string; team?: string }): { item: T; match: Match }[] {
  const out: { item: T; match: Match; i: number }[] = [];
  items.forEach((item, i) => {
    const g = get(item);
    const match = matchPlayer(query, g.name, { pos: g.pos, team: g.team });
    if (match) out.push({ item, match, i });
  });
  return out.sort((a, b) => b.match.score - a.match.score || a.i - b.i).map(({ item, match }) => ({ item, match }));
}

/** Split a name into plain and highlighted pieces for rendering. */
export function pieces(name: string, marks: [number, number][]): { text: string; on: boolean }[] {
  if (!marks.length) return [{ text: name, on: false }];
  const on = new Array(name.length).fill(false);
  for (const [a, b] of marks) for (let i = a; i < b; i++) on[i] = true;
  const out: { text: string; on: boolean }[] = [];
  for (let i = 0; i < name.length; i++) {
    const prev = out[out.length - 1];
    if (prev && prev.on === on[i]) prev.text += name[i];
    else out.push({ text: name[i], on: on[i] });
  }
  return out;
}
