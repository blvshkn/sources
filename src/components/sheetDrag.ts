import { useEffect, useLayoutEffect, useRef } from "react";
import type { SpringRun } from "./sheetSpring";
import { mo } from "../motion";

type Ref<T> = { current: T | null };

/** The managed form: the hook moves the sheet and its scrim itself and springs it home or away on release. */
export interface PullOptions {
  /** The scrim behind the sheet; its opacity follows the pull. */
  scrim?: Ref<HTMLElement>;
  /** False where the surface isn't a bottom sheet (the centered modal from 768px), so it stays put. */
  enabled?: () => boolean;
  /** Called once the sheet has left the screen. Close without animating again (the usual close() is fine). */
  onDismiss: () => void;
  /** iOS detents on phones (default on): medium and large, see useDetents. False keeps the sheet at its own height. */
  detents?: boolean;
}

// ---- Detents (phones) ----------------------------------------------------------------------------------------------
// iOS-style: a tall sheet opens at medium (its content height, at most 72% of the screen) and grows to large (the full
// screen less the safe area and a 12px sliver of the page). It's laid out at the large height and translated down to
// medium (--detent-y), so moving between them is a transform, never a height change. A sheet whose content fits
// under medium has no detents: it opens at its own height and only pulls down to close.
const LARGE = "calc(100dvh - env(safe-area-inset-top, 0px) - 12px)";
const PHONE_MAX = 767.98;
interface Detents { on: boolean; off: number; at: "medium" | "large" }
const restOf = (d: Detents) => (d.on && d.at === "medium" ? d.off : 0);
/** Point the stylesheet at a detent (sheet-detents.css): the sheet's resting offset, which the docked actions undo. */
const setRest = (el: HTMLElement, d: Detents, at: Detents["at"]) => { d.at = at; el.dataset.detent = at; el.style.setProperty("--detent-y", `${restOf(d)}px`); };

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
 * - `usePullToDismiss(sheet, onMove, onRelease)`: you do (you run your own springs). `onMove` gets the
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
  const det = useRef<Detents>({ on: false, off: 0, at: "medium" });
  const busy = useRef(false);

  // Measure once laid out (before the sheet slides in), again when the window resizes, and, for a sheet that was
  // short, whenever its content grows.
  useLayoutEffect(() => {
    const el = sheet.current;
    if (!managed || !el) return;
    const clear = () => {
      det.current = { on: false, off: 0, at: "medium" };
      el.classList.remove("ps-detent");
      el.style.removeProperty("height"); el.style.removeProperty("max-height"); el.style.removeProperty("--detent-y"); delete el.dataset.detent;
    };
    const setup = () => {
      if (busy.current) return;
      const phone = window.innerWidth <= PHONE_MAX && (managed.enabled?.() ?? true) && managed.detents !== false;
      if (!phone) { if (det.current.on || el.classList.contains("ps-detent")) clear(); return; }
      // Its content height, measured at its own height with the cap lifted (a grid shell would stretch to a forced one)
      el.style.removeProperty("height"); el.style.setProperty("max-height", "none", "important");
      const sc = el.querySelector<HTMLElement>("[data-sheet-scroll]");
      const natural = sc ? el.offsetHeight - sc.clientHeight + sc.scrollHeight : el.scrollHeight;
      el.style.setProperty("height", LARGE, "important");
      const large = el.offsetHeight;
      const medium = Math.min(natural, Math.round(window.innerHeight * 0.72));
      if (natural <= medium + 1 || large - medium < 24) { clear(); return; }
      const was = det.current;
      det.current = { on: true, off: large - medium, at: was.on ? was.at : "medium" };
      el.classList.add("ps-detent");
      setRest(el, det.current, det.current.at);
    };
    setup();
    const onResize = () => setup();
    window.addEventListener("resize", onResize);
    // A short sheet whose content grows (it loaded) may need detents after all
    const ro = new ResizeObserver(() => { if (!det.current.on) setup(); });
    ro.observe(el);
    return () => { window.removeEventListener("resize", onResize); ro.disconnect(); };
  }, [!!managed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (managed && !prefersReduced()) loadSheetSpring(); }, [!!managed]); // eslint-disable-line react-hooks/exhaustive-deps
  // Stop a spring that's still running when the sheet unmounts
  useEffect(() => () => { run.current?.stop(); run.current = null; }, []);

  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    let startY = 0, startX = 0, origin = 0, dragging = false, decided = false, hist: { y: number; t: number }[] = [];
    // Growing from medium to large with the finger on the body: past large, the rest of the drag scrolls the body
    let inBody = false, scrollBase = 0;
    // caught: held mid-animation (managed). pending: mid-animation, caught on the first move (the unmanaged form).
    let caught = false, pending = false, moved = false, reduce = prefersReduced();
    // A sheet with a fixed header scrolls an inner body (marked data-sheet-scroll); read that one. A sheet that
    // scrolls as a whole (PitchSheet) carries the mark itself; its handle and title row, marked data-sheet-chrome,
    // still move the sheet like a fixed top would, and the rest counts as the body.
    let scroller: Element = el;
    const selfScroll = () => el.hasAttribute("data-sheet-scroll");
    const skip = (t: EventTarget | null) => t instanceof Element && !!t.closest("textarea, input, select, [contenteditable], .no-pull");
    const scrim = () => managed?.scrim?.current ?? null;
    const on = () => !managed || (managed.enabled?.() ?? true);

    // Managed: write the offset straight to the DOM. A full translate3d keeps it on the compositor.
    const apply = (y: number) => {
      const s = scrim(), h = el.offsetHeight || 600, d = det.current;
      // The scrim stays full between the detents and fades as the sheet goes below medium
      const base = d.on ? d.off : 0;
      const o = String(clamp01(1 - Math.max(0, y - base) / Math.max(1, h - base)));
      if (reduce) {
        el.style.setProperty("transition", "none", "important"); el.style.opacity = o;
      } else {
        el.style.transition = "none"; el.style.transform = `translate3d(0, ${y}px, 0)`;
        // The docked actions stay on the screen's bottom edge between the detents, and leave with the sheet below medium
        if (d.on) { el.classList.add("ps-dragging"); el.style.setProperty("--detent-dock", `${Math.min(Math.max(y, 0), d.off)}px`); }
      }
      if (s) { s.style.setProperty("transition", "none", "important"); s.style.opacity = o; }
    };
    /** Hand the sheet back to its stylesheet (at rest, or for the close transition). */
    const release = () => {
      busy.current = false;
      el.style.removeProperty("transition"); el.style.transform = ""; el.style.opacity = "";
      el.classList.remove("ps-dragging"); el.style.removeProperty("--detent-dock");
      const s = scrim(); if (s) { s.style.removeProperty("transition"); s.style.opacity = ""; }
    };
    // A spring frame after the sheet started closing some other way (the X, Escape, Back) stops the spring
    const springFrame = (y: number) => {
      if (el.parentElement && !el.parentElement.classList.contains("in")) { run.current?.stop(); run.current = null; return; }
      apply(y);
    };

    const settle = (y: number, v: number, to?: "home" | "away") => {
      const m = managed!;
      const h = el.offsetHeight || 600, d = det.current;
      const end = y + project(v);
      let away: boolean;
      if (to) away = to === "away";
      else if (d.on) {
        // From medium (or once below it), away when it would come to rest past half of medium (240px at most).
        // From large it settles to medium first; a pull that ends below medium can still close it.
        away = (d.at === "medium" || y > d.off) && end > d.off + Math.min((h - d.off) * 0.5, 240);
        // Otherwise the nearer detent to where the flick would land
        if (!away) setRest(el, d, Math.abs(end) < Math.abs(end - d.off) ? "large" : "medium");
      } else away = end > Math.min(h * 0.5, 240);
      heading.current = away ? "away" : "home";
      const home = restOf(d);
      if (reduce) {
        // Opacity only: the stylesheet's 160ms fade carries it out or back; a detent change is an instant snap
        el.style.removeProperty("transition");
        const s = scrim(); if (s) s.style.removeProperty("transition");
        if (away) { el.style.opacity = "0"; if (s) s.style.opacity = "0"; window.setTimeout(m.onDismiss, mo(160)); }
        else release();
        return;
      }
      if (!kit) { if (away) m.onDismiss(); else release(); return; } // spring not here yet: the CSS transition does it
      busy.current = true;
      if (away) {
        // Leave the way it came in: straight down, no bounce, at the finger's speed
        run.current = kit.spring(y, h + 40, Math.max(v, 0), 1, 0.4, springFrame, () => { run.current = null; m.onDismiss(); });
      } else {
        // To its detent (or home). Critically damped, unless it was flicked: then a little bounce
        run.current = kit.spring(y, home, v, Math.abs(v) > 700 ? 0.85 : 1, 0.46, springFrame, () => { run.current = null; release(); });
      }
    };

    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1 || skip(e.target) || !on()) { decided = true; dragging = false; return; }
      startY = e.touches[0].clientY; startX = e.touches[0].clientX;
      scroller = selfScroll() ? el : el.querySelector("[data-sheet-scroll]") ?? el;
      hist = [{ y: startY, t: performance.now() }];
      caught = false; pending = false; moved = false; reduce = prefersReduced();
      // On a sheet that scrolls as a whole, its own padding and gaps (between the handle and the title) count too
      const chrome = e.target instanceof Element && (!!e.target.closest("[data-sheet-chrome]") || (e.target === el && selfScroll()));
      inBody = !chrome && e.target instanceof Node && (scroller !== el || selfScroll()) && scroller.contains(e.target);
      const rest = managed ? restOf(det.current) : 0;
      origin = reduce ? rest : liveY(el);
      if (Math.abs(origin - rest) > 1) {
        // Caught mid-animation (entering, springing home or leaving): it stops under the finger and follows it from
        // right there. A tap that doesn't move lets it carry on where it was going.
        decided = true; dragging = true;
        if (managed) { run.current?.stop(); run.current = null; caught = true; apply(origin); }
        else pending = true;
        return;
      }
      origin = rest; dragging = false; decided = false; heading.current = "home";
    };
    const move = (e: TouchEvent) => {
      if (decided && !dragging) return;
      const y = e.touches[0].clientY, dy = y - startY, dx = e.touches[0].clientX - startX;
      if (!decided) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        decided = true;
        const d = det.current, vertical = Math.abs(dy) > Math.abs(dx);
        // Down from the top of the body pulls the sheet; up at medium grows it to large before the body scrolls
        const grow = !!managed && d.on && d.at === "medium" && dy < 0 && vertical;
        // The handle and the fixed top always move the sheet; on the body, only once it's scrolled to the top
        const onChrome = !!managed && (scroller !== el || selfScroll()) && !inBody;
        dragging = (dy > 0 && vertical && (scroller.scrollTop <= 0 || onChrome)) || grow;
        if (!dragging) return;
        if (grow && reduce) {
          // Reduced motion: snap to large; the next swipe scrolls the body
          dragging = false; setRest(el, d, "large"); return;
        }
        scrollBase = scroller.scrollTop;
        startY = y; // start tracking from here so the sheet doesn't jump
        run.current?.stop(); run.current = null;
      }
      if (pending) {
        if (Math.abs(dy) < 1) return;
        pending = false; origin = liveY(el); startY = y; // the caller stops its spring in onMove
      }
      if (Math.abs(dy) >= 6) moved = true;
      e.preventDefault();
      const now = performance.now();
      hist = [...hist.slice(-4), { y, t: now }];
      const raw = origin + (y - startY);
      // 1:1 down and between the detents; past large it resists, or, with the finger on the body, scrolls the body
      let off = raw < 0 ? rubberband(raw) : raw;
      if (raw < 0 && inBody && managed && det.current.on) { off = 0; scroller.scrollTop = scrollBase - raw; }
      if (managed) apply(off); else onMove?.(off);
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      if (pending) { pending = false; return; } // a tap on a moving unmanaged sheet: its spring never stopped
      if (caught && !moved) { settle(origin, 0, heading.current); return; }
      const first = hist[0], last = hist[hist.length - 1];
      // A finger that stopped before lifting carries no velocity
      const v = last && first && last.t > first.t && performance.now() - last.t < 80 ? ((last.y - first.y) / (last.t - first.t)) * 1000 : 0;
      const raw = origin + ((last?.y ?? startY) - startY);
      let off = raw < 0 ? rubberband(raw) : raw;
      if (raw < 0 && inBody && managed && det.current.on) off = 0;
      if (managed && reduce && det.current.on && det.current.at === "large") {
        // Reduced motion, pulled down from large: a firm pull snaps to medium, a short one stays
        if (off > 60) { setRest(el, det.current, "medium"); release(); return; }
      }
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
