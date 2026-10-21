import { useSyncExternalStore } from "react";

/** What the trade builder's roster cards show per player: market value or projected points. One setting for every
 *  card, so flipping it on your roster flips theirs too. Remembered on this device. */
export type RosterMetric = "value" | "proj";
const KEY = "sources.rosterMetric";
const subs = new Set<() => void>();
let cur: RosterMetric = (() => { try { return localStorage.getItem(KEY) === "value" ? "value" : "proj"; } catch { return "proj"; } })();

export function setRosterMetric(m: RosterMetric) {
  if (m === cur) return;
  cur = m;
  try { localStorage.setItem(KEY, m); } catch { /* private mode: still works for this visit */ }
  subs.forEach((f) => f());
}
export function useRosterMetric(): RosterMetric {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => cur, () => cur);
}
