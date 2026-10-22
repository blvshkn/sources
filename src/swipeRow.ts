/** Swipe row (Zach's motion pick) for the Waivers list on phones. Drag a row sideways: right opens a lime Watch panel,
 *  left a gray Not now panel. Past 90px, a swipe right watches him (the panel's star slams, like the Watch button) and
 *  the row springs back; a swipe left springs the row back while his name is struck through, left to right, and
 *  greys, then he's skipped this week exactly as the Not now button does it. Anything short of 90px springs back.
 *  The two buttons stay for anyone who doesn't swipe. Arrow keys on a focused row do the same, at every width.
 *
 *  Only sideways drags count: the row is touch-action pan-y, so a vertical drag scrolls the page as usual and never
 *  reaches here. A row with a sheet open, or one that's already passed or skipped, doesn't swipe.
 *  State lives in data attributes and one style property on the row (gesture-motion.css), never in className, so a
 *  re-render mid-swipe (watching him moves his row to the top) can't drop it.
 *  Times are the preview's on-screen times: mo(N) with N = preview ms / 1.75. */
import { useEffect, useRef, type RefObject } from "react";
import { mo } from "./motion";

const TH = 90, LIM = 140, SLOP = 8;
const PHONE = "(max-width: 767.98px)";

export function useSwipeRows(listRef: RefObject<HTMLElement | null>, opts: { watched: (id: string) => boolean; onWatch: (id: string) => void; onNotNow: (id: string) => void }) {
  const cb = useRef(opts);
  cb.current = opts;
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const phone = window.matchMedia(PHONE);
    const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers = new Map<HTMLElement, number[]>();
    const later = (el: HTMLElement, ms: number, f: () => void) => { const l = timers.get(el) ?? []; l.push(window.setTimeout(f, ms)); timers.set(el, l); };
    const clearRow = (el: HTMLElement) => { (timers.get(el) ?? []).forEach(clearTimeout); timers.delete(el); };

    const rowOf = (t: EventTarget | null) => {
      const el = (t as Element | null)?.closest?.<HTMLElement>(".wv");
      if (!el || !list.contains(el) || el.classList.contains("ps-no") || !el.querySelector(".ps-x")) return null;
      if (el.querySelector('[role="dialog"]')) return null;
      return el;
    };
    const paint = (el: HTMLElement, x: number) => { el.style.setProperty("--sw-x", `${x}px`); el.style.setProperty("--sw-p", String(x / TH)); };
    const done = (el: HTMLElement) => {
      clearRow(el);
      el.removeAttribute("data-sw"); el.removeAttribute("data-sw-act");
      el.style.removeProperty("--sw-x"); el.style.removeProperty("--sw-p");
    };
    const settle = (el: HTMLElement) => { el.setAttribute("data-sw", "settle"); paint(el, 0); later(el, reduced() ? 0 : mo(263), () => done(el)); };

    const release = (el: HTMLElement, dx: number) => {
      const id = el.dataset.id ?? "";
      if (dx > TH && !cb.current.watched(id)) {
        // Watch: the row holds open a beat while the star slams, then springs back and he's watched (his row pins to the top)
        el.setAttribute("data-sw", "settle"); el.setAttribute("data-sw-act", "watch");
        paint(el, TH + 10);
        later(el, reduced() ? 0 : mo(320), () => { paint(el, 0); cb.current.onWatch(id); later(el, reduced() ? 0 : mo(263), () => done(el)); });
      } else if (dx < -TH) {
        // Not now: the row snaps back, his name is struck through and greys, then he's skipped as the button does it
        el.setAttribute("data-sw", "settle"); el.setAttribute("data-sw-act", "cut");
        paint(el, 0);
        later(el, reduced() ? 0 : mo(411), () => { done(el); cb.current.onNotNow(id); });
      } else settle(el);
    };

    let drag: { el: HTMLElement; x0: number; y0: number; id: number; on: boolean; dx: number } | null = null;
    let quiet = 0;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || !e.isPrimary || !phone.matches) return;
      const t = e.target as Element | null;
      // Only from the row itself, not from its Watch or Not now buttons
      if (!t?.closest?.(".wv-row")) return;
      const el = rowOf(t);
      if (!el || el.hasAttribute("data-sw")) return;
      drag = { el, x0: e.clientX, y0: e.clientY, id: e.pointerId, on: false, dx: 0 };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const raw = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.on) {
        if (Math.abs(raw) < SLOP && Math.abs(dy) < SLOP) return;
        if (Math.abs(dy) >= Math.abs(raw)) { drag = null; return; }
        drag.on = true;
        drag.el.setAttribute("data-sw", "drag");
        try { drag.el.setPointerCapture(e.pointerId); } catch { /* the pointer already left */ }
      }
      const dx = Math.abs(raw) > LIM ? Math.sign(raw) * (LIM + (Math.abs(raw) - LIM) * 0.25) : raw;
      drag.dx = dx;
      paint(drag.el, dx);
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (!d.on) return;
      // The lift after a swipe isn't a tap on the row
      quiet = performance.now() + 400;
      release(d.el, e.type === "pointercancel" ? 0 : d.dx);
    };
    const click = (e: MouseEvent) => { if (performance.now() < quiet) { e.preventDefault(); e.stopPropagation(); } };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const t = e.target as Element | null;
      if (!t?.matches?.(".wv-row")) return;
      const el = rowOf(t);
      if (!el || el.hasAttribute("data-sw")) return;
      e.preventDefault();
      const dx = e.key === "ArrowRight" ? TH + 20 : -TH - 20;
      el.setAttribute("data-sw", "settle");
      paint(el, dx);
      later(el, reduced() ? 0 : mo(137), () => release(el, dx));
    };

    list.addEventListener("pointerdown", down, { passive: true });
    list.addEventListener("pointermove", move, { passive: true });
    list.addEventListener("pointerup", up, { passive: true });
    list.addEventListener("pointercancel", up, { passive: true });
    list.addEventListener("click", click, true);
    list.addEventListener("keydown", key);
    return () => {
      list.removeEventListener("pointerdown", down);
      list.removeEventListener("pointermove", move);
      list.removeEventListener("pointerup", up);
      list.removeEventListener("pointercancel", up);
      list.removeEventListener("click", click, true);
      list.removeEventListener("keydown", key);
      timers.forEach((l) => l.forEach(clearTimeout));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
