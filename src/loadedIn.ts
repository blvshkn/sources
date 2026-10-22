/** Skeleton to content: true for the content's first moments after a load that actually showed a skeleton, so the
 *  content can fade in over 180ms (`.sk-in` in loadin.css) instead of snapping in. A cache hit never paints the
 *  skeleton, so it never fades: the content is just there. Pass `key` (a week, a player id) so switching to something
 *  already cached right after a load doesn't borrow the previous fade.
 *
 *  "Painted" means a frame's animation callback ran with `loading` true, so that frame draws the skeleton (no task can
 *  slip in between the callback and the paint); a load that settles before then swaps without a fade. The flag clears
 *  itself after the fade has had time to run, so a later remount of the same content doesn't replay it. Keys compare
 *  by identity, so pass a primitive (a week number, an id), not an object rebuilt on every render. */
import { useEffect, useRef, useState } from "react";

const HOLD_MS = 400;

export function useLoadedIn(loading: boolean, key?: unknown): boolean {
  const painted = useRef(false);
  const [s, setS] = useState({ loading, key, fade: false });
  // Derived during render, so the very first commit of the content already carries the class
  if (s.loading !== loading || s.key !== key) {
    const fade = s.loading && !loading && painted.current && s.key === key;
    setS({ loading, key, fade });
  }
  useEffect(() => {
    if (!loading) { painted.current = false; return; }
    const a = requestAnimationFrame(() => { painted.current = true; });
    return () => cancelAnimationFrame(a);
  }, [loading, key]);
  useEffect(() => {
    if (!s.fade) return;
    const t = setTimeout(() => setS((x) => (x.fade ? { ...x, fade: false } : x)), HOLD_MS);
    return () => clearTimeout(t);
  }, [s.fade]);
  return s.fade;
}
