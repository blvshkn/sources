import { useEffect, useState } from "react";
import { Player } from "./data";

export interface NewsItem { source: string; title: string; summary: string; url: string; at: number | null }

let cache: NewsItem[] | null = null;
let pending: Promise<NewsItem[]> | null = null;
const subs = new Set<(n: NewsItem[]) => void>();

/** Fetch the merged feed once per session (our server route caches it for 10 minutes). */
function load(): Promise<NewsItem[]> {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch("/api/news").then((r) => (r.ok ? r.json() : { items: [] })).then((d) => (cache = (d.items ?? []) as NewsItem[]))
    .catch(() => (cache = [])).finally(() => { subs.forEach((f) => f(cache!)); });
  return pending;
}

export function useNews(): NewsItem[] {
  const [items, setItems] = useState<NewsItem[]>(cache ?? []);
  useEffect(() => { subs.add(setItems); load(); return () => { subs.delete(setItems); }; }, []);
  return items;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ");
/** Stories that name this player in the headline or summary (full name match, so "Allen" alone doesn't count). */
export function newsFor(items: NewsItem[], p: Pick<Player, "name">): NewsItem[] {
  const n = ` ${norm(p.name)} `;
  return items.filter((i) => ` ${norm(i.title)} ${norm(i.summary)} `.includes(n));
}

/** "12m", "3h", "2d" */
export const ago = (at: number | null) => {
  if (!at) return "";
  const m = Math.max(1, Math.round((Date.now() - at) / 60000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};
