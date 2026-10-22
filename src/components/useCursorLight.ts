import { useEffect, type RefObject } from "react";

/** The cursor as a light on the tagline's words (Zach, Oct 22: "your cursor is the light that moves the gradient on the
 *  text and changes the gradients direction smoothly"). One white-to-gray field spans the whole paragraph; its bright end
 *  turns toward the pointer and the white reaches toward it. Drives CSS custom properties on the element:
 *    --tl-a  the gradient angle (CSS degrees; 90deg = bright on the left, the resting state)
 *    --tl-k  how far the white runs along the gradient line before it starts to fade (0 to 45, a percent)
 *    --tl-w / --tl-h  the paragraph's size in px, so every word paints the same field
 *  and --tl-ox / --tl-oy on each word span (its offset inside the paragraph), so the field stays continuous across words.
 *  Motion only on an action: the rAF loop runs while the pointer moves near the tagline and stops once the light settles.
 *  Touch pointers are ignored (the light rests); reduced motion snaps straight to the target. Styles: tagline-light.css. */

const REST_A = 90;
const NEAR = 240; // px around the paragraph that still counts as "near"
const EASE = 0.12; // per 60fps frame
const MAX_K = 45;
const WORDS = ":scope > span:not(.ld2-chip):not(.sr-only)";

export function useCursorLight(ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");

    // ---- one continuous field: measure every word's offset inside the paragraph (on mount, resize, font load) ----
    const measure = () => {
      const box = el.getBoundingClientRect();
      if (!box.width || !el.offsetWidth) return;
      const s = box.width / el.offsetWidth; // undo any scale on an ancestor
      el.style.setProperty("--tl-w", `${(box.width / s).toFixed(1)}px`);
      el.style.setProperty("--tl-h", `${(box.height / s).toFixed(1)}px`);
      el.querySelectorAll<HTMLElement>(WORDS).forEach((w) => {
        const r = w.getBoundingClientRect();
        w.style.setProperty("--tl-ox", `${((r.left - box.left) / s).toFixed(1)}px`);
        w.style.setProperty("--tl-oy", `${((r.top - box.top) / s).toFixed(1)}px`);
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) measure(); });

    // ---- the light ----
    let a = REST_A, k = 0; // current
    let ta = REST_A, tk = 0; // target
    let px = 0, py = 0, has = false; // last pointer, client coords
    let raf = 0, last = 0;
    const write = () => {
      el.style.setProperty("--tl-a", `${a.toFixed(2)}deg`);
      el.style.setProperty("--tl-k", k.toFixed(2));
    };
    write();
    // Shortest signed difference between two angles, in (-180, 180]
    const turn = (from: number, to: number) => { const d = ((to - from) % 360 + 540) % 360 - 180; return d === -180 ? 180 : d; };

    const aim = () => {
      const rest = () => { ta = a + turn(a, REST_A); tk = 0; };
      if (!has) { rest(); return; }
      const r = el.getBoundingClientRect();
      if (px < r.left - NEAR || px > r.right + NEAR || py < r.top - NEAR || py > r.bottom + NEAR) { rest(); return; }
      const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < 1) return; // dead center: keep the current direction
      // The pointer's direction from the center as a CSS angle (0 = up, clockwise). The gradient runs from its start
      // (white) toward its angle, so the white end faces the pointer when the angle points the other way.
      const toward = (Math.atan2(dx, -dy) * 180) / Math.PI;
      ta = a + turn(a, toward + 180);
      // Where the pointer falls on the gradient line (0 = the white end, 0.5 = the center): the white runs up to it
      const rad = (ta * Math.PI) / 180, sx = Math.sin(rad), sy = -Math.cos(rad);
      const len = Math.abs(r.width * sx) + Math.abs(r.height * sy) || 1;
      const t = 0.5 + (dx * sx + dy * sy) / len;
      tk = Math.max(0, Math.min(MAX_K, t * 100));
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(64, now - last) : 16.67;
      last = now;
      const f = 1 - Math.pow(1 - EASE, dt / 16.67);
      a += (ta - a) * f;
      k += (tk - k) * f;
      if (Math.abs(ta - a) < 0.05 && Math.abs(tk - k) < 0.05) { a = ta; k = tk; last = 0; write(); return; } // settled
      write();
      raf = requestAnimationFrame(tick);
    };
    const go = () => {
      aim();
      if (reduce.matches) { a = ta; k = tk; write(); return; }
      if (!raf && (Math.abs(ta - a) >= 0.05 || Math.abs(tk - k) >= 0.05)) { last = 0; raf = requestAnimationFrame(tick); }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      px = e.clientX; py = e.clientY; has = true;
      go();
    };
    const onLeave = () => { if (has) { has = false; go(); } };

    // Listen only while the tagline is on screen
    let on = false;
    const listen = (yes: boolean) => {
      if (yes === on) return;
      on = yes;
      if (yes) {
        window.addEventListener("pointermove", onMove, { passive: true });
        document.documentElement.addEventListener("pointerleave", onLeave);
        measure();
      } else {
        window.removeEventListener("pointermove", onMove);
        document.documentElement.removeEventListener("pointerleave", onLeave);
      }
    };
    const io = new IntersectionObserver(([en]) => listen(!!en?.isIntersecting), { rootMargin: `${NEAR}px` });
    io.observe(el);

    return () => {
      alive = false;
      io.disconnect();
      ro.disconnect();
      listen(false);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);
}
