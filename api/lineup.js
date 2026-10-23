// Set optimal lineup: Source AI checks the engine's projection-best lineup against the week's signals.
//   POST /api/lineup  body { week, slots, roster, current, baseline, signals }
//   200 { lineup: { starters: [{ slot, id }], swaps: [{ start, bench, slot, why, signal }], summary } }
//   400 bad input · 403 not this site, or a bot · 405 not POST · 413 too big · 429 slow down (reason "daily_limit")
//   502 bad model reply · 503 unavailable (reason: no_key, guard, daily_cap) · 504 timed out
// The app sends its roster with this week's projections, Sleeper's current lineup, the engine's best lineup under
// the locks (the floor and the math), and what api/lineup-signals.js found: news, injuries, Vegas lines, weather and,
// when licensed, expert rankings. The model returns starters per slot and a one-line reason for each change that
// cites one of those signals. The app validates the lineup (roster, slots, byes, injuries, locks) before showing it.
// Shares the model, the Messages API call, the guard (api/_lib/guard.js), the rate limiter and the house style with
// api/ask.js.
import { MODEL, guardedCall, ipOf, rateLimiter, tidy } from "./ask.js";
import { createGuard } from "./_lib/guard.js";

export const MAX_BODY = 48_000;
const MAX_TOKENS = 900;
const SLOT_NAMES = ["QB", "RB", "WR", "TE", "FLEX", "SF"];
export const SIGNAL_KINDS = ["news", "injury", "odds", "weather", "rankings"];
/** Where each signal sits in the request's "signals" object. */
const KEY = { news: "news", injury: "injuries", odds: "odds", weather: "weather", rankings: "rankings" };
const lineupLimit = rateLimiter({ perMin: 6, perHour: 40 });

export const SYSTEM = `You are Source AI, setting one fantasy football lineup for this week inside Source.

What you get (JSON in the user turn)
- "slots": the starting slots in order. FLEX takes RB, WR or TE. SF (superflex) takes any position.
- "roster": every player with "proj" (this week's projected fantasy points), "status" (injury designation, if any), "bye", and "locked" (his game has started, so he can't move).
- "current": the lineup set in Sleeper right now. "baseline": the engine's best lineup by projection, respecting locks.
- "signals": what was gathered this week. "news" (recent stories, with practice reports and inactive calls), "injuries" (Sleeper status and practice participation), "odds" (game total, spread, implied team points, and where the total ranks on the slate), "weather" (kickoff-hour temperature, wind, gusts and rain at outdoor stadiums), "rankings" (expert positional ranks). A signal that is missing or empty was not available.

How to decide
- Start from "baseline". It is the math. Change a slot only when a signal gives a clear reason the projection misses, like a player who missed his final practice, a likely inactive, wind of 20 mph or more, heavy rain, or a much higher or lower game total.
- Weigh practice by day. The last practice before the game counts most: Friday for a Sunday game, Saturday for a Monday game, Wednesday for a Thursday game. Missing or being limited on Wednesday or Thursday ahead of a Sunday game is routine (rest days, veterans, maintenance) and is not a reason to bench on its own. A DNP on the final practice day, or no practice all week, is a real warning; limited on the final day is a mild one. "practiceDay" on a story and "practiceAsOf" on the injuries list say which day a report is from. When the day is unknown, treat the report as weak.
- Never start anyone who is out, on bye or not on the roster. Never move a locked player. Every slot must be legal.
- Close calls go to the higher projection.
- Return all starters, one per slot, in the order of "slots".

Swaps and reasons
- "swaps" lists each change from "current" (Sleeper's lineup): who to start, who to bench, the slot, a one-line reason, and which signal it rests on.
- The reason cites the signal plainly, under 12 words. Examples: "Questionable, missed Friday practice". "Wind 20+ mph in Buffalo". "Game total 51.5, highest on the slate". "Projects 4.1 more than Jaylen Warren".
- Use "projection" as the signal when the change is just the better projection, or when he replaces someone out or on bye.
- Only cite a signal that appears in the data. Never make up a number, a stat, a report or a forecast. Every number in a reason must come from the data.
- "summary": one short sentence on the lineup overall.

Writing rules
- Never use em dashes or en dashes. Use commas, periods or parentheses.
- Never describe anything as "quiet" or "loud".
- Short and plain. No hype, no emoji, no markdown.

Always reply by calling the "set_lineup" tool.`;

const TOOL = {
  name: "set_lineup",
  description: "Return this week's recommended starting lineup and the changes from the current Sleeper lineup.",
  input_schema: {
    type: "object",
    properties: {
      starters: {
        type: "array", description: "One starter per slot, in the order of slots.",
        items: { type: "object", properties: { slot: { type: "string" }, id: { type: "string" } }, required: ["slot", "id"] },
      },
      swaps: {
        type: "array", description: "Each change from the current Sleeper lineup.",
        items: {
          type: "object",
          properties: {
            start: { type: "string", description: "Id of the player to start." },
            bench: { type: "string", description: "Id of the player to bench." },
            slot: { type: "string" },
            why: { type: "string", description: "One line, under 12 words, citing the signal." },
            signal: { type: "string", enum: [...SIGNAL_KINDS, "projection"] },
          },
          required: ["start", "bench", "slot", "why", "signal"],
        },
      },
      summary: { type: "string", description: "One short sentence." },
    },
    required: ["starters", "swaps", "summary"],
  },
};

// ---- Input -----------------------------------------------------------------

const lineupOf = (xs) => (Array.isArray(xs) ? xs : []).slice(0, 12).map((s) => ({ slot: String(s?.slot ?? ""), id: s?.id == null ? null : String(s.id) }));

/** The request body, or { status, error } when it's unusable. Also every number in the data, for checking reasons. */
export function readLineupBody(req) {
  let b = req.body;
  if (Number(req.headers?.["content-length"] ?? 0) > MAX_BODY) return { status: 413, error: "body too large" };
  if (typeof b === "string" || b instanceof Uint8Array) {
    const s = typeof b === "string" ? b : new TextDecoder().decode(b);
    if (new TextEncoder().encode(s).length > MAX_BODY) return { status: 413, error: "body too large" };
    try { b = JSON.parse(s); } catch { return { status: 400, error: "body must be JSON" }; }
  } else if (b && typeof b === "object" && new TextEncoder().encode(JSON.stringify(b)).length > MAX_BODY) return { status: 413, error: "body too large" };
  if (!b || typeof b !== "object" || Array.isArray(b)) return { status: 400, error: "body must be a JSON object" };
  const slots = Array.isArray(b.slots) ? b.slots.map(String) : [];
  if (!slots.length || slots.length > 12 || !slots.every((s) => SLOT_NAMES.includes(s))) return { status: 400, error: "slots must list the starting slots" };
  const roster = (Array.isArray(b.roster) ? b.roster : []).filter((p) => p && p.id != null && typeof p.name === "string");
  if (!roster.length) return { status: 400, error: "roster is required" };
  if (roster.length > 40) return { status: 413, error: "roster over 40 players" };
  const signals = b.signals && typeof b.signals === "object" && !Array.isArray(b.signals) ? b.signals : {};
  const data = {
    week: Number(b.week) || undefined, slots,
    roster: roster.map((p) => ({
      id: String(p.id), name: String(p.name).slice(0, 60), pos: String(p.pos ?? ""), nfl: String(p.nfl ?? ""),
      proj: Number.isFinite(Number(p.proj)) ? Number(p.proj) : 0,
      ...(p.status ? { status: String(p.status).slice(0, 40) } : {}), ...(p.bye ? { bye: true } : {}), ...(p.locked ? { locked: true } : {}),
      ...(p.opp ? { opp: String(p.opp).slice(0, 10) } : {}),
    })),
    current: lineupOf(b.current), baseline: lineupOf(b.baseline),
    signals: Object.fromEntries(SIGNAL_KINDS.filter((k) => Array.isArray(signals[KEY[k]])).map((k) => [KEY[k], signals[KEY[k]].slice(0, 40)])),
  };
  const json = JSON.stringify(data);
  if (new TextEncoder().encode(json).length > MAX_BODY) return { status: 413, error: "body too large" };
  // Which signals actually carry something, so a reason can only rest on one of those
  const have = new Set(SIGNAL_KINDS.filter((k) => (data.signals[KEY[k]] ?? []).length > 0));
  // A reason may quote a projection gap ("Projects 4.1 more than Warren"), so the gaps count as data too
  const projs = data.roster.map((p) => p.proj);
  const gaps = projs.flatMap((a, i) => projs.slice(i + 1).map((b) => Math.round(Math.abs(a - b) * 10) / 10));
  return { data, json, ids: new Set(data.roster.map((p) => p.id)), have, numbers: [...numbersIn(json), ...gaps] };
}

/** Every number that appears in the data the model saw. */
export const numbersIn = (s) => (String(s).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

/** A reason's numbers all come from the data: each within a hair of one there (51.5 vs 51.5, 22 vs 22.3), and a
 *  threshold like "20+ mph" only when the data has a number at or a little over it. */
export function numbersBacked(why, numbers) {
  const used = [...why.matchAll(/(\d+(?:\.\d+)?)(\+?)/g)].map((m) => ({ n: Number(m[1]), plus: m[2] === "+" }));
  const abs = numbers.map((m) => Math.abs(m));
  return used.every(({ n, plus }) => abs.some((m) => (plus ? m >= n && m <= n * 1.5 : Math.abs(m - n) <= Math.max(0.05, Math.abs(n) * 0.02) || Math.floor(m) === n || Math.round(m) === n)));
}

// ---- Output ----------------------------------------------------------------

const BANNED = /\b(quiet|quietly|loud|loudly)\b/i;

/** The model's lineup, cleaned: unknown ids dropped, reasons tidied, and a reason that leans on a signal that wasn't
 *  there, or on a number that isn't in the data, loses its text (the app then writes the engine's reason). */
export function cleanLineup(raw, input) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.starters)) return null;
  const { ids, have, numbers } = input;
  // Starters pass through as given; the app rejects the whole lineup if any of them isn't on the roster
  const starters = lineupOf(raw.starters);
  const swaps = (Array.isArray(raw.swaps) ? raw.swaps : []).slice(0, 12).filter((w) => w && ids.has(String(w.start)) && ids.has(String(w.bench))).map((w) => {
    let signal = SIGNAL_KINDS.includes(w.signal) || w.signal === "projection" ? w.signal : "projection";
    let why = tidy(w.why, 90).replace(/[.…]+$/, "");
    if (signal !== "projection" && !have.has(signal)) { signal = "projection"; why = ""; }
    if (why && (BANNED.test(why) || !numbersBacked(why, numbers))) why = "";
    return { start: String(w.start), bench: String(w.bench), slot: String(w.slot ?? ""), why, signal };
  });
  return { starters, swaps, summary: BANNED.test(String(raw.summary ?? "")) ? "" : tidy(raw.summary, 200) };
}

/** Pull the lineup out of a Messages API response: the tool call, else JSON in the text. */
export function lineupFrom(msg, input) {
  const blocks = Array.isArray(msg?.content) ? msg.content : [];
  const tool = blocks.find((b) => b?.type === "tool_use" && b.name === "set_lineup");
  if (tool) return cleanLineup(tool.input, input);
  const text = blocks.filter((b) => b?.type === "text").map((b) => b.text).join("\n").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  if (!text.startsWith("{")) return null;
  try { return cleanLineup(JSON.parse(text), input); } catch { return null; }
}

export function buildLineupRequest(input) {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "set_lineup" },
    messages: [{ role: "user", content: `<lineup_data>\n${input.json}\n</lineup_data>\n\nSet the best lineup for this week.` }],
  };
}

// ---- Handler ---------------------------------------------------------------

/** `guard` is api/_lib/guard.js's createGuard(); the deployed handler (the default export) always has one. */
export function createLineupHandler({ env = process.env, timeoutMs, guard = null } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "method not allowed" }); }
    const key = env.ANTHROPIC_API_KEY;
    if (!key) return res.status(503).json({ error: "ai_unavailable", reason: "no_key" });
    if (guard) { const g = await guard.check(req); if (!g.ok) return res.status(g.status).json(g.body); }
    const input = readLineupBody(req);
    if (input.status) return res.status(input.status).json({ error: input.error });
    if (lineupLimit.limited(ipOf(req))) { res.setHeader("Retry-After", "60"); return res.status(429).json({ error: "too many lineups, try again in a minute" }); }
    const r = await guardedCall(guard, req, key, buildLineupRequest(input), timeoutMs);
    if (!r.ok) return res.status(r.status).json(r.body);
    const lineup = lineupFrom(r.msg, input);
    if (!lineup) return res.status(502).json({ error: "bad model reply" });
    return res.status(200).json({ lineup });
  };
}

export const resetLineupLimits = lineupLimit.reset;
export default createLineupHandler({ guard: createGuard() });
