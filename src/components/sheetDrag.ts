import { useEffect, useRef } from "react";
import type { SpringRun } from "./sheetSpring";

type Ref<T> = { current: T | null };

/** The managed form: the hook moves the sheet and its scrim itself and springs it home or away on release. */
export interface PullOptions {
  /** The scrim behind the sheet; its opacity follows the pull. */
  scrim?: Ref<HTMLElement>;
  /** False where the surface isn't a bottom sheet (the centered modal from 768px), so it stays put. */
  enabled?: () => boolean;
  /** Called once the sheet has left the screen. Close without animating again (the usual close() is fine). */
  onDismiss: () => void;
}

// Motion's spring loads in its own chunk on first use; preloadOverlays (lazy.tsx) fetches it once the app is idle.
let kit: typeof import("./sheetSpring") | null = null;
let kitLoad: Promise<unknown> | null = null;
export function loadSheetSpring() {
  if (!kitLoad) kitLoad = import("./sheetSpring").then((m) => { kit = m; }, () => { kitLoad = null; });
  return kitLoad;
}

// Apple's momentum projection (Designing Fluid Interfaces, WWDC 2018): where a flick would come to rest
const project = (v: number, d = 0.998) => ((v / 1000) * d) / (1 - d);
// Past the top the sheet resists, and the harder you pull the less it gives
const rubberband = (x: number, dim = 200, c = 0.55) => (x * dim * c) / (dim + c * Math.abs(x));
/**
 * Reduced motion, read straight from the media query. This hook sits in the first-paint bundle, and importing even
 * useReducedMotion from motion/react there let the bundler pull Motion's whole React entry into it (about 34KB
 * gzipped), so Motion itself stays in the lazy chunks. Same query, read when a gesture starts, so it's always current.
 */
const prefersReduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Where the sheet is on screen right now, mid transition or mid spring included. */
const liveY = (el: HTMLElement) => {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  try { return new DOMMatrixReadOnly(t).m42; } catch { return 0; }
};

/**
 * Pull a bottom sheet down from anywhere on it. The drag only starts when the sheet is scrolled to the top and the
 * finger moves down, so normal scrolling inside the sheet still works. Fields and sliders keep their own gestures.
 * The sheet tracks the finger 1:1, resists past the top, and on release Motion springs it with the finger's velocity:
 * home when it would come to rest near the top (a flick earns a little bounce), away when it would land past half
 * the sheet (or 240px). A sheet caught mid-animation (entering, springing home, leaving) follows the finger from the spot
 * it's at. With reduced motion the sheet doesn't move: the pull fades it, and release fades it out or back.
 *
 * Two forms:
 * - `usePullToDismiss(sheet, { scrim, enabled, onDismiss })`: the hook does the moving and the springs.
 * - `usePullToDismiss(sheet, onMove, onRelease)`: you do (PitchSheet runs its own springs). `onMove` gets the
 *   sheet's offset (already rubber-banded), `onRelease` the offset and velocity in px/s.
 */
export function usePullToDismiss(sheet: Ref<HTMLElement>, opts: PullOptions): void;
export function usePullToDismiss(sheet: Ref<HTMLElement>, onMove: (y: number) => void, onRelease: (y: number, velocity: number) => void): void;
export function usePullToDismiss(
  sheet: Ref<HTMLElement>,
  a: PullOptions | ((y: number) => void),
  b?: (y: number, velocity: number) => void,
) {
  const run = useRef<SpringRun | null>(null);
  // Where the last spring was taking the sheet, so a tap that catches it mid-way lets it carry on there
  const heading = useRef<"home" | "away">("home");
  const managed = typeof a === "function" ? null : a;
  const onMove = typeof a === "function" ? a : null;

  useEffect(() => { if (managed && !prefersReduced()) loadSheetSpring(); }, [!!managed]); // eslint-disable-line react-hooks/exhaustive-deps
  // Stop a spring that's still running when the sheet unmounts
  useEffect(() => () => { run.current?.stop(); run.current = null; }, []);

  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    let startY = 0, startX = 0, origin = 0, dragging = false, decided = false, hist: { y: number; t: number }[] = [];
    // caught: held mid-animation (managed). pending: mid-animation, caught on the first move (PitchSheet's own springs).
    let caught = false, pending = false, moved = false, reduce = prefersReduced();
    // A sheet with a fixed header scrolls an inner body (marked data-sheet-scroll); read that one
    let scroller: Element = el;
    const skip = (t: EventTarget | null) => t instanceof Element && !!t.closest("textarea, input, select, [contenteditable], .no-pull");
    const scrim = () => managed?.scrim?.current ?? null;
    const on = () => !managed || (managed.enabled?.() ?? true);

    // Managed: write the offset straight to the DOM. A full translate3d keeps it on the compositor.
    const apply = (y: number) => {
      const s = scrim(), h = el.offsetHeight || 600;
      const o = String(clamp01(1 - y / h));
      if (reduce) {
        el.style.setProperty("transition", "none", "important"); el.style.opacity = o;
      } else {
        el.style.transition = "none"; el.style.transform = `translate3d(0, ${y}px, 0)`;
      }
      if (s) { s.style.setProperty("transition", "none", "important"); s.style.opacity = o; }
    };
    /** Hand the sheet back to its stylesheet (at rest, or for the close transition). */
    const release = () => {
      el.style.removeProperty("transition"); el.style.transform = ""; el.style.opacity = "";
      const s = scrim(); if (s) { s.style.removeProperty("transition"); s.style.opacity = ""; }
    };
    // A spring frame after the sheet started closing some other way (the X, Escape, Back) stops the spring
    const springFrame = (y: number) => {
      if (el.parentElement && !el.parentElement.classList.contains("in")) { run.current?.stop(); run.current = null; return; }
      apply(y);
    };

    const settle = (y: number, v: number, to?: "home" | "away") => {
      const m = managed!;
      const h = el.offsetHeight || 600;
      // Away once it would come to rest past half the sheet (240px at most, for the tall ones)
      const away = to ? to === "away" : y + project(v) > Math.min(h * 0.5, 240);
      heading.current = away ? "away" : "home";
      if (reduce) {
        // Opacity only: the stylesheet's 160ms fade carries it out or back
        el.style.removeProperty("transition");
        const s = scrim(); if (s) s.style.removeProperty("transition");
        if (away) { el.style.opacity = "0"; if (s) s.style.opacity = "0"; window.setTimeout(m.onDismiss, 160); }
        else release();
        return;
      }
      if (!kit) { if (away) m.onDismiss(); else release(); return; } // spring not here yet: the CSS transition does it
      if (away) {
        // Leave the way it came in: straight down, no bounce, at the finger's speed
        run.current = kit.spring(y, h + 40, Math.max(v, 0), 1, 0.3, springFrame, () => { run.current = null; m.onDismiss(); });
      } else {
        // Home. Critically damped, unless it was flicked: then a little bounce
        run.current = kit.spring(y, 0, v, Math.abs(v) > 700 ? 0.8 : 1, 0.3, springFrame, () => { run.current = null; release(); });
      }
    };

    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1 || skip(e.target) || !on()) { decided = true; dragging = false; return; }
      startY = e.touches[0].clientY; startX = e.touches[0].clientX;
      scroller = el.querySelector("[data-sheet-scroll]") ?? el;
      hist = [{ y: startY, t: performance.now() }];
      caught = false; pending = false; moved = false; reduce = prefersReduced();
      origin = reduce ? 0 : liveY(el);
      if (Math.abs(origin) > 1) {
        // Caught mid-animation (entering, springing home or leaving): it stops under the finger and follows it from
        // right there. A tap that doesn't move lets it carry on where it was going.
        decided = true; dragging = true;
        if (managed) { run.current?.stop(); run.current = null; caught = true; apply(origin); }
        else pending = true;
        return;
      }
      origin = 0; dragging = false; decided = false; heading.current = "home";
    };
    const move = (e: TouchEvent) => {
      if (decided && !dragging) return;
      const y = e.touches[0].clientY, dy = y - startY, dx = e.touches[0].clientX - startX;
      if (!decided) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        decided = true;
        dragging = dy > 0 && Math.abs(dy) > Math.abs(dx) && scroller.scrollTop <= 0;
        if (!dragging) return;
        startY = y; // start tracking from here so the sheet doesn't jump
        run.current?.stop(); run.current = null;
      }
      if (pending) {
        if (Math.abs(dy) < 1) return;
        pending = false; origin = liveY(el); startY = y; // PitchSheet stops its spring in onMove
      }
      if (Math.abs(dy) >= 6) moved = true;
      e.preventDefault();
      const now = performance.now();
      hist = [...hist.slice(-4), { y, t: now }];
      const raw = origin + (y - startY);
      const off = raw < 0 ? rubberband(raw) : raw; // 1:1 down, resisting up
      if (managed) apply(off); else onMove?.(off);
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      if (pending) { pending = false; return; } // a tap on a moving PitchSheet: its spring never stopped
      if (caught && !moved) { settle(origin, 0, heading.current); return; }
      const first = hist[0], last = hist[hist.length - 1];
      // A finger that stopped before lifting carries no velocity
      const v = last && first && last.t > first.t && performance.now() - last.t < 80 ? ((last.y - first.y) / (last.t - first.t)) * 1000 : 0;
      const raw = origin + ((last?.y ?? startY) - startY);
      const off = raw < 0 ? rubberband(raw) : raw;
      if (managed) settle(off, v); else b?.(off, v);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }); // re-binds each render so the callbacks always see current state
}
