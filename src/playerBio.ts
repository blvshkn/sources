// Player bios for the player sheet's header and the game log's seasons: age, height, weight, years in the league,
// college and jersey number. A live league reads Sleeper's player file through /api/player-bio (trimmed and cached
// at the edge for a day, and in this browser for 12 hours); jersey numbers come from /api/player-numbers (jersey.ts).
// The demo league reads its own fixture (demoBio.ts). A field Sleeper doesn't have stays undefined and the header
// leaves it out.
import { useSyncExternalStore } from "react";
import { isDemo } from "./data";
import { DEMO_BIO } from "./demoBio";
import { jerseyNumber, sleeperId, useJerseys } from "./jersey";

export interface Bio { age?: number; height?: number; weight?: number; exp?: number; college?: string; number?: number }
type Row = [number | null, number | null, number | null, number | null, string];

let rows: Record<string, Row> | null = null;
let state: "idle" | "loading" | "ready" | "failed" = "idle";
let version = 0;
const listeners = new Set<() => void>();
const bump = () => { version++; listeners.forEach((l) => l()); };
const KEY = "sources.bio.v1";

function load() {
  if (state !== "idle") return;
  state = "loading";
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "null") as { at: number; players: Record<string, Row> } | null;
    if (c?.players) { rows = c.players; state = "ready"; queueMicrotask(bump); if (Date.now() - c.at < 12 * 3600e3) return; }
  } catch { /* storage unavailable */ }
  fetch("/api/player-bio")
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { players?: Record<string, Row> } | null) => {
      if (!d?.players) { if (!rows) state = "failed"; return; }
      rows = d.players; state = "ready";
      try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), players: d.players })); } catch { /* full or blocked */ }
    })
    .catch(() => { if (!rows) state = "failed"; })
    .finally(bump);
}

const v = <T,>(x: T | null | undefined) => (x === null || x === undefined || (x as unknown) === "" ? undefined : x);

/** His bio, or "loading" while the live file is on its way. Defenses have none. */
export function bioFor(p: { id: string; name: string; nfl: string; pos: string }): Bio | "loading" {
  if (p.pos === "DEF") return {};
  if (isDemo()) {
    const d = DEMO_BIO[p.name];
    return d ? { age: d[0], height: d[1], weight: d[2], exp: d[3], college: d[4], number: d[5] } : {};
  }
  load();
  const number = jerseyNumber(p);
  if (state === "loading" && !rows) return "loading";
  const r = rows?.[sleeperId(p) ?? p.id];
  return r ? { age: v(r[0]), height: v(r[1]), weight: v(r[2]), exp: v(r[3]), college: v(r[4]), number } : { number };
}

/** bioFor, re-read when the bio file or the jersey numbers arrive. */
export function useBio(p: { id: string; name: string; nfl: string; pos: string }): Bio | "loading" {
  useJerseys();
  useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => version);
  return bioFor(p);
}

/** 74 -> 6'2" */
export const feet = (inches: number) => `${Math.floor(inches / 12)}'${inches % 12}"`;
