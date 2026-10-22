// What every Source AI request carries, and why the last one came back without an answer.
// The server (api/_lib/guard.js) limits calls per Sleeper user for connected leagues and per visitor in the demo, so
// the app sends the connected user's Sleeper id in a header. The demo sends none.
// When a call is refused, the reply says why: "daily_cap" (the day's AI budget is spent) or "daily_limit" (this
// visitor is out of calls today). Everything else (offline, a bot check, a timeout) reads as plain "offline".

let sleeperUser = "";

/** App sets this on every render: the live Sleeper user id, or "" in the demo. */
export function setAiUser(id: string | undefined | null) {
  sleeperUser = id && /^\d{1,24}$/.test(id) ? id : "";
}

/** Headers for a Source AI request. */
export function aiHeaders(): Record<string, string> {
  return { "content-type": "application/json", ...(sleeperUser ? { "x-sources-user": sleeperUser } : {}) };
}

/** Why Source AI didn't answer: the day's budget ran out, this visitor hit today's limit, or anything else. */
export type AiOff = "cap" | "limit" | "offline";

/** Reads a refused reply's reason. Never throws. */
export async function offReason(r: Response | null): Promise<AiOff> {
  if (!r || (r.status !== 503 && r.status !== 429)) return "offline";
  try {
    const d = await r.clone().json() as { reason?: unknown };
    return d?.reason === "daily_cap" ? "cap" : d?.reason === "daily_limit" ? "limit" : "offline";
  } catch {
    return "offline";
  }
}

/** The muted note under a built-in answer. */
export function offNote(why: AiOff | undefined, what: "answer" | "lineup" = "answer"): string {
  const tail = what === "lineup" ? "this is your best lineup by projection." : "this is the built-in answer.";
  if (why === "cap") return `Source AI is resting for today, so ${tail}`;
  if (why === "limit") return `You've used today's Source AI questions, so ${tail}`;
  return `Source AI is offline right now, so ${tail}`;
}
