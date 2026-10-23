// What people ask Source AI, kept so model choices can be tested on real questions later (Zach, Oct 23).
// One small Blob per answered question at asks/YYYY-MM-DD/<id>.json, written by api/ask.js inside the call that already
// runs: no extra function call, one Blob write per answer, after the reply has gone out so nobody waits on it.
//
// What's kept: the question and answer with every team, manager and league name in the snapshot swapped for a
// placeholder, the league's format (scoring, team count, type, week, demo or not), whether it followed earlier
// questions, which model answered, its tokens, cost and time. The league itself is a salted hash. No IP, no Sleeper
// user id, no sync key, no league snapshot.
// Kept 12 months: the first save of each UTC day on an instance lists the oldest rows and deletes any past a year (one
// list call a day, deletes only when something has expired).
// Off when ASK_LOG=off or no Blob store is connected. Never throws: a failed write is a missed row, not a failed answer.
import { costOf, hashKey, utcDay } from "./guard.js";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Names to hide, longest first so "Allen Cooks, Coker Eats" goes before "Allen". */
export function namesIn(league) {
  const out = [];
  const add = (v, tag) => { const s = typeof v === "string" ? v.trim() : ""; if (s.length >= 2) out.push([s, tag]); };
  add(league?.league?.name, "[league]");
  for (const t of Array.isArray(league?.teams) ? league.teams : []) { add(t?.name, "[team]"); add(t?.manager, "[manager]"); }
  return out.sort((a, b) => b[0].length - a[0].length);
}

/** The text with each known name swapped for its placeholder, case-insensitive, whole words only. */
export function redact(text, names) {
  let s = String(text ?? "");
  for (const [name, tag] of names) s = s.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${esc(name)}(?=$|[^\\p{L}\\p{N}])`, "giu"), `$1${tag}`);
  return s;
}

/** The row to save. `league` is the parsed snapshot, `answer` the cleaned reply (or null), `usage` the API's. */
export function askRow({ question, league, facts, history, answer, usage, model, ms, status, now = Date.now(), env = process.env }) {
  const names = namesIn(league);
  const L = league?.league ?? {};
  const salt = env.AI_LIMIT_SALT || `ask-log:${String(env.BLOB_READ_WRITE_TOKEN || "").slice(-12)}`;
  const u = usage && typeof usage === "object" ? usage : {};
  return {
    v: 1, at: now, status,
    q: redact(question, names),
    ...(answer ? { a: { text: redact(answer.text, names), points: (answer.points ?? []).map((p) => redact(p, names)), ...(answer.quip ? { quip: redact(answer.quip, names) } : {}) } } : {}),
    league: hashKey(`${L.name ?? ""}|${L.season ?? ""}`, salt),
    format: { scoring: L.scoring ?? null, teams: Number(L.teams) || null, type: L.type ?? null, week: Number(league?.week ?? L.week) || null, demo: !!L.demo },
    turn: Array.isArray(history) ? history.length : 0,
    facts: facts && typeof facts === "object" ? Object.keys(facts).slice(0, 12) : [],
    model, ms,
    tokens: { in: u.input_tokens ?? 0, out: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 },
    cost: Math.round(costOf(u) * 1e6) / 1e6,
  };
}

const KEEP_DAYS = 365;
let sweptOn = "";
/** Deletes rows more than a year older than `day`. Paths start with the date, so the list comes back oldest first and
 *  one call finds every expired row (up to `limit`; whatever's left goes on a later day). Best effort. */
export async function sweepOld(blob, day, limit = 200) {
  const cutoff = utcDay(Date.parse(`${day}T12:00:00Z`) - KEEP_DAYS * 864e5);
  try {
    for (const path of await blob.list("asks/", limit)) {
      if (path.slice(5, 15) >= cutoff) break;
      await blob.remove(path);
    }
  } catch { /* next day tries again */ }
}

/** Saves one row. Resolves either way; at most `timeoutMs` of the function's time. */
export async function logAsk(blob, row, { env = process.env, timeoutMs = 3000 } = {}) {
  if (env.ASK_LOG === "off" || !blob?.ready?.()) return false;
  const id = `${row.at.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  try {
    await Promise.race([blob.write(`asks/${utcDay(row.at)}/${id}.json`, row), new Promise((_, no) => setTimeout(() => no(new Error("slow")), timeoutMs))]);
    const day = utcDay(row.at);
    if (sweptOn !== day) { sweptOn = day; await sweepOld(blob, day); }
    return true;
  } catch { return false; }
}
