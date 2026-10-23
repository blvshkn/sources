import { useEffect, useState } from "react";

/** A newer build is live (Zach, Oct 23): the app checks /version.json now and then, and when its id differs from the
 *  build that's running, the shell shows a toast that stays until you refresh. Only in the app (not the landing,
 *  not the landing's phones), and never in dev. */
const RUNNING = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "";
const EVERY = 5 * 60 * 1000;

export function useAppUpdate(on: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!on || ready || import.meta.env.DEV || !RUNNING) return;
    let alive = true, last = 0;
    const check = async () => {
      if (!alive || document.visibilityState !== "visible" || Date.now() - last < 30_000) return;
      last = Date.now();
      try {
        const r = await fetch(`/version.json?t=${last}`, { cache: "no-store" });
        if (!r.ok) return;
        const { id } = (await r.json()) as { id?: string };
        if (alive && id && id !== RUNNING) setReady(true);
      } catch { /* offline: try again later */ }
    };
    const t = window.setInterval(check, EVERY);
    const wake = () => { void check(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    void check();
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", wake); window.removeEventListener("focus", wake); window.removeEventListener("online", wake); };
  }, [on, ready]);
  return ready;
}
