// Waivers watchlist sync: the merge rules, shared by the server (api/watch.js) and the app (src/watchSync.ts) so every
// device settles on the same list. Plain JS so the serverless function can import it without a build step; types in
// watchMerge.d.ts.
//
// A set maps a player id to { week, at, removed? }: the week he's watched for, when that last changed, and removed
// when he was un-watched (a tombstone, so the union of two devices doesn't bring him back). Rules:
//   - per id the newer `at` wins; on an exact tie a live entry beats a tombstone, then the higher week wins, so the
//     result is the same whichever device merges first
//   - tombstones older than 90 days are dropped, and the set is kept to MAX_WATCH entries: live entries first, newest
//     first, then tombstones
//   - the old local shape (id -> week, before sync) migrates with at 0, so any change made on another device since
//     then wins over it

export const MAX_WATCH = 200;
export const MAX_BYTES = 32 * 1024;
export const FIRST_WEEK = 1;
export const LAST_WEEK = 18;
const GONE_TTL = 90 * 864e5;

const ID = /^[A-Za-z0-9_.-]{1,48}$/;
const isWeek = (w) => Number.isInteger(w) && w >= FIRST_WEEK && w <= LAST_WEEK;
const isStamp = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** One entry, checked field by field. Anything else on it is dropped. Null when it isn't usable. */
export function cleanEntry(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return null;
  if (!isWeek(e.week) || !isStamp(e.at)) return null;
  return e.removed === true ? { week: e.week, at: e.at, removed: true } : { week: e.week, at: e.at };
}

/**
 * A whole set from a client, strictly: null when it isn't an object, has more than MAX_WATCH ids, or any id or entry
 * is malformed. The server answers 400 for null rather than quietly keeping half a list.
 */
export function parseWatch(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const ids = Object.keys(v);
  if (ids.length > MAX_WATCH) return null;
  const out = {};
  for (const id of ids) {
    const e = cleanEntry(v[id]);
    if (!ID.test(id) || !e) return null;
    out[id] = e;
  }
  return out;
}

/** A set read back from storage or another device, leniently: bad entries are skipped. */
export function looseWatch(v) {
  const out = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [id, raw] of Object.entries(v)) {
    const e = cleanEntry(raw);
    if (ID.test(id) && e) out[id] = e;
  }
  return out;
}

/** The pre-sync local shape (player id -> week) as a set. Each entry gets at 0: older than any synced change. */
export function migrateWatch(old) {
  const out = {};
  if (!old || typeof old !== "object" || Array.isArray(old)) return out;
  for (const [id, week] of Object.entries(old)) {
    if (ID.test(id) && isWeek(week)) out[id] = { week, at: 0 };
  }
  return out;
}

/** a beats b */
const wins = (a, b) => {
  if (a.at !== b.at) return a.at > b.at;
  if (!!a.removed !== !!b.removed) return !a.removed;
  return a.week > b.week;
};

/** Merge any number of sets into one, by the rules above. */
export function mergeWatch(...sets) {
  const out = {};
  for (const s of sets) {
    for (const [id, raw] of Object.entries(s ?? {})) {
      const e = cleanEntry(raw);
      if (!e || !ID.test(id)) continue;
      if (!out[id] || wins(e, out[id])) out[id] = e;
    }
  }
  return pruneWatch(out);
}

/** Keep a set inside the caps: old tombstones go, then the oldest entries past MAX_WATCH, tombstones before live ones. */
export function pruneWatch(set, now = Date.now()) {
  const all = Object.entries(set).filter(([, e]) => !e.removed || now - e.at < GONE_TTL);
  if (all.length <= MAX_WATCH) return Object.fromEntries(all);
  const live = all.filter(([, e]) => !e.removed).sort((a, b) => b[1].at - a[1].at);
  const gone = all.filter(([, e]) => e.removed).sort((a, b) => b[1].at - a[1].at);
  return Object.fromEntries([...live, ...gone].slice(0, MAX_WATCH));
}

/** What the screen shows: player id -> week, without the tombstones. */
export function liveWatch(set) {
  const out = {};
  for (const [id, e] of Object.entries(set ?? {})) if (!e.removed) out[id] = e.week;
  return out;
}

/**
 * Apply an edit made on screen (the new id -> week map) to a set: added or re-weeked players are stamped now, dropped
 * ones become tombstones. A stamp never goes backwards, so a device whose clock runs behind still records the change.
 */
export function editWatch(set, next, now = Date.now()) {
  const out = { ...set };
  const stamp = (id) => Math.max(now, (set[id]?.at ?? 0) + 1);
  for (const [id, raw] of Object.entries(next)) {
    if (!ID.test(id)) continue;
    const week = Math.min(LAST_WEEK, Math.max(FIRST_WEEK, Math.round(Number(raw) || FIRST_WEEK)));
    const cur = set[id];
    if (cur && !cur.removed && cur.week === week) continue;
    out[id] = { week, at: stamp(id) };
  }
  for (const [id, cur] of Object.entries(set)) {
    if (!cur.removed && !(id in next)) out[id] = { week: cur.week, at: stamp(id), removed: true };
  }
  return pruneWatch(out, now);
}

/** Same ids, weeks, stamps and tombstones */
export function sameWatch(a, b) {
  const ka = Object.keys(a ?? {}), kb = Object.keys(b ?? {});
  if (ka.length !== kb.length) return false;
  return ka.every((id) => { const x = a[id], y = b?.[id]; return !!y && x.week === y.week && x.at === y.at && !!x.removed === !!y.removed; });
}
