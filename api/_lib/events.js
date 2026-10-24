// Usage counts, the own-counter half of Source's analytics (Zach, Oct 24). The app keeps anonymous funnel events in the
// browser (src/track.ts) and sends them along with a call it's already making to Source AI (api/ask.js,
// api/lineup.js). They're written here as one Blob per call at events/YYYY-MM-DD/<id>.json, after the reply has gone
// out. Each event is a known name, a day, a ref tag, a device size and whether it was the sample league. No user id,
// no league, no IP. Kept 12 months, swept like the Ask log. Off with EVENTS_LOG=off or no Blob store. Never throws.
import { utcDay } from "./guard.js";

const NAMES = new Set([
  "username_entered", "leagues_found", "no_leagues", "lookup_failed", "league_opened", "demo_started", "ideas_viewed",
  "deal_built", "pitch_shared", "return_week", "ask_used", "lineup_run", "waivers_viewed", "sync_paired", "ref_visit",
]);
const DEVS = new Set(["phone", "tablet", "desktop"]);
const tag = (v) => (typeof v === "string" ? v.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) : "");

/** Only well-formed events, at most 60, with nothing but the allowed fields */
export function cleanEvents(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const x of raw.slice(0, 60)) {
    if (!x || !NAMES.has(x.e) || typeof x.d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.d)) continue;
    const ev = { e: x.e, d: x.d, dev: DEVS.has(x.dev) ? x.dev : "desktop" };
    const ref = tag(x.ref); if (ref) ev.ref = ref;
    const via = tag(x.via); if (via) ev.via = via;
    if (x.demo === 1) ev.demo = 1;
    out.push(ev);
  }
  return out;
}

let sweptOn = "";
async function sweep(blob, day, limit = 200) {
  try {
    const cutoff = `${Number(day.slice(0, 4)) - 1}${day.slice(4)}`;
    const paths = await blob.list("events/", limit);
    for (const path of paths) {
      if (path.slice(7, 17) >= cutoff) break;
      await blob.remove(path);
    }
  } catch { /* next day tries again */ }
}

/** Saves one call's events. Resolves either way; at most `timeoutMs` of the function's time. */
export async function logEvents(blob, raw, { env = process.env, timeoutMs = 2000, now = Date.now() } = {}) {
  const ev = cleanEvents(raw);
  if (!ev.length || env.EVENTS_LOG === "off" || !blob?.ready?.()) return false;
  const day = utcDay(now);
  const id = `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  try {
    await Promise.race([blob.write(`events/${day}/${id}.json`, { at: now, ev }), new Promise((_, no) => setTimeout(() => no(new Error("slow")), timeoutMs))]);
    if (sweptOn !== day) { sweptOn = day; await sweep(blob, day); }
    return true;
  } catch { return false; }
}
