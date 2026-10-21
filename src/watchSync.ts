// The Waivers watchlist across devices. Same shape as offerSync.ts: in a live Sleeper league the set in this browser is
// what the screen shows (instant, works offline, cached in localStorage by App), and this hook keeps it in step with
// /api/watch for this Sleeper user:
//   - on start, and whenever the window gets focus or becomes visible again, it pulls the server's set and merges it
//   - every change here is already stamped (editWatch in App), and pushed after a short pause; a failed push retries
//     with backoff, and a refused one waits for the next focus
//   - an un-watch is a tombstone in the set itself, so other devices drop the player too
// Merge rules are shared with the server (watchMerge.js). Demo leagues never sync. Nothing about syncing shows on
// screen: when it fails the list just stays on this device until the next try.
import { useCallback, useEffect, useRef } from "react";
import { mergeWatch, sameWatch, type WatchSet } from "./watchMerge.js";

const PUSH_DELAY = 800;

export function useWatchSync({ enabled, league, user, set, setSet }: {
  enabled: boolean; league: string; user: string; set: WatchSet; setSet: (s: WatchSet) => void;
}): { forget: () => void } {
  const on = enabled && /^\d+$/.test(league) && /^\d+$/.test(user);
  const url = `/api/watch?league=${encodeURIComponent(league)}&user=${encodeURIComponent(user)}`;

  const setRef = useRef(set);
  setRef.current = set;
  /** The set this hook last handed to setSet, so the change watcher can tell a merge from an edit */
  const applied = useRef<WatchSet | null>(null);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>();
  const tries = useRef(0);
  const busy = useRef(false);
  const stopped = useRef(false);

  useEffect(() => { applied.current = null; tries.current = 0; stopped.current = false; }, [on, url]);

  const apply = useCallback((next: WatchSet) => {
    if (sameWatch(next, setRef.current)) return;
    applied.current = next;
    setRef.current = next;
    setSet(next);
  }, [setSet]);

  /** A refused request or no store waits for the next focus; anything else retries with backoff */
  const failed = useCallback((status: number, retry: () => void) => {
    if (status === 503 || (status >= 400 && status < 500)) { stopped.current = true; return; }
    const wait = Math.min(60000, 2000 * 2 ** tries.current++);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(retry, wait);
  }, []);

  const send = (keepalive = false) => fetch(url, {
    method: "PUT", headers: { "content-type": "application/json" }, cache: "no-store", keepalive,
    body: JSON.stringify({ watch: mergeWatch(setRef.current) }),
  });

  const push = useCallback(async (): Promise<void> => {
    if (!on || stopped.current) return;
    if (busy.current) { dirty.current = true; return; }
    busy.current = true;
    dirty.current = false;
    try {
      const r = await send();
      if (!r.ok) { dirty.current = true; failed(r.status, () => void push()); return; }
      const server = (await r.json() as { watch?: WatchSet }).watch ?? {};
      apply(mergeWatch(setRef.current, server));
      tries.current = 0;
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
    if (!on || busy.current) return;
    stopped.current = false;
    busy.current = true;
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) { failed(r.status, () => void pull()); return; }
      const server = (await r.json() as { watch?: WatchSet }).watch ?? {};
      const merged = mergeWatch(setRef.current, server);
      apply(merged);
      tries.current = 0;
      // This device had something the server didn't (the old local list, a change made offline): send it up
      if (dirty.current || !sameWatch(merged, server)) schedule();
    } catch {
      failed(0, () => void pull());
    } finally {
      busy.current = false;
    }
  }, [on, url, apply, failed, schedule]);

  // Start, and come back up to date whenever this device is picked up again
  useEffect(() => {
    if (!on) return;
    void pull();
    const wake = () => { if (document.visibilityState !== "hidden") void pull(); };
    // Leaving with a change not sent yet: one last try that outlives the page
    const leave = () => { if (dirty.current && !stopped.current) { try { void send(true).catch(() => {}); } catch { /* best effort */ } } };
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

  // Every edit here (anything but a set this hook just merged in) goes up after a short pause
  const seen = useRef(set);
  useEffect(() => {
    if (set === seen.current) return;
    seen.current = set;
    if (!on || set === applied.current) return;
    schedule();
  }, [set, on]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Delete my data: remove this league's synced copy too */
  const forget = useCallback(() => {
    if (!on) return;
    stopped.current = true;
    window.clearTimeout(timer.current);
    try { void fetch(url, { method: "DELETE", keepalive: true }).catch(() => {}); } catch { /* best effort */ }
  }, [on, url]);

  return { forget };
}
