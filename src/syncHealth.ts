/** Whether the app's background reads from Sleeper are getting through: live scoring's refresh (live.ts) and the trade
 *  check for sent offers (App.tsx). One failure is a blip; two in a row says so on the sync line (SyncLine.tsx), with
 *  Retry. The screen keeps the last good read the whole time. Demo leagues never read, so this stays quiet there. */
import { useEffect, useState } from "react";

export type SyncHealth = { state: "ok" | "syncing" | "err"; /** ms since epoch of the last good read this visit, 0 before one */ at: number; /** bumps when the state changes */ n: number };

let health: SyncHealth = { state: "ok", at: 0, n: 0 };
let misses = 0;
const subs = new Set<(h: SyncHealth) => void>();
const retries = new Set<() => Promise<boolean>>();
const set = (state: SyncHealth["state"], at: number) => {
  health = { state, at, n: health.n + (state !== health.state ? 1 : 0) };
  subs.forEach((f) => f(health));
};

/** A background read finished: `ok` false when Sleeper couldn't be reached. */
export function reportSync(ok: boolean) {
  if (ok) { misses = 0; set("ok", Date.now()); return; }
  misses++;
  if (misses >= 2 && health.state === "ok") set("err", health.at);
}

/** How to read again when you press Retry. Resolves true when the read got through. Returns the unregister. */
export function onRetry(fn: () => Promise<boolean>): () => void {
  retries.add(fn);
  return () => { retries.delete(fn); };
}

/** Retry: every registered read once. Shows syncing while they run, then ok or the error again. */
export async function retrySync() {
  if (health.state === "syncing") return;
  set("syncing", health.at);
  const rs = await Promise.all([...retries].map((f) => f().catch(() => false)));
  if (rs.length && rs.every(Boolean)) { misses = 0; set("ok", Date.now()); } else set("err", health.at);
}

export function useSyncHealth(): SyncHealth {
  const [h, setH] = useState(health);
  useEffect(() => { subs.add(setH); setH(health); return () => { subs.delete(setH); }; }, []);
  return h;
}
