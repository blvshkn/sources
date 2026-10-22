// Per-browser storage and media query hooks, shared by the session wrapper (App.tsx) and the signed-in app (Shell.tsx).
import { useEffect, useState } from "react";

export const store = {
  get<T>(k: string, fallback: T): T {
    try { const v = localStorage.getItem(`sources.${k}`); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
  },
  set(k: string, v: unknown) { try { localStorage.setItem(`sources.${k}`, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  clear() { try { Object.keys(localStorage).filter((k) => k.startsWith("sources.")).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ } },
};
/** True while a media query matches. Read synchronously on first render so the layout never flashes. */
export const matches = (q: string) => { try { return window.matchMedia(q).matches; } catch { return false; } };
export const useMedia = (q: string) => {
  const [m, setM] = useState(() => matches(q));
  useEffect(() => {
    let l: MediaQueryList; try { l = window.matchMedia(q); } catch { return; }
    const on = () => setM(l.matches);
    on(); l.addEventListener("change", on);
    return () => l.removeEventListener("change", on);
  }, [q]);
  return m;
};

export const usePersist = <T,>(k: string, init: T, fix?: (saved: unknown) => T) => {
  const [v, setV] = useState<T>(() => (fix ? fix(store.get<unknown>(k, init)) : store.get(k, init)));
  useEffect(() => store.set(k, v), [k, v]);
  return [v, setV] as const;
};
