// Sent offers sync: the merge rules, shared by the server (api/offers.js) and the app (src/offerSync.ts) so both sides
// settle on the same list. Plain JS so the serverless function can import it without a build step; types in
// offerMerge.d.ts.
//
// A set is { offers, gone }. offers are SentOffer records; gone maps an offer id to when it was cleared (a tombstone,
// so a cleared offer doesn't come back from another device). Rules:
//   - one record per offer id; the newer stamp wins (updatedAt, falling back to statusAt or sentAt), then the higher
//     version, then whichever set was passed first
//   - a tombstone hides an offer stamped at or before it; an offer edited after it (undo, a resend) wins and the
//     tombstone goes
//   - tombstones older than 90 days are dropped, and the whole set is kept under the size caps by dropping the oldest

export const MAX_BYTES = 64 * 1024;
export const MAX_OFFERS = 200;
export const MAX_GONE = 400;
const GONE_TTL = 90 * 864e5;
/** Room under MAX_BYTES so a pruned set always fits in one request */
const KEEP_BYTES = MAX_BYTES - 4 * 1024;

const STATUS = new Set(["pending", "declined", "accepted", "replaced"]);
const WHY = new Set(["thin", "value", "unwanted", "keeps", "notNow", "other"]);
const POS = new Set(["QB", "RB", "WR", "TE"]);
const ID = /^[A-Za-z0-9_-]{1,48}$/;
const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** When this record last changed */
export const stampOf = (o) => Math.max(num(o?.updatedAt) ?? 0, num(o?.statusAt) ?? 0, num(o?.sentAt) ?? 0);

/**
 * One offer from a client, keeping only the fields the app stores and checking each one. Anything else on the object
 * (a token, a password, anything) is dropped. Returns null when the record isn't usable.
 */
export function cleanOffer(o, leagueId) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const id = str(o.id, 49), deal = str(o.deal, 49), partnerId = String(o.partnerId ?? "");
  if (!ID.test(id ?? "") || !ID.test(deal ?? "") || !ID.test(partnerId)) return null;
  const ids = (a) => (Array.isArray(a) && a.length <= 20 && a.every((x) => typeof x === "string" && ID.test(x)) ? [...a] : null);
  const give = ids(o.give), get = ids(o.get);
  const sentAt = num(o.sentAt);
  if (!give || !get || sentAt == null) return null;
  if (leagueId && o.leagueId != null && String(o.leagueId) !== leagueId) return null;
  const out = {
    id, deal, leagueId: leagueId || String(o.leagueId ?? ""), partnerId, give, get,
    pitch: str(o.pitch, 4000) ?? "", sentAt,
    version: Math.max(1, Math.min(999, Math.floor(num(o.version) ?? 1))),
    via: str(o.via, 40) ?? "", week: Math.min(30, Math.floor(num(o.week) ?? 0)),
    status: STATUS.has(o.status) ? o.status : "pending",
  };
  const statusAt = num(o.statusAt);
  if (statusAt != null) out.statusAt = statusAt;
  // Why it was declined: a known pick, plus only the position, player and note that go with it
  const w = o.why;
  if (w && typeof w === "object" && !Array.isArray(w) && WHY.has(w.kind)) {
    const why = { kind: w.kind, at: num(w.at) ?? statusAt ?? sentAt };
    if (POS.has(w.pos)) why.pos = w.pos;
    if (typeof w.playerId === "string" && ID.test(w.playerId)) why.playerId = w.playerId;
    const note = str(w.note, 280)?.trim();
    if (note) why.note = note;
    // "Not trading now": the league week it was saved in, and when ideas were resumed early
    const wk = num(w.week);
    if (w.kind === "notNow" && wk != null && wk >= 1 && wk <= 30) why.week = Math.floor(wk);
    const resumed = num(w.resumedAt);
    if (w.kind === "notNow" && resumed != null) why.resumedAt = resumed;
    out.why = why;
  }
  out.updatedAt = stampOf({ ...out, updatedAt: o.updatedAt });
  return out;
}

const newer = (a, b) => {
  const sa = stampOf(a), sb = stampOf(b);
  return sa > sb || (sa === sb && (num(a.version) ?? 0) > (num(b.version) ?? 0));
};

/** Merge any number of sets into one, by the rules above. Earlier sets win exact ties. */
export function mergeOffers(...sets) {
  const byId = new Map();
  const gone = {};
  for (const s of sets) {
    for (const [id, at] of Object.entries(s?.gone ?? {})) {
      if (ID.test(id) && num(at) != null && !(gone[id] >= at)) gone[id] = at;
    }
    for (const o of s?.offers ?? []) {
      if (!o || typeof o.id !== "string") continue;
      const cur = byId.get(o.id);
      if (!cur || newer(o, cur)) byId.set(o.id, o);
    }
  }
  const offers = [];
  for (const o of byId.values()) {
    const g = gone[o.id];
    if (g != null && g >= stampOf(o)) continue;
    if (g != null) delete gone[o.id];
    offers.push(o);
  }
  return prune({ offers, gone });
}

/** Keep a set inside the caps: newest offers and tombstones first, oldest dropped. */
export function prune(set, now = Date.now()) {
  const offers = [...set.offers].sort((a, b) => stampOf(b) - stampOf(a)).slice(0, MAX_OFFERS);
  let gone = Object.entries(set.gone).filter(([, at]) => now - at < GONE_TTL).sort((a, b) => b[1] - a[1]).slice(0, MAX_GONE);
  const size = (x) => JSON.stringify(x).length + 1;
  let bytes = 32 + offers.reduce((n, o) => n + size(o), 0) + gone.reduce((n, g) => n + size(g), 0);
  while (bytes > KEEP_BYTES && gone.length > 0) bytes -= size(gone.pop());
  while (bytes > KEEP_BYTES && offers.length > 0) bytes -= size(offers.pop());
  return { offers, gone: Object.fromEntries(gone) };
}
