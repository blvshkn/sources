// Icon line weight follows the size an icon is drawn at (Zach's scale, in real screen pixels):
//   XS, 13px and under: 0.75   Small, 14 to 16px: 1   Medium, 17 to 22px: 1.5   Large, 23px and up: 1.5
// Icons are drawn on a 24 box, so the stroke in viewBox units is px * 24 / size (1 at 16px is 1.5 units, 1.5 at 20px is 1.8).
// Kept in viewBox units rather than vector-effect: non-scaling-stroke so the dash-draw animations (pathLength 1),
// the roster mark's inner scale and the hover transforms keep drawing exactly as they did.

import { useLayoutEffect, useRef, type CSSProperties } from "react";

/** The line, in screen pixels, for an icon displayed at `size` px. */
export const strokePx = (size: number) => (size < 13.5 ? 0.75 : size < 16.5 ? 1 : 1.5);
/** The same line in the icon's own units, for a `box`-wide viewBox. */
export const strokeFor = (size: number, box = 24) => Math.round((strokePx(size) * box * 1000) / size) / 1000;

/** CSS can draw an icon at another size than its size prop (icon buttons force 24px, the Ask mark grows to 40px on
 *  desktop, the landing phone scales by --u). One shared observer re-reads the drawn box and resets the line, so the
 *  scale holds wherever the icon lands. It sets --ic-sw, which icon-strokes.css turns into stroke-width. */
let ro: ResizeObserver | null = null;
function observer() {
  if (ro || typeof ResizeObserver === "undefined") return ro;
  ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const svg = e.target as SVGSVGElement;
      const w = e.contentRect.width; if (!w) continue;
      const sw = String(strokeFor(w, svg.viewBox?.baseVal?.width || 24));
      if (svg.style.getPropertyValue("--ic-sw") !== sw) { svg.style.setProperty("--ic-sw", sw); svg.setAttribute("stroke-width", sw); }
    }
  });
  return ro;
}

/** For an icon component: the first paint uses the size prop, then the observer keeps it true to the drawn size. */
export function useIconStroke(size: number) {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const el = ref.current, o = observer();
    if (!el || !o) return;
    o.observe(el);
    return () => o.unobserve(el);
  }, [size]);
  const sw = strokeFor(size);
  return { ref, strokeWidth: sw, style: { "--ic-sw": sw } as CSSProperties };
}
