// Ask, answered by a model that reads your league.
//   POST /api/ask  body { question, context: { league, facts? }, history: [{ q, a }] }
//   200 { answer: { text, points, playerIds?, teamId?, quip? } }
//   400 bad input · 403 not this site, or a bot · 405 not POST · 413 too big · 429 slow down (reason "daily_limit" when
//   out of calls for today) · 502 bad model reply · 503 unavailable (reason: no_key, guard, daily_cap) · 504 timed out
// `league` is the compact league snapshot the app builds from loaded data (src/askContext.ts). `facts` is what the
// rule engine already computed for this question (a deal, a lineup swap, a waiver pick), so the model phrases real
// math instead of guessing. The model only ever sees that data plus general football knowledge.
// Calls the Anthropic Messages API with fetch (no SDK installed). The key and the context are never logged.
// Before any paid call the deployed handler runs api/_lib/guard.js: same-origin, Vercel BotID, the daily spend ceiling
// and the per-IP, per-user and demo limits kept in Blob. The app reads 403, 429 and 503 as "use the built-in answer".

import { createGuard, ipOf as guardIpOf } from "./_lib/guard.js";

export const MODEL = "claude-haiku-5-5";
export const MAX_Q = 500;
export const MAX_CONTEXT = 48_000; // bytes of JSON; the app aims for under 25 KB
const MAX_BODY = MAX_CONTEXT + 8_000; // the whole request body, checked before parsing
export const MAX_HISTORY = 3;
export const TIMEOUT_MS = 20_000;
const MAX_TOKENS = 600;
const RATE = { perMin: 10, perHour: 60 };

export const SYSTEM = `You are Sources AI, the assistant inside Sources, a fantasy football app. You answer questions about one fantasy league.

Ground rules
- Answer only from the league data in the user turn plus general football knowledge (how positions, byes, injuries and scoring work).
- Never make up stats, scores, projections, records, trades or transactions. If the data doesn't cover something, say so plainly in a few words, then give the best answer the data does support.
- "computed_facts", when present, is exact math from the app's engine for this question. Use those numbers as they are and don't contradict them.
- The user is the team with "you": true. Speak to them as "you". Call other teams by manager or team name.
- Points are fantasy points. "proj" is a weekly projection, "ros" is rest-of-season points per week, "pf"/"pa" are points for and against.
- When a player's "proj" reads "no projection this week", say exactly that. Never write the word null.
- A player is on bye only when his row says "bye": true (from the NFL schedule), and "byeTeams" lists those teams. "no projection this week" means his team plays but no projection has posted yet: he is not on bye and not out. Read his "status" (Questionable, Out) for availability.
- Practice reports: the last practice before the game matters most (Friday for a Sunday game, Saturday for Monday, Wednesday for Thursday). Sitting out or being limited Wednesday or Thursday before a Sunday game is routine and not a red flag on its own; missing the final practice is.
- Write every number as plain digits with no spaces inside it: 1.2, 15.3, +4.0.

Trade offers
- When computed_facts has "offersShownAsCards", the app shows each offer as its own trade card right under your answer, with the players and numbers. Write "text" as a short summary that points at the cards by their approach name (for example "Best odds" or "Cheapest in value") and says which one you'd lead with and why. Don't list every player and number again. "points" can be empty, and leave "playerIds" empty.
- If no offer works ("works": false on every one), say so plainly and say what's closest.
- Never suggest trading a player listed in "userWontTrade". Those are the user's own players they've said they'll keep.

Shape of every answer
- "text": the answer itself in 1 to 3 short sentences. Lead with it. No preamble.
- "points": up to 3 short supporting points, each one line, using real numbers from the data. An empty list is fine.
- "playerIds": ids (the "id" field from the data) of the players the answer is about, most important first, at most 4. Only ids that appear in the data.
- "teamId": the id of the one team the answer is mainly about, if there is one.
- "quip": one dry, playful one-liner, or an empty string. See humor.

Humor
- When the user turn says QUIP: YES, write one quip: a light jab at a bad team, bad luck, a lopsided trade, a manager who never trades, a bench full of points. When it says QUIP: NO, leave "quip" empty unless the user asks for a roast.
- If the user asks you to roast someone, go for it: the roast goes in "text" and "points", and "quip" carries the closer.
- Never mean-spirited. Nothing about anyone's real life, looks, job, family or anything beyond fantasy football. No profanity.

Writing rules
- Never use em dashes or en dashes. Use commas, periods or parentheses.
- Never describe anything as "quiet" or "loud".
- Vary sentence length. Plain words, no hype, no emoji, no markdown.

Always reply by calling the "answer" tool.`;

const TOOL = {
  name: "answer",
  description: "Reply to the user's question about their league.",
  input_schema: {
    type: "object",
    properties: {
      text: { type: "string", description: "The answer in 1 to 3 short sentences." },
      points: { type: "array", items: { type: "string" }, maxItems: 3, description: "Up to 3 short supporting points." },
      playerIds: { type: "array", items: { type: "string" }, maxItems: 4, description: "Ids of the players the answer is about." },
      teamId: { type: "string", description: "Id of the team the answer is mainly about, or empty." },
      quip: { type: "string", description: "One dry one-liner, or empty." },
    },
    required: ["text", "points"],
  },
};

// ---- Input -----------------------------------------------------------------

const byteLen = (s) => new TextEncoder().encode(s).length;

/** The request body as { question, league, facts, history }, or { status, error } when it's unusable. */
export function readBody(req) {
  let b = req.body;
  const declared = Number(req.headers?.["content-length"] ?? 0);
  if (declared > MAX_BODY) return { status: 413, error: "body too large" };
  if (typeof b === "string" || b instanceof Uint8Array) {
    const s = typeof b === "string" ? b : new TextDecoder().decode(b);
    if (byteLen(s) > MAX_BODY) return { status: 413, error: "body too large" };
    try { b = JSON.parse(s); } catch { return { status: 400, error: "body must be JSON" }; }
  } else if (b && typeof b === "object" && byteLen(JSON.stringify(b)) > MAX_BODY) return { status: 413, error: "body too large" };
  if (!b || typeof b !== "object" || Array.isArray(b)) return { status: 400, error: "body must be a JSON object" };
  const question = typeof b.question === "string" ? b.question.trim() : "";
  if (!question) return { status: 400, error: "question is required" };
  if (question.length > MAX_Q) return { status: 413, error: `question over ${MAX_Q} characters` };
  const ctx = b.context;
  if (!ctx || typeof ctx !== "object" || Array.isArray(ctx) || !ctx.league || typeof ctx.league !== "object") return { status: 400, error: "context.league is required" };
  const league = JSON.stringify(ctx.league);
  const facts = ctx.facts == null ? "" : JSON.stringify(ctx.facts);
  if (byteLen(league) + byteLen(facts) > MAX_CONTEXT) return { status: 413, error: `context over ${MAX_CONTEXT} bytes` };
  const history = (Array.isArray(b.history) ? b.history : []).slice(-MAX_HISTORY)
    .filter((h) => h && typeof h.q === "string" && typeof h.a === "string")
    .map((h) => ({ q: h.q.slice(0, MAX_Q), a: h.a.slice(0, 1200) }));
  return { question, league, facts, history, ids: idsIn(ctx.league) };
}

/** Every player and team id in the league snapshot, so the reply can only point at real ones. */
function idsIn(league) {
  const players = new Set(), teams = new Set();
  for (const t of Array.isArray(league.teams) ? league.teams : []) {
    if (t && t.id != null) teams.add(String(t.id));
    for (const k of ["roster", "ir", "taxi"]) for (const p of Array.isArray(t?.[k]) ? t[k] : []) if (p && p.id != null) players.add(String(p.id));
  }
  for (const p of Array.isArray(league.freeAgents) ? league.freeAgents : []) if (p && p.id != null) players.add(String(p.id));
  return { players, teams };
}

// ---- Rate limit (per instance, in memory) ------------------------------------

/** A per-IP limiter with its own memory. api/lineup.js and api/lineup-signals.js make their own with their own rates. */
export function rateLimiter(rate) {
  const hits = new Map();
  const limited = (ip, now = Date.now()) => {
    const list = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
    const lastMin = list.filter((t) => now - t < 60_000).length;
    if (lastMin >= rate.perMin || list.length >= rate.perHour) { hits.set(ip, list); return true; }
    list.push(now);
    hits.set(ip, list);
    if (hits.size > 5_000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 3_600_000) hits.delete(k);
    return false;
  };
  return { limited, reset: () => hits.clear() };
}
const askLimit = rateLimiter(RATE);
export const limited = askLimit.limited;
export const resetLimits = askLimit.reset;
export const ipOf = guardIpOf;

// ---- Output ----------------------------------------------------------------

/** A projection is never shown as a raw null: "proj null" reads "no projection this week". */
export function noNulls(s) {
  return String(s ?? "")
    .replace(/\b(?:proj(?:ected|ection)?|projects?)\b\.?:?\s*(?:of\s*|at\s*|is\s*)?null\b(?:\s+this week)?/gi, "no projection this week")
    .replace(/\bnull\s+(?:proj(?:ected|ection)?|projection)\b/gi, "no projection this week")
    .replace(/\bnull\b/gi, "none");
}

/** House style, enforced: no em or en dashes, no stray whitespace, no raw nulls, clipped to a length. */
export function tidy(s, n) {
  let t = noNulls(s).replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").replace(/ ,/g, ",").trim();
  if (t.length > n) t = t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
  return t;
}

/** The model's reply as a clean answer, or null when it can't be used. Ids it invents are dropped. */
export function cleanAnswer(raw, ids) {
  if (!raw || typeof raw !== "object") return null;
  const text = tidy(raw.text, 600);
  if (!text) return null;
  const points = (Array.isArray(raw.points) ? raw.points : []).filter((p) => typeof p === "string").map((p) => tidy(p, 240)).filter(Boolean).slice(0, 3);
  const playerIds = [...new Set((Array.isArray(raw.playerIds) ? raw.playerIds : []).map(String))].filter((id) => !ids || ids.players.has(id)).slice(0, 4);
  const teamId = typeof raw.teamId === "string" && raw.teamId && (!ids || ids.teams.has(raw.teamId)) ? raw.teamId : undefined;
  const quip = tidy(raw.quip, 200);
  return { text, points, ...(playerIds.length ? { playerIds } : {}), ...(teamId ? { teamId } : {}), ...(quip ? { quip } : {}) };
}

/** Pull the answer out of a Messages API response: the tool call first, then JSON in text, then plain prose. */
export function answerFrom(msg, ids) {
  const blocks = Array.isArray(msg?.content) ? msg.content : [];
  const tool = blocks.find((b) => b?.type === "tool_use" && b.name === "answer");
  if (tool) return cleanAnswer(tool.input, ids);
  const text = blocks.filter((b) => b?.type === "text").map((b) => b.text).join("\n").trim();
  if (!text) return null;
  const json = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  if (json.startsWith("{")) {
    try { return cleanAnswer(JSON.parse(json), ids); } catch { return null; }
  }
  // Prose with no structure: still an answer, just without points
  return cleanAnswer({ text, points: [] }, ids);
}

// ---- Handler ---------------------------------------------------------------

const ROAST = /\broast\b|\bdunk on\b|\btrash talk\b|\bmake fun\b/i;

export function buildRequest({ question, league, facts, history }, quip) {
  const turns = [];
  for (const h of history) {
    turns.push({ role: "user", content: h.q });
    turns.push({ role: "assistant", content: h.a });
  }
  // The league snapshot leads the last turn and is marked cacheable, so follow-ups in a session read it from cache
  const content = [
    { type: "text", text: `<league_data>\n${league}\n</league_data>`, cache_control: { type: "ephemeral" } },
    { type: "text", text: `${facts ? `<computed_facts>\n${facts}\n</computed_facts>\n\n` : ""}QUIP: ${quip ? "YES" : "NO"}\n\nQuestion: ${question}` },
  ];
  turns.push({ role: "user", content });
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "answer" },
    messages: turns,
  };
}

/**
 * Runs one model call through the guard: admit, call, record. Without a guard (unit tests) it just calls. Shared with
 * api/lineup.js. Resolves like callModel, or { ok: false, status, body } when the guard refuses.
 */
export async function guardedCall(guard, req, key, request, timeoutMs) {
  let ticket = null;
  if (guard) {
    const a = await guard.admit(req, request);
    if (!a.ok) return a;
    ticket = a.ticket;
  }
  const r = await callModel(key, request, timeoutMs);
  if (guard) await guard.record(ticket, r.ok ? r.msg?.usage ?? null : null, { billed: !r.ok && r.status === 504 });
  return r;
}

/** `guard` is api/_lib/guard.js's createGuard(); the deployed handler (the default export) always has one. */
export function createHandler({ env = process.env, rand = Math.random, timeoutMs = TIMEOUT_MS, guard = null } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "method not allowed" }); }
    const key = env.ANTHROPIC_API_KEY;
    if (!key) return res.status(503).json({ error: "ai_unavailable", reason: "no_key" });
    if (guard) { const g = await guard.check(req); if (!g.ok) return res.status(g.status).json(g.body); }
    const input = readBody(req);
    if (input.status) return res.status(input.status).json({ error: input.error });
    if (limited(ipOf(req))) { res.setHeader("Retry-After", "60"); return res.status(429).json({ error: "too many questions, try again in a minute" }); }

    const quip = ROAST.test(input.question) || rand() < 0.25;
    const r = await guardedCall(guard, req, key, buildRequest(input, quip), timeoutMs);
    if (!r.ok) return res.status(r.status).json(r.body);
    const answer = answerFrom(r.msg, input.ids);
    if (!answer) return res.status(502).json({ error: "bad model reply" });
    return res.status(200).json({ answer });
  };
}

/**
 * One Messages API call with a timeout. Resolves { ok: true, msg } or { ok: false, status, body } already mapped to
 * what the app expects: an auth or billing problem reads as 503 "unavailable", so the app falls back the same way it
 * does with no key; a timeout is 504; anything else upstream is 502 (429 passes through). Shared by api/lineup.js.
 */
export async function callModel(key, request, timeoutMs = TIMEOUT_MS) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(request),
      signal: ctl.signal,
    });
    if (!r.ok) {
      const status = r.status === 401 || r.status === 403 ? 503 : r.status === 429 ? 429 : 502;
      return { ok: false, status, body: { error: status === 503 ? "ai_unavailable" : "upstream error", upstream: r.status } };
    }
    return { ok: true, msg: await r.json() };
  } catch (e) {
    if (e?.name === "AbortError" || ctl.signal.aborted) return { ok: false, status: 504, body: { error: "timed out" } };
    return { ok: false, status: 502, body: { error: "upstream error" } };
  } finally {
    clearTimeout(timer);
  }
}

export default createHandler({ guard: createGuard() });
