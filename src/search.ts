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

// ---- Teams ----------------------------------------------------------------

/**
 * Team lists (Trading with, Add a team, Who said it): a query finds a team by its name or its manager.
 * Same rules as players: "jmw" or "jalen my" finds "Jalen My Way", "sk4" finds Sk4zi.
 * `on` says which field matched, so the caller highlights the right line.
 */
export function matchTeam(query: string, team: { name: string; manager: string }): (Match & { on: "name" | "manager" }) | null {
  const toks = tokens(query);
  if (!toks.length) return { score: 0, marks: [], on: "name" };
  const a = matchName(toks, prep(team.name)), b = matchName(toks, prep(team.manager));
  if (!a && !b) return null;
  return a && (!b || a.score >= b.score) ? { ...a, on: "name" } : { ...b!, on: "manager" };
}

/** Filter and rank teams, best match first, then the caller's order. */
export function rankTeams<T>(query: string, items: T[], get: (x: T) => { name: string; manager: string }) {
  const out: { item: T; match: Match & { on: "name" | "manager" }; i: number }[] = [];
  items.forEach((item, i) => { const match = matchTeam(query, get(item)); if (match) out.push({ item, match, i }); });
  return out.sort((a, b) => b.match.score - a.match.score || a.i - b.i).map(({ item, match }) => ({ item, match }));
}

// ---- Names inside a sentence ----------------------------------------------
// "Sk4zi won't move cook", "I don't want st brown", "who has jamarr": find the players and managers a sentence mentions,
// with the same folding as the pickers (case, accents, punctuation, Jr./III don't matter).

/** A mention: what was found, how sure (higher is better), and which sentence words it used ([from, to)). */
export type Mention<T> = { item: T; score: number; span: [number, number] };

/** Words that are also surnames. Alone, they only count when capitalized ("Love", not "I'd love"). */
const COMMON = new Set(["strange", "marks", "golden", "reed", "hunter", "love", "will", "young", "white", "hill", "bell", "ford", "price", "hunt", "rice", "worthy", "hall", "gray", "best", "king", "page", "case", "mark", "sweat", "long", "strong", "bowers", "knight", "wright", "hope", "may", "rich", "free", "early", "street"]);
const PARTICLE = new Set(["st", "de", "la", "le", "van", "von", "del", "da", "di", "mc", "san"]);
const STOP = new Set(["the", "a", "an", "of", "and", "my", "your", "his", "her", "our", "in", "on", "to", "for", "from", "is", "it", "i", "am", "me", "we", "you", "team", "squad", "club", "fc", "picks", "pick", "made", "state", "wants", "want", "more", "trade", "says", "said", "league", "fantasy"]);

type TWord = { s: string; cap: boolean };
/** A sentence's words, folded, and whether each was typed with a capital letter. */
function sentence(text: string): TWord[] {
  const { chars, at } = fold(text);
  const out: TWord[] = [];
  let cur: TWord | null = null;
  chars.forEach((c, k) => {
    if (c === " ") { cur = null; return; }
    if (!cur) { const o = text[at[k]]; cur = { s: "", cap: o !== o.toLowerCase() }; out.push(cur); }
    cur.s += c;
  });
  return out;
}

const free = (skip: [number, number][] | undefined, i: number, j: number) => !skip?.some(([a, b]) => i < b && j >= a);
const sorted = <T,>(found: (Mention<T> & { i: number })[]) => found.sort((a, b) => b.score - a.score || a.i - b.i).map(({ item, score, span }) => ({ item, score, span }));

/**
 * Players a sentence mentions, best first. Pass the pool in order of preference (the relevant roster first):
 * when two players share a last name ("cook"), the earlier one wins the tie.
 * - full name: "amon-ra st. brown", "aj brown", "jamarr chase"
 * - first name start plus last name: "ken walker"
 * - last name alone: "jefferson", "st brown", "cook's"
 * - a first name no one else in the pool has: "jamarr", "puka"
 * `skip` holds word ranges already used (the manager's name), so "Josh" the manager isn't Josh Allen.
 * `names` are full names of every player (nameWords), so "jordan love" never reads as some other Jordan in the pool.
 */
export function playersInText<T>(text: string, items: T[], getName: (x: T) => string, opts: { skip?: [number, number][]; names?: Set<string> } = {}): Mention<T>[] {
  const { skip, names } = opts;
  const words = sentence(text);
  if (!words.length) return [];
  const preps = items.map((x) => prep(getName(x)));
  const firsts = new Map<string, number>();
  preps.forEach((p) => { const f = p.words[0]?.s; if (f) firsts.set(f, (firsts.get(f) ?? 0) + 1); });
  // Someone's full name starts at word i: a first name there belongs to him, not to whoever else shares it
  const nameAt = words.map((_, i) => {
    if (!names) return false;
    let s = words[i].s;
    for (let k = i + 1; k < Math.min(words.length, i + 4); k++) { s += words[k].s; if (names.has(s)) return true; }
    return false;
  });
  const found: (Mention<T> & { i: number })[] = [];
  items.forEach((item, idx) => {
    const p = preps[idx], w = p.words.map((x) => x.s);
    if (!w.length) return;
    const last = w.length - 1;
    const surnames = [w[last]];
    if (w.length >= 3 && PARTICLE.has(w[last - 1])) surnames.unshift(w[last - 1] + w[last]);
    let best: Mention<T> | null = null;
    const take = (score: number, i: number, j: number) => { if (!best || score > best.score) best = { item, score, span: [i, j + 1] }; };
    for (let i = 0; i < words.length; i++) {
      let s = "";
      for (let j = i; j < Math.min(words.length, i + 6); j++) {
        if (!free(skip, i, j)) break;
        s += words[j].s;
        const len = (j - i + 1) / 10;
        // A trailing s reads as possessive ("cook's"), a hair below a player whose name really ends in s (Cooks)
        if (s === p.compact) take(3 + len, i, j);
        else if (j > i && s === p.compact + "s") take(2.95 + len, i, j);
        const sur = surnames.find((x) => s === x || s === x + "s");
        if (sur && (j > i || !COMMON.has(sur) || words[i].cap)) take((s === sur ? 2 : 1.95) + len, i, j);
        // "ken walker", "j cook": the start of his first name, then his last name ("a" and "the" never count)
        if (j > i && !STOP.has(words[i].s) && w[0].startsWith(words[i].s)) {
          const rest = s.slice(words[i].s.length);
          if (surnames.some((x) => rest === x || rest === x + "s")) take(2.5 + len, i, j);
        }
      }
      // "jamarr": a first name that only one player in the pool has
      const f = words[i].s;
      if (free(skip, i, i) && !nameAt[i] && w.length > 1 && f.length >= 4 && (f === w[0] || f === w[0] + "s") && firsts.get(w[0]) === 1 && (!COMMON.has(w[0]) || words[i].cap)) take(1, i, i);
    }
    if (best) found.push({ ...(best as Mention<T>), i: idx });
  });
  return sorted(found);
}

/**
 * Teams a sentence mentions, best first: the manager's name ("sk4zi", "Mike's"), the full team name,
 * two or more words of it in a row ("jalen my way"), or one word of it no other team uses ("griddy").
 * `avoid.words` are words of player names, so a team called "Bijan Mustard" isn't found by "bijan".
 * `avoid.names` are full player names, so "Mike Evans" is the player, not the manager Mike.
 */
export function teamsInText<T>(text: string, items: T[], get: (x: T) => { name: string; manager: string }, avoid?: { words?: Set<string>; names?: Set<string> }): Mention<T>[] {
  const words = sentence(text);
  if (!words.length) return [];
  const named = items.map((x) => { const g = get(x); return { mgr: prep(g.manager), team: prep(g.name) }; });
  const uses = new Map<string, number>();
  named.forEach(({ team }) => new Set(team.words.map((x) => x.s)).forEach((s) => uses.set(s, (uses.get(s) ?? 0) + 1)));
  // Does a player's full name start at word i and run past word j?
  const inName = (i: number, j: number) => {
    if (!avoid?.names) return false;
    let s = words.slice(i, j + 1).map((x) => x.s).join("");
    for (let k = j + 1; k < Math.min(words.length, j + 4); k++) { s += words[k].s; if (avoid.names.has(s)) return true; }
    return false;
  };
  const found: (Mention<T> & { i: number })[] = [];
  items.forEach((item, idx) => {
    const { mgr, team } = named[idx];
    const tw = team.words.map((x) => x.s);
    let best: Mention<T> | null = null;
    const take = (score: number, i: number, j: number) => { if (!best || score > best.score) best = { item, score, span: [i, j + 1] }; };
    for (let i = 0; i < words.length; i++) {
      let s = "";
      for (let j = i; j < Math.min(words.length, i + 8); j++) {
        s += words[j].s;
        const len = (j - i + 1) / 10;
        if (mgr.compact && (s === mgr.compact || s === mgr.compact + "s") && !inName(i, j)) take(3 + len, i, j);
        if (team.compact && s === team.compact) take(3 + len, i, j);
      }
      // A run of the team's words, in its order, with at least one real word in it
      for (let k = 0; k < tw.length; k++) {
        let n = 0;
        while (i + n < words.length && k + n < tw.length && words[i + n].s === tw[k + n]) n++;
        if (n >= 2 && tw.slice(k, k + n).some((x) => x.length >= 3 && !STOP.has(x))) take(2 + n / 10, i, i + n - 1);
      }
      const x = words[i].s;
      if (x.length >= 5 && !STOP.has(x) && !avoid?.words?.has(x) && uses.get(x) === 1 && tw.includes(x)) take(1, i, i);
    }
    if (best) found.push({ ...(best as Mention<T>), i: idx });
  });
  return found.sort((a, b) => b.score - a.score || a.span[0] - b.span[0] || a.i - b.i).map(({ item, score, span }) => ({ item, score, span }));
}

/** Every word of these names and each whole name, folded, for teamsInText's `avoid`. */
export function nameWords(names: string[]): { words: Set<string>; names: Set<string> } {
  const words = new Set<string>(), full = new Set<string>();
  names.forEach((n) => { const p = prep(n); p.words.forEach((w) => words.add(w.s)); if (p.words.length > 1) full.add(p.compact); });
  return { words, names: full };
}
