// Fail safes for the endpoints that cost money: Sources AI (api/ask.js, api/lineup.js) and the lineup signals
// (api/lineup-signals.js, which spends Odds API credits).
//
//   check(req)          Same-origin, then Vercel BotID. Every protected endpoint runs this before any paid work.
//   admit(req, request) Sources AI only. Reads today's ledger in Blob and refuses the call when the daily spend
//                       ceiling is near, or when this IP, this Sleeper user, or this demo visitor is out of calls.
//   record(ticket, usage)  After the model call: adds the real token cost from Anthropic's `usage` and the call
//                       counts to the ledger, then logs one status line with no personal data.
//   status()            { spentToday, cap, capped } for GET /api/ai-status.
//
// Anything that errors (BotID, Blob) fails closed: no paid call, and the app shows its built-in answer.
// Never logs an IP, a user id or a key. IPs and user ids are hashed with a secret, per-day salt before they're used as
// ledger keys (AI_LIMIT_SALT, or one derived from BLOB_READ_WRITE_TOKEN).
// Ledger: one Blob per UTC day at ai-spend/YYYY-MM-DD.json, holding only hashed keys and counts. Each day's ledger is
// deleted once the day is over: the first ledger write of a new UTC day sweeps every earlier day (sweep below).
// Blob isn't transactional, so two calls that finish at the
// same moment can each miss the other's write. To keep any overshoot to about one call, a call is refused when today's
// spend plus that call's worst-case cost would reach the cap, and calls in flight on this instance count too.
import { createHash } from "node:crypto";
import { blobFromEnv } from "../offers.js";

/**
 * Anthropic list prices for claude-haiku-5-5 in US dollars per million tokens, prompts under 100k tokens.
 * Zach: check https://www.anthropic.com/pricing (or the model's page in the console) and update these when they change.
 * Cache writes bill at 1.25x input and cache reads at 0.1x input.
 */
export const PRICES = { inPerM: 0.10, outPerM: 0.50, cacheWriteX: 1.25, cacheReadX: 0.1 };

const SLEEPER_ID = /^\d{1,24}$/;
const DEFAULT_SALT = "sources-ai-guard-v1";

const num = (v, d) => (v != null && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);

/** Limits, each overridable by an env var. */
export function limitsFrom(env = process.env) {
  return {
    cap: num(env.AI_DAILY_CAP_USD, 0.25),
    perIp: num(env.AI_DAILY_PER_IP, 30),
    perUser: num(env.AI_DAILY_PER_USER, 40),
    demoPerIp: num(env.AI_DAILY_DEMO_PER_IP, 5),
  };
}

export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

/** A short salted hash, so the ledger never holds a raw IP or user id. */
export const hashKey = (s, salt = DEFAULT_SALT) => createHash("sha256").update(`${salt}:${s}`).digest("hex").slice(0, 20);

export const ipOf = (req) => String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";

/** Dollars for one Messages API response's `usage`. */
export function costOf(usage, p = PRICES) {
  if (!usage || typeof usage !== "object") return 0;
  const n = (k) => (Number.isFinite(Number(usage[k])) ? Number(usage[k]) : 0);
  const inTok = n("input_tokens") + n("cache_creation_input_tokens") * p.cacheWriteX + n("cache_read_input_tokens") * p.cacheReadX;
  return (inTok * p.inPerM + n("output_tokens") * p.outPerM) / 1e6;
}

/** The most one request can cost: every byte a token (no real prompt is that dense), billed as a cache write, plus
 *  every output token it may use. Errs high on purpose; it only decides how close to the cap a call may start. */
export function maxCostOf(request, p = PRICES) {
  const bytes = new TextEncoder().encode(JSON.stringify(request ?? {})).length;
  const out = Number(request?.max_tokens) || 1024;
  return (bytes * p.cacheWriteX * p.inPerM + out * p.outPerM) / 1e6;
}

/**
 * True when the request came from a page on this site. Browsers send Origin on every POST fetch and Sec-Fetch-Site on
 * every request, so a missing Origin is only accepted with Sec-Fetch-Site: same-origin. Extra origins (a custom
 * domain served from another host name) can be listed in AI_ALLOWED_ORIGINS, comma separated.
 * This stops other websites from spending on our behalf through a visitor's browser. A script outside a browser can
 * set any header it likes, which is what BotID is for.
 */
export function sameOrigin(req, env = process.env) {
  const h = req.headers ?? {};
  const site = String(h["sec-fetch-site"] ?? "").toLowerCase();
  if (site === "cross-site" || site === "none") return false;
  const origin = String(h.origin ?? "");
  if (!origin || origin === "null") return site === "same-origin";
  let o;
  try { o = new URL(origin); } catch { return false; }
  const host = String(h["x-forwarded-host"] ?? h.host ?? "").split(",")[0].trim().toLowerCase();
  const allowed = String(env.AI_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim().toLowerCase().replace(/\/$/, "")).filter(Boolean);
  return (!!host && o.host.toLowerCase() === host) || allowed.includes(o.origin.toLowerCase());
}

/**
 * Vercel BotID's server check (https://vercel.com/docs/botid). The app's pages run initBotId (src/botid.ts) for the
 * same paths, which attaches the challenge result to each fetch. Plain Vercel functions get the request headers
 * passed in explicitly. Basic mode on both sides; if Deep Analysis is turned on in the dashboard, set
 * BOTID_CHECK_LEVEL=deepAnalysis and VITE_BOTID_CHECK_LEVEL=deepAnalysis so client and server match.
 * Imported lazily so a missing package fails closed in check() instead of taking the whole function down.
 */
export async function botIdCheck(req, env = process.env) {
  const { checkBotId } = await import("botid/server");
  const level = env.BOTID_CHECK_LEVEL === "deepAnalysis" ? "deepAnalysis" : undefined;
  const v = await checkBotId({ advancedOptions: { headers: req.headers, ...(level ? { checkLevel: level } : {}) } });
  return { isBot: !!v?.isBot };
}

/** How far back the fallback sweep reaches when the Blob list call isn't available. */
const SWEEP_DAYS = 31;

const deny = (status, error, reason, extra = {}) => ({ ok: false, status, body: { error, reason, ...extra } });
const emptyDay = (day) => ({ day, spent: 0, calls: 0, inTok: 0, outTok: 0, ips: {}, users: {} });
const asDay = (doc, day) => {
  const d = doc && typeof doc === "object" && doc.day === day ? doc : emptyDay(day);
  return { ...emptyDay(day), ...d, ips: { ...(d.ips ?? {}) }, users: { ...(d.users ?? {}) } };
};

export function createGuard({ env = process.env, blob = blobFromEnv(env), botCheck = botIdCheck, now = Date.now, log = console } = {}) {
  const lim = () => limitsFrom(env);
  // A secret salt: AI_LIMIT_SALT when set, otherwise one derived from the Blob token (a secret Vercel already holds), so
  // the hashes can't be reversed by hashing every IPv4 address with a salt read from this repo. The day goes into the
  // hash too, so the same person's keys can't be linked from one day to the next.
  const secret = env.AI_LIMIT_SALT || (env.BLOB_READ_WRITE_TOKEN ? createHash("sha256").update(`sources-ai-salt:${env.BLOB_READ_WRITE_TOKEN}`).digest("hex") : DEFAULT_SALT);
  const saltFor = (day) => `${secret}:${day}`;
  const pathFor = (day) => `ai-spend/${day}.json`;
  // This instance's share of today that the ledger may not show yet: calls in flight, and spend a failed write lost
  let local = { day: "", inflight: 0, unflushed: 0, ips: new Map(), users: new Map() };
  const localFor = (day) => {
    if (local.day !== day) local = { day, inflight: 0, unflushed: 0, ips: new Map(), users: new Map() };
    return local;
  };
  // Deletes every ledger from before `day`. Runs once per instance per day, on the first write of a new day. Lists the
  // store when it can; otherwise deletes the last SWEEP_DAYS days by name. Never throws.
  let sweptFor = "";
  const sweep = async (day) => {
    if (sweptFor === day || typeof blob.remove !== "function") return;
    sweptFor = day;
    let old;
    try {
      old = (await blob.list("ai-spend/")).filter((p) => /^ai-spend\/\d{4}-\d{2}-\d{2}\.json$/.test(p) && p < pathFor(day));
    } catch {
      const t = Date.parse(`${day}T00:00:00Z`);
      old = Array.from({ length: SWEEP_DAYS }, (_, i) => pathFor(utcDay(t - (i + 1) * 864e5)));
    }
    for (const p of old) { try { await blob.remove(p); } catch { /* next day tries again */ } }
    if (old.length) log.log?.(`[ai-guard] cleared ${old.length} past day${old.length === 1 ? "" : "s"} of counters`);
  };
  const bump = (m, k, by) => { if (!k) return; const v = (m.get(k) ?? 0) + by; if (v > 0) m.set(k, v); else m.delete(k); };

  return {
    /** Same-origin, then BotID. { ok: true } or a 403 or 503 to send as is. */
    async check(req) {
      if (!sameOrigin(req, env)) return deny(403, "forbidden", "origin");
      let verdict;
      try { verdict = await botCheck(req, env); } catch { log.warn?.("[ai-guard] BotID check failed, refusing"); return deny(503, "ai_unavailable", "guard"); }
      if (!verdict || verdict.isBot !== false) return deny(403, "forbidden", "bot");
      return { ok: true };
    },

    /** Reads today's ledger once and decides. { ok: true, ticket } or a 429 or 503 to send as is. */
    async admit(req, request) {
      const day = utcDay(now()), L = localFor(day), { cap, perIp, perUser, demoPerIp } = lim();
      if (!blob.ready()) { log.warn?.("[ai-guard] no Blob store, refusing"); return deny(503, "ai_unavailable", "guard"); }
      let doc;
      try { doc = asDay(await blob.read(pathFor(day)), day); } catch { log.warn?.("[ai-guard] ledger read failed, refusing"); return deny(503, "ai_unavailable", "guard"); }
      const maxCost = maxCostOf(request);
      const spent = doc.spent + L.inflight + L.unflushed;
      if (spent >= cap || spent + maxCost >= cap) return deny(503, "ai_unavailable", "daily_cap");
      const rawUser = String(req.headers?.["x-sources-user"] ?? "");
      const user = SLEEPER_ID.test(rawUser) ? hashKey(`u:${rawUser}`, saltFor(day)) : "";
      const ip = hashKey(`ip:${ipOf(req)}`, saltFor(day));
      const row = doc.ips[ip] ?? { n: 0, demo: 0 };
      const ipCalls = (row.n ?? 0) + (L.ips.get(ip) ?? 0);
      if (ipCalls >= perIp) return deny(429, "too many questions today", "daily_limit");
      if (!user && (row.demo ?? 0) + (L.ips.get(`d:${ip}`) ?? 0) >= demoPerIp) return deny(429, "too many questions today", "daily_limit");
      if (user && (doc.users[user] ?? 0) + (L.users.get(user) ?? 0) >= perUser) return deny(429, "too many questions today", "daily_limit");
      L.inflight += maxCost;
      bump(L.ips, ip, 1);
      if (!user) bump(L.ips, `d:${ip}`, 1);
      bump(L.users, user, 1);
      return { ok: true, ticket: { day, ip, user, demo: !user, maxCost } };
    },

    /**
     * Adds one finished call to the ledger. `usage` is the Messages API's usage block; pass null when the call failed.
     * `billed: true` with no usage (a timeout) counts the worst case, since Anthropic may still bill it.
     */
    async record(ticket, usage, { billed = false } = {}) {
      if (!ticket) return;
      const L = localFor(ticket.day);
      L.inflight = Math.max(0, L.inflight - ticket.maxCost);
      bump(L.ips, ticket.ip, -1);
      if (ticket.demo) bump(L.ips, `d:${ticket.ip}`, -1);
      bump(L.users, ticket.user, -1);
      const cost = usage ? costOf(usage) : billed ? ticket.maxCost : 0;
      const n = (k) => (usage && Number.isFinite(Number(usage[k])) ? Number(usage[k]) : 0);
      try {
        // Read again right before writing, so a call that finished meanwhile isn't overwritten
        const stored = await blob.read(pathFor(ticket.day));
        const doc = asDay(stored, ticket.day);
        doc.spent = Math.round((doc.spent + cost + L.unflushed) * 1e6) / 1e6;
        doc.calls += 1;
        doc.inTok += n("input_tokens") + n("cache_creation_input_tokens") + n("cache_read_input_tokens");
        doc.outTok += n("output_tokens");
        const row = doc.ips[ticket.ip] ?? { n: 0, demo: 0 };
        doc.ips[ticket.ip] = { n: (row.n ?? 0) + 1, demo: (row.demo ?? 0) + (ticket.demo ? 1 : 0) };
        if (ticket.user) doc.users[ticket.user] = (doc.users[ticket.user] ?? 0) + 1;
        doc.at = now();
        await blob.write(pathFor(ticket.day), doc);
        L.unflushed = 0;
        // The day's first write: clear the counters of every earlier day
        if (!stored || stored.day !== ticket.day) await sweep(ticket.day);
        const { cap } = lim();
        log.log?.(`[ai] ${ticket.day} spent $${doc.spent.toFixed(4)} of $${cap.toFixed(2)}, ${doc.calls} calls, ${doc.inTok} in / ${doc.outTok} out tokens${doc.spent >= cap ? ", capped" : ""}`);
      } catch {
        // Keep it here so this instance still counts it toward the cap
        L.unflushed += cost;
        log.warn?.("[ai-guard] ledger write failed, holding the spend on this instance");
      }
    },

    /** Today's spend for /api/ai-status. Throws when the ledger can't be read. */
    async status() {
      const day = utcDay(now()), { cap } = lim();
      if (!blob.ready()) throw new Error("no store");
      const doc = asDay(await blob.read(pathFor(day)), day);
      const spentToday = Math.round(doc.spent * 1e4) / 1e4;
      return { spentToday, cap, capped: spentToday >= cap };
    },
  };
}
