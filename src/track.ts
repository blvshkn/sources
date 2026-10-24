/**
 * Usage counts (Zach, Oct 24: "Vercel + own counter"). Anonymous and cookieless: an event is a name, the day, where the
 * visit came from (?ref=), whether it's the sample league and the device size. No user id, no league id, no names.
 *
 * Two places it goes:
 * 1. Vercel Web Analytics custom events (window.va, loaded in index.html). Page views and referrers come from there
 *    on their own. Custom events show in the dashboard on plans that include them; elsewhere they're ignored.
 * 2. Our own counter: events wait in this browser (at most 60) and ride along with the next call the app already
 *    makes to Source AI (Ask, Set optimal lineup), where api/_lib/events.js writes them as one Blob. No new requests.
 *
 * Never runs inside the landing's phone frames or for automated browsers. Each "once" event counts once per day.
 */
import { isAutomated } from "./automation";

export type EventName =
  | "username_entered" | "leagues_found" | "no_leagues" | "lookup_failed" | "league_opened" | "demo_started"
  | "ideas_viewed" | "deal_built" | "pitch_shared" | "return_week" | "ask_used" | "lineup_run" | "waivers_viewed"
  | "sync_paired" | "ref_visit";

export type Ev = { e: EventName; d: string; ref?: string; demo?: 1; dev: "phone" | "tablet" | "desktop"; via?: string };

const QUEUE = "source.ev";
const ONCE = "source.ev.once";
const REF = "source.ref";
const MAX = 60;

const inFrame = () => { try { return new URLSearchParams(location.search).get("frame") === "demo" || window.top !== window.self; } catch { return true; } };
const off = () => typeof window === "undefined" || inFrame() || isAutomated();
const day = () => new Date().toISOString().slice(0, 10);
const dev = (): Ev["dev"] => (innerWidth < 600 ? "phone" : innerWidth < 1024 ? "tablet" : "desktop");
const read = <T,>(k: string, store: Storage, fallback: T): T => { try { const v = store.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };
const write = (k: string, v: unknown, store: Storage) => { try { store.setItem(k, JSON.stringify(v)); } catch { /* storage off: the count is lost */ } };

/** Where this visit came from: ?ref= (card, discord, ad-728x90...) or utm_source, kept for the session */
export function captureRef() {
  if (off()) return;
  try {
    const q = new URLSearchParams(location.search);
    const r = (q.get("ref") || q.get("utm_source") || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
    if (r) { sessionStorage.setItem(REF, r); track("ref_visit"); }
  } catch { /* fine */ }
}
const refNow = () => { try { return sessionStorage.getItem(REF) || undefined; } catch { return undefined; } };

/** Count one event. `once`: at most once a day in this browser. `demo`: it happened in the sample league. */
export function track(e: EventName, { once = false, demo = false, via }: { once?: boolean; demo?: boolean; via?: string } = {}) {
  if (off()) return;
  const d = day();
  if (once) {
    const seen = read<Record<string, string>>(ONCE, localStorage, {});
    if (seen[e] === d) return;
    seen[e] = d; write(ONCE, seen, localStorage);
  }
  const ref = refNow();
  const ev: Ev = { e, d, dev: dev(), ...(ref ? { ref } : {}), ...(demo ? { demo: 1 as const } : {}), ...(via ? { via: via.slice(0, 24) } : {}) };
  try { (window as unknown as { va?: (k: string, p: unknown) => void }).va?.("event", { name: e, data: { ...(ref ? { ref } : {}), ...(demo ? { demo: "1" } : {}), ...(via ? { via } : {}), dev: ev.dev } }); } catch { /* fine */ }
  const q = read<Ev[]>(QUEUE, localStorage, []);
  q.push(ev);
  write(QUEUE, q.slice(-MAX), localStorage);
}

/** The waiting events, taken to send along with a call already being made */
export function takeEvents(): Ev[] {
  if (off()) return [];
  const q = read<Ev[]>(QUEUE, localStorage, []);
  if (q.length) write(QUEUE, [], localStorage);
  return q;
}
/** The call failed: keep them for the next one */
export function putBack(evs: Ev[]) {
  if (!evs.length) return;
  write(QUEUE, [...evs, ...read<Ev[]>(QUEUE, localStorage, [])].slice(-MAX), localStorage);
}

/** A visit in a later NFL week than the last one counts as a return */
export function trackReturn(week: number, demo: boolean) {
  if (off() || demo || !week) return;
  const last = read<number>("source.ev.week", localStorage, 0);
  if (last && week > last) track("return_week", { once: true });
  if (week !== last) write("source.ev.week", week, localStorage);
}
