/**
 * The "locked" interaction: anything that can't be done right now still takes the tap, shakes, and says why in a
 * toast. Targets carry aria-disabled="true" (not disabled, which would swallow the tap) and keep their dimming.
 *
 * deny(el, message): a short horizontal shake on el through the Web Animations API, composited on top of whatever
 * transform the element already has so it never fights CSS, a double-tick haptic (haptics.ts), and the toast through
 * App's toast (registered with setDenySink). Reduced motion skips the shake and keeps the toast. With no el, the
 * control the person last pressed shakes, so handlers that only see an id (App's trade toggle) still give feedback.
 */
import { haptic } from "./haptics";

type Sink = (message: string) => void;
let sink: Sink | null = null;
/** App registers its toast setter here; the returned function unregisters it. */
export const setDenySink = (fn: Sink) => { sink = fn; return () => { if (sink === fn) sink = null; }; };

let lastPress: Element | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", (e) => { lastPress = e.target instanceof Element ? e.target : null; }, true);
}
const PRESSABLE = "button, a, [role='button'], [role='option'], [tabindex]";

// 0, -6, 6, -4, 4, -2, 0 px, each step easing out, so the motion settles instead of stopping dead
const FRAMES: Keyframe[] = [0, -6, 6, -4, 4, -2, 0].map((x) => ({ transform: `translateX(${x}px)`, easing: "ease-out" }));
const SHAKE_MS = 330;
const running = new WeakMap<Element, Animation>();

const reducedMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

/** Just the shake, for callers that toast on their own. Interrupts a shake already running on the same element. */
export function shake(el: Element | null | undefined) {
  if (!el || !(el instanceof HTMLElement) || reducedMotion() || typeof el.animate !== "function") return;
  running.get(el)?.cancel();
  try {
    const a = el.animate(FRAMES, { duration: SHAKE_MS, composite: "add" });
    running.set(el, a);
    a.onfinish = a.oncancel = () => { if (running.get(el) === a) running.delete(el); };
  } catch { /* composite unsupported: skip the shake, the toast still explains */ }
}

export function deny(el: Element | null | undefined, message: string) {
  const target = el ?? lastPress?.closest(PRESSABLE) ?? (document.activeElement !== document.body ? document.activeElement : null);
  shake(target);
  // data-denied lets a control show its own locked cue (the matchup rows show a lock badge) while the toast is up
  if (target instanceof HTMLElement) {
    target.dataset.denied = "";
    clearTimeout(Number(target.dataset.deniedT));
    target.dataset.deniedT = String(window.setTimeout(() => { delete target.dataset.denied; delete target.dataset.deniedT; }, 1800));
  }
  haptic("deny");
  sink?.(message);
}

/** onClick helper: deny on the element that was clicked. */
export const denyOn = (message: string) => (e: { currentTarget: Element }) => deny(e.currentTarget, message);
