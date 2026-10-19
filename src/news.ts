import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Player } from "./data";
import { espnId, jerseysReady, rotowireId } from "./jersey";
// @ts-ignore: plain JS module shared with the server route
import { espnPlayerNews, mergeNews } from "../api/news.js";

export type NewsKind = "status" | "move" | "role" | "recap" | "outlook" | "feature";
export interface NewsItem { id: string; source: string; via?: string; title: string; summary: string; url: string; at: number | null; kind?: NewsKind; score?: number }

/** Every source /api/news reads, in the order we credit them. */
export const NEWS_SOURCES = ["RotoWire", "RotoBaller", "ESPN"];
export const sourcesLine = (sep = ", ", last = " and ") => NEWS_SOURCES.slice(0, -1).join(sep) + last + NEWS_SOURCES[NEWS_SOURCES.length - 1];

// ---- Per-player store ------------------------------------------------------
// One request per player (the route is cached 10 minutes at the edge per URL), kept here and in sessionStorage
// so reopening a sheet or switching tabs never waits. Stale entries show at once and refresh behind.

const TTL = 10 * 60e3;
const SKEY = "sources.news.v3.";
type Entry = { at: number; items: NewsItem[] };
const mem = new Map<string, Entry>();
const inflight = new Set<string>();
const queue: (() => Promise<void>)[] = [];
let running = 0;
let version = 0;
const subs = new Set<() => void>();
const bump = () => { version++; subs.forEach((f) => f()); };

const keyOf = (p: Pick<Player, "id" | "name" | "nfl">) => `${p.id}|${p.nfl}`;

function read(key: string): Entry | undefined {
  const m = mem.get(key);
  if (m) return m;
  try {
    const s = JSON.parse(sessionStorage.getItem(SKEY + key) || "null") as Entry | null;
    if (s?.items) { mem.set(key, s); return s; }
  } catch { /* storage unavailable */ }
  return undefined;
}

function pump() {
  while (running < 4 && queue.length) {
    const job = queue.shift()!;
    running++;
    job().finally(() => { running--; pump(); });
  }
}

/** Queue a fetch for this player unless a fresh copy is already here. */
export function loadPlayerNews(p: Pick<Player, "id" | "name" | "nfl" | "pos">) {
  const key = keyOf(p);
  const have = read(key);
  if ((have && Date.now() - have.at < TTL) || inflight.has(key)) return;
  inflight.add(key);
  // Our route covers RotoWire and RotoBaller; ESPN only answers browsers, so it's fetched here and merged in.
  // Ids come from /api/player-numbers: wait for them on a first visit, or RotoWire blurbs lose their link to his page.
  queue.push(() => jerseysReady().then(() => {
    const q = new URLSearchParams({ name: p.name, team: p.nfl, pos: p.pos });
    const espn = espnId(p);
    if (espn) q.set("espn", espn);
    return Promise.all([
      fetch(`/api/news?${q}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ items?: NewsItem[] } | null>,
      (espnPlayerNews({ name: p.name, team: p.nfl, espn: espn ?? "", rotowire: rotowireId(p) ?? "" }) as Promise<NewsItem[]>).catch(() => null),
    ])
      .then(([d, e2]) => {
        // A failed request keeps whatever we had; only a real answer replaces it
        if (!d && !e2) { if (!have) mem.set(key, { at: Date.now() - TTL + 60e3, items: [] }); return; }
        const e = { at: Date.now(), items: mergeNews([e2 ?? [], Array.isArray(d?.items) ? d!.items! : []]) as NewsItem[] };
        mem.set(key, e);
        try { sessionStorage.setItem(SKEY + key, JSON.stringify(e)); } catch { /* full or blocked */ }
      })
      .catch(() => { if (!have) mem.set(key, { at: Date.now() - TTL + 60e3, items: [] }); })
      .finally(() => { inflight.delete(key); bump(); });
  }));
  pump();
}

const useVersion = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => version);

/** Stories for one player, newest first. `loading` is true only until the first answer, so nothing jumps on refresh. */
export function usePlayerNews(p: Player): { items: NewsItem[]; loading: boolean } {
  useVersion();
  useEffect(() => { loadPlayerNews(p); }, [p.id, p.nfl]);
  const e = read(keyOf(p));
  return { items: e?.items ?? [], loading: !e };
}

/** Stories for a list of players (say, your roster). */
export function useRosterNews(players: Player[]): { byId: Map<string, NewsItem[]>; loading: boolean } {
  const v = useVersion();
  const ids = players.map((p) => keyOf(p)).join(",");
  useEffect(() => { players.forEach(loadPlayerNews); }, [ids]);
  return useMemo(() => {
    const byId = new Map<string, NewsItem[]>();
    let missing = 0;
    players.forEach((p) => { const e = read(keyOf(p)); if (e) byId.set(p.id, e.items); else missing++; });
    // Show what has arrived once most of the roster is in; a straggler shouldn't hold the whole card
    return { byId, loading: missing > 0 && missing >= Math.ceil(players.length / 2) };
  }, [v, ids]);
}

// ---- Ranking helpers -------------------------------------------------------

/** Fantasy-relevant first: lifestyle and quote pieces drop out when there are at least two real stories. */
export function meaningful(items: NewsItem[]): NewsItem[] {
  const real = items.filter((i) => i.kind !== "feature");
  return real.length >= 2 ? real : items;
}
export const byImpact = (items: NewsItem[]) => [...meaningful(items)].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.at ?? 0) - (a.at ?? 0));
export const byNewest = (items: NewsItem[]) => [...meaningful(items)].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));

export const KIND_LABEL: Record<NewsKind, string> = { status: "Injury", move: "Transaction", role: "Role", recap: "Game recap", outlook: "Outlook", feature: "Feature" };

// ---- Open-a-player requests (from the inbox) --------------------------------

let wanted: string | null = null;
const wantSubs = new Set<() => void>();
/** Ask whoever lists news (the Wire's news card) to open this player's sheet. */
export function requestPlayer(id: string) { wanted = id; wantSubs.forEach((f) => f()); }
export function usePlayerRequest(): [string | null, () => void] {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((n) => n + 1); wantSubs.add(f); return () => { wantSubs.delete(f); }; }, []);
  return [wanted, () => { wanted = null; }];
}

/** "12m", "3h", "2d" */
export const ago = (at: number | null) => {
  if (!at) return "";
  const m = Math.max(1, Math.round((Date.now() - at) / 60000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};
