// Sent offers across devices. In a live Sleeper league the list in this browser stays the source of truth for the
// screen (instant, works offline), and this hook keeps it in step with /api/offers for this Sleeper user:
//   - on start, and whenever the window gets focus or becomes visible again, it pulls the server's list and merges it
//   - every change here is stamped (updatedAt), and pushed after a short pause; a failed push retries with backoff
//   - a cleared offer leaves a tombstone so other devices drop it too (kept under `sources.<league>.sentOffers.gone.v1`)
//   - offers saved before sync existed have no stamp yet; the first sync uploads them
// Merge rules are shared with the server (offerMerge.js). Demo leagues never sync. When the server has no store
// (503) or can't be reached, nothing changes on screen: the list stays on this device and the note says so.
// Every call carries this device's sync key (syncKey.ts). A 401 means another device holds the key: syncing stops
// quietly, the list here keeps working, and the state reads "pair" until this device is paired.
import { useCallback, useEffect, useRef, useState } from "react";
import type { SentOffer } from "./sentOffers";
import { mergeOffers, stampOf, type OfferSet } from "./offerMerge.js";
import { ensureKey, markNeedsPair, useSyncStatus } from "./syncKey";

export type SyncState = "off" | "syncing" | "synced" | "unavailable" | "offline" | "pair";

const PUSH_DELAY = 800;
/** The least time between catch-up pulls when the window comes back */
const WAKE_GAP = 60_000;
const sig = ({ updatedAt: _u, ...o }: SentOffer) => JSON.stringify(o);
const sigs = (list: SentOffer[]) => new Map(list.map((o) => [o.id, sig(o)]));
/** Same records at the same stamps, in any order */
const sameSet = (a: SentOffer[], b: SentOffer[]) =>
  a.length === b.length && a.map((o) => `${o.id}:${stampOf(o)}`).sort().join() === b.map((o) => `${o.id}:${stampOf(o)}`).sort().join();
const sameGone = (a: Record<string, number>, b: Record<string, number>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

const readGone = (k: string): Record<string, number> => {
  try { const v = JSON.parse(localStorage.getItem(k) ?? "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; }
};
const writeGone = (k: string, v: Record<string, number>) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

export function useOfferSync({ enabled, league, user, sent, setSent }: {
  enabled: boolean; league: string; user: string; sent: SentOffer[]; setSent: (list: SentOffer[]) => void;
}): { state: SyncState; forget: () => void } {
  const on = enabled && /^\d+$/.test(league) && /^\d+$/.test(user);
  const url = `/api/offers?league=${encodeURIComponent(league)}&user=${encodeURIComponent(user)}`;
  const goneKey = `sources.${league}.sentOffers.gone.v1`;
  const [state, setState] = useState<SyncState>(on ? "syncing" : "off");
  const { needsPair, wake } = useSyncStatus(on ? user : "");
  const needsRef = useRef(needsPair);
  needsRef.current = needsPair;
  /** Headers with this device's key, or null when storage can't keep one (then this device doesn't sync) */
  const auth = (json = false): Record<string, string> | null => {
    const key = ensureKey(user);
    return key ? { ...(json ? { "content-type": "application/json" } : {}), "X-Sync-Key": key } : null;
  };

  const sentRef = useRef(sent);
  sentRef.current = sent;
  const gone = useRef<Record<string, number>>({});
  const prev = useRef<Map<string, string> | null>(null);
  /** The list this hook last handed to setSent, so the change watcher can tell a merge from an edit */
  const applied = useRef<SentOffer[] | null>(null);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>();
  const tries = useRef(0);
  const busy = useRef(false);
  const stopped = useRef(false);

  // A new league or user starts over
  useEffect(() => {
    gone.current = on ? readGone(goneKey) : {};
    prev.current = null;
    applied.current = null;
    tries.current = 0;
    stopped.current = false;
    setState(on ? "syncing" : "off");
  }, [on, goneKey]);

  const apply = useCallback((set: OfferSet) => {
    if (!sameGone(set.gone, gone.current)) { gone.current = set.gone; writeGone(goneKey, set.gone); }
    if (sameSet(set.offers, sentRef.current)) return;
    applied.current = set.offers;
    sentRef.current = set.offers;
    setSent(set.offers);
  }, [goneKey, setSent]);

  const local = () => ({ offers: sentRef.current, gone: gone.current });

  /** What a failed request means: no store or a refused body stops syncing; anything else retries */
  const failed = useCallback((status: number, retry: () => void) => {
    if (status === 401) { stopped.current = true; window.clearTimeout(timer.current); markNeedsPair(user); setState("pair"); return; }
    if (status === -1 || status === 503 || (status >= 400 && status < 500)) { stopped.current = true; setState("unavailable"); return; }
    setState("offline");
    const wait = Math.min(60000, 2000 * 2 ** tries.current++);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(retry, wait);
  }, [user]);

  const push = useCallback(async (): Promise<void> => {
    if (!on || stopped.current) return;
    if (busy.current) { dirty.current = true; return; }
    busy.current = true;
    dirty.current = false;
    const body = mergeOffers(local());
    const headers = auth(true);
    try {
      if (!headers) { failed(-1, () => {}); return; }
      const r = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body), cache: "no-store" });
      if (!r.ok) { dirty.current = true; failed(r.status, () => void push()); return; }
      apply(mergeOffers(local(), await r.json() as OfferSet));
      tries.current = 0;
      setState("synced");
    } catch {
      dirty.current = true;
      failed(0, () => void push());
    } finally {
      busy.current = false;
    }
    if (dirty.current && !stopped.current) schedule();
  }, [on, url, apply, failed]); // eslint-disable-line react-hooks/exhaustive-deps

  const schedule = useCallback(() => {
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void push(), PUSH_DELAY);
  }, [push]);

  const pull = useCallback(async () => {
    if (!on || busy.current || needsRef.current) return;
    const headers = auth();
    if (!headers) { failed(-1, () => {}); return; }
    stopped.current = false;
    busy.current = true;
    try {
      const r = await fetch(url, { cache: "no-store", headers });
      if (!r.ok) { failed(r.status, () => void pull()); return; }
      const server = await r.json() as OfferSet;
      const merged = mergeOffers(local(), server);
      apply(merged);
      tries.current = 0;
      setState("synced");
      // This device had something the server didn't (an older local offer, an edit made offline): send it up
      if (dirty.current || !sameSet(merged.offers, server.offers ?? []) || !sameGone(merged.gone, server.gone ?? {})) schedule();
    } catch {
      failed(0, () => void pull());
    } finally {
      busy.current = false;
    }
  }, [on, url, apply, failed, schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start, and come back up to date whenever this device is picked up again
  useEffect(() => {
    if (!on) return;
    void pull();
    // One pull per minute at most when you come back (focus and visibility fire together on every tab switch, and
    // each pull is a function call plus Blob reads). Changes you make still push right away.
    let lastWake = Date.now();
    const wake = () => { if (document.visibilityState === "hidden" || Date.now() - lastWake < WAKE_GAP) return; lastWake = Date.now(); void pull(); };
    // Leaving with a change not sent yet: one last try that outlives the page
    const leave = () => {
      if (!dirty.current || stopped.current) return;
      const headers = auth(true);
      if (headers) try { void fetch(url, { method: "PUT", headers, body: JSON.stringify(mergeOffers(local())), keepalive: true }).catch(() => {}); } catch { /* best effort */ }
    };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("pagehide", leave);
      window.clearTimeout(timer.current);
    };
  }, [on, url, pull]); // eslint-disable-line react-hooks/exhaustive-deps

  // Paired, reset or started fresh on this device: sync again from where the list stands
  useEffect(() => {
    if (!on) return;
    if (needsPair) { stopped.current = true; window.clearTimeout(timer.current); setState("pair"); return; }
    if (wake > 0) { stopped.current = false; dirty.current = true; void pull(); }
  }, [on, needsPair, wake]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every edit here: stamp what changed, tombstone what went, then push
  useEffect(() => {
    if (!on) return;
    if (prev.current === null || sent === applied.current) { prev.current = sigs(sent); return; }
    const before = prev.current, now = Date.now();
    let changed = false, restamped = false;
    const next = sent.map((o) => {
      if (before.get(o.id) === sig(o)) return o;
      changed = true;
      if (gone.current[o.id] != null) { const { [o.id]: _back, ...rest } = gone.current; gone.current = rest; }
      if ((o.updatedAt ?? 0) >= now) return o;
      restamped = true;
      return { ...o, updatedAt: Math.max(now, stampOf(o) + 1) };
    });
    const ids = new Set(sent.map((o) => o.id));
    before.forEach((_, id) => { if (!ids.has(id)) { gone.current = { ...gone.current, [id]: now }; changed = true; } });
    prev.current = sigs(next);
    if (!changed) return;
    writeGone(goneKey, gone.current);
    if (restamped) { applied.current = next; sentRef.current = next; setSent(next); }
    schedule();
  }, [sent, on]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Delete my data: stop here. The synced files, the code and the key go through syncKey.ts (forgetSync). */
  const forget = useCallback(() => {
    stopped.current = true;
    dirty.current = false;
    window.clearTimeout(timer.current);
  }, []);

  return { state, forget };
}
