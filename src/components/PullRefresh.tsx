import { useEffect, useRef } from "react";
import { haptic } from "../haptics";
import { MARK } from "./Logo";
import { EASE_OUT, mo } from "../motion";

/**
 * Pull to refresh on phones (Zach's motion pick, no words). At the very top of the page, pull down and the page rides
 * down while the Source mark draws itself stroke by stroke above it. Let go past 70px and the page eases back to a
 * 46px gap while the mark moves up into it, from a soft blur to sharp. While Source syncs with Sleeper the mark dims
 * to a faint outline and every stroke traces over it together on one clock, start to end, then clears the same way,
 * for as long as the sync runs (never otherwise). When it's done the trace finishes, the mark locks solid with one
 * small press, then lifts away as the page settles. Let go short of 70px and the page just eases back.
 *
 * Touch only, phone widths only, and only when the page is already at the top and the finger moves down: anything
 * else is a normal scroll. Listeners are passive; the browser's own pull (Chrome's reload, Safari's bounce at the top)
 * is turned off with overscroll-behavior while this is mounted (gesture-motion.css), so the two don't stack.
 *
 * `onSync` is the app's real refresh: it fetches the league again and resolves with a function that puts the new
 * data on screen. That runs after the mark has lifted, so nothing jumps while it's still moving.
 * Durations are the preview's on-screen times: mo(N) with N = preview ms / 1.75.
 */
const PULL = 70, REST = 46, SIZE = 30;
const PHONE = "(max-width: 767.98px)";
const TRACE = "cubic-bezier(0.45, 0, 0.55, 1)";
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
// dismiss-exempt: only reads whether an overlay is open; this renders none
const OVERLAY = '[role="dialog"], [aria-modal="true"]';
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The page's own pieces, moved together, opening wrappers that have no box of their own (display: contents, like
 *  the Waivers layout on phones). Fixed pieces inside the page (the deal tray) stay where they are. */
function pieces() {
  const out: HTMLElement[] = [];
  const walk = (el: Element) => {
    for (const c of Array.from(el.children) as HTMLElement[]) {
      if (c.matches(".deal-tray, .desk-bell")) continue;
      if (getComputedStyle(c).display === "contents") walk(c); else out.push(c);
    }
  };
  const root = document.querySelector(".main-inner");
  if (root) walk(root);
  return out;
}
let parts: HTMLElement[] = [];
const shift = (y: number) => { const v = y ? `0 ${y}px` : ""; parts.forEach((el) => { el.style.translate = v; }); if (!y) parts = []; };

export function PullRefresh({ onSync }: { onSync: () => Promise<() => void> }) {
  const box = useRef<HTMLDivElement>(null);
  const sync = useRef(onSync);
  sync.current = onSync;

  useEffect(() => {
    const mark = box.current;
    if (!mark) return;
    const html = document.documentElement;
    html.setAttribute("data-ptr", "");
    const base = Array.from(mark.querySelectorAll<SVGPathElement>(".ptr-base path"));
    const trace = Array.from(mark.querySelectorAll<SVGPathElement>(".ptr-trace path"));
    const phone = window.matchMedia(PHONE);
    let y0: number | null = null, x0 = 0, d = 0, on = false, busy = false, top = 0, raf = 0;
    const timers: number[] = [];
    const later = (ms: number, f: () => void) => { timers.push(window.setTimeout(f, ms)); };
    const tween = (ms: number, fn: (t: number) => void, done?: () => void) => {
      cancelAnimationFrame(raf);
      if (reduced() || ms <= 0) { fn(1); done?.(); return; }
      const t0 = performance.now();
      const step = (now: number) => { const t = Math.max(0, Math.min(1, (now - t0) / ms)); fn(ease(t)); if (t < 1) raf = requestAnimationFrame(step); else done?.(); };
      raf = requestAnimationFrame(step);
    };

    // The mark rests centered in the 46px gap under the top bar
    const place = () => {
      const bar = document.querySelector<HTMLElement>(".topbar");
      const b = bar && bar.offsetParent !== null ? bar.getBoundingClientRect().bottom : 0;
      top = Math.max(0, Math.round(b + (REST - SIZE) / 2));
      mark.style.top = `${top}px`;
    };
    // Pulling: the strokes draw in one after another and the mark rides down with the page
    const setPull = (y: number) => {
      d = y;
      const p = Math.min(1, y / PULL);
      mark.style.opacity = String(Math.min(1, p * 1.6));
      if (reduced()) { mark.style.transform = ""; return; }
      shift(y);
      mark.style.transform = `translateY(${Math.round(y * 0.35) - 14}px) scale(${0.8 + p * 0.2})`;
      mark.style.filter = "";
      base.forEach((el, k) => { el.style.strokeDashoffset = String(Math.max(0, 1 - Math.min(1, p * 1.25 - k * 0.06))); });
    };
    const reset = () => {
      mark.classList.remove("syncing", "locked");
      mark.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      base.forEach((el) => { el.style.strokeDashoffset = ""; });
      mark.style.opacity = "0"; mark.style.transform = ""; mark.style.filter = "";
      mark.hidden = true;
      d = 0;
    };
    // Short of the threshold: the page eases back and the mark fades with it
    const settle = () => {
      const from = d;
      tween(mo(240), (t) => setPull(from * (1 - t)), () => { shift(0); reset(); });
    };

    const refresh = () => {
      busy = true;
      const from = d;
      const calm = reduced();
      // The real refresh starts now; the motion below only waits on it
      const job = sync.current().then((apply) => ({ apply }), () => ({ apply: null as null | (() => void) }));
      // Let go: the page eases back to the resting gap, the mark moves up into it from a soft blur to sharp
      tween(mo(240), (t) => shift(from + (REST - from) * t));
      base.forEach((el) => { el.style.strokeDashoffset = "0"; });
      mark.style.opacity = "1";
      mark.style.transform = "";
      if (!calm) {
        const y = Math.round(from * 0.35) - 14;
        mark.animate([
          { transform: `translateY(${y}px) scale(1)`, filter: "blur(0px)" },
          { transform: "translateY(-4px) scale(0.92)", filter: "blur(2px)", offset: 0.4 },
          { transform: "translateY(0) scale(1)", filter: "blur(0px)" },
        ], { duration: mo(297), easing: EASE_OUT });
      }
      // Syncing: a faint outline, and every stroke traces over it together on one clock until the sync resolves
      const cycle = mo(800);
      let loops: Animation[] = [];
      const started = new Promise<void>((res) => later(calm ? 0 : mo(217), () => {
        if (!calm) {
          mark.classList.add("syncing");
          const t0 = document.timeline.currentTime;
          loops = trace.map((el) => {
            const a = el.animate([
              { strokeDashoffset: 1, easing: TRACE },
              { strokeDashoffset: 0, offset: 0.55, easing: TRACE },
              { strokeDashoffset: -1 },
            ], { duration: cycle, iterations: Infinity });
            if (typeof t0 === "number") a.startTime = t0;
            return a;
          });
        }
        res();
      }));
      Promise.all([job, started]).then(async ([{ apply }]) => {
        // The trace finishes the pass it's on, then the mark locks solid
        const lead = loops[0];
        if (lead && typeof lead.currentTime === "number") {
          const end = (Math.floor(lead.currentTime / cycle) + 1) * cycle;
          loops.forEach((a) => a.effect?.updateTiming({ iterations: end / cycle }));
          await lead.finished.catch(() => {});
        }
        loops.forEach((a) => a.cancel());
        mark.classList.remove("syncing");
        if (!apply) haptic("error");
        if (apply) {
          haptic("done");
          mark.classList.add("locked");
          if (!calm) mark.animate([{ transform: "scale(1)" }, { transform: "scale(1.14)" }, { transform: "scale(1)" }], { duration: mo(183), easing: EASE_OUT });
        }
        later(calm ? 400 : mo(240), () => {
          // Done: the mark rides up with the page on the same clock, fading as it goes, so the two stay in sync (Zach)
          mark.getAnimations().forEach((x) => x.cancel());
          if (calm) mark.style.opacity = "0";
          tween(mo(263), (t) => {
            shift(REST * (1 - t));
            if (!calm) { mark.style.transform = `translateY(${-Math.round(REST * t)}px)`; mark.style.opacity = String(Math.max(0, 1 - t * 1.8)); }
          }, () => {
            shift(0); reset(); busy = false;
            apply?.();
          });
        });
      });
    };

    const start = (e: TouchEvent) => {
      y0 = null; on = false;
      if (busy || !phone.matches || e.touches.length !== 1) return;
      const t = e.target as Element | null;
      // A sheet or menu is open: its own drag and scroll win
      if (!t?.closest?.(".main") || t.closest(OVERLAY) || document.querySelector(OVERLAY)) return;
      if ((document.scrollingElement?.scrollTop ?? window.scrollY) > 0) return;
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX;
    };
    const move = (e: TouchEvent) => {
      if (y0 === null) return;
      const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
      if (!on) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        // Up, sideways, or the page has scrolled: a normal scroll, not a pull
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || (document.scrollingElement?.scrollTop ?? window.scrollY) > 0) { y0 = null; return; }
        on = true; y0 += 6;
        parts = pieces();
        mark.hidden = false; place();
      }
      const raw = Math.max(0, e.touches[0].clientY - y0);
      setPull(Math.round(raw < PULL ? raw : PULL + (raw - PULL) * 0.35));
    };
    const end = () => {
      if (y0 === null) return;
      y0 = null;
      if (!on) return;
      on = false;
      // Let go past the line: one tick as the refresh commits (Zach, Oct 23)
      if (d >= PULL) { haptic("tap"); refresh(); } else settle();
    };
    reset();
    const opt = { passive: true } as const;
    document.addEventListener("touchstart", start, opt);
    document.addEventListener("touchmove", move, opt);
    document.addEventListener("touchend", end, opt);
    document.addEventListener("touchcancel", end, opt);
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
      timers.forEach(clearTimeout); cancelAnimationFrame(raf);
      html.removeAttribute("data-ptr");
      shift(0);
    };
  }, []);

  const paths = MARK.map((p) => <path key={p.slice(0, 12)} d={p} pathLength={1} />);
  return (
    <div ref={box} className="ptr-mark" aria-hidden="true" hidden>
      <svg viewBox="-50 -50 100 100" focusable="false">
        <g className="ptr-base" fill="none" stroke="var(--logo-mark)" strokeWidth={5.26} strokeLinejoin="round">{paths}</g>
        <g className="ptr-trace" fill="none" stroke="var(--logo-mark)" strokeWidth={5.26} strokeLinejoin="round">{paths}</g>
      </svg>
    </div>
  );
}
