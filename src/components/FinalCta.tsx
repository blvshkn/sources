/** The closing call to action's card. A lime glow follows the pointer around inside it (fine pointers only),
 *  over the tiled logo mark the app background and loading screen used to carry (recovered from 303f49a^).
 *
 *  Layers, back to front: the faint ink tiles (static, CSS mask fades them toward the edges), the glow, then a lime
 *  copy of the tiles seen only through a round mask that travels with the glow. The glow wrapper moves by transform;
 *  the lime copy inside it moves the opposite way by the same amount, so the tiles stay put and only the window moves.
 *  Both are transform writes on their own layers: no layout, no paint, nothing recalculated below them.
 *
 *  At rest (and with no JS, touch, or reduced motion) CSS percentages park the glow at top center, so a resize
 *  never needs measuring. JS only writes px while the glow is travelling, then hands back to CSS. */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { MARK } from "./Logo";

/** The tiled mark, as the loading screen drew it: the 96px mark at 1.6x, each tile overlapping the next by 45% across
 *  and 40% down. One tile step holds the four tiles that reach into it. CSS scales it up on wider cards. */
const TILE = 96 * 1.6, STEP_X = TILE * 0.55, STEP_Y = TILE * 0.6;
function Tiles({ className }: { className: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={className} aria-hidden="true" focusable="false">
      <defs>
        <g id={`${id}m`} fill="none" strokeWidth="5.26" strokeLinejoin="round">
          {MARK.map((d) => <path key={d.slice(0, 12)} d={d} />)}
        </g>
        <pattern id={`${id}p`} width={STEP_X} height={STEP_Y} patternUnits="userSpaceOnUse">
          {[[0, 0], [-STEP_X, 0], [0, -STEP_Y], [-STEP_X, -STEP_Y]].map(([x, y]) => (
            <use key={`${x},${y}`} href={`#${id}m`} transform={`translate(${x} ${y}) scale(${1.6 * 0.96}) translate(50 50)`} />
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}p)`} />
    </svg>
  );
}

/** Following: time-based smoothing, so it feels the same at 60 and 120Hz. Higher means a lazier, softer trail. */
const FOLLOW_TAU = 0.28;
/** Going home after the pointer leaves: one slow, eased glide instead of a fast catch-up that overshoots the eye. */
const RETURN_MS = 1400;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function FinalCtaPanel({ children }: { children: ReactNode }) {
  const card = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const lit = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = card.current, g = glow.current, l = lit.current;
    if (!el || !g || !l) return;
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const still = matchMedia("(prefers-reduced-motion: reduce)");

    // Card size and page origin, read on enter and on resize only. Never inside the frame loop.
    let w = 0, ox = 0, oy = 0;
    const measure = () => { const r = el.getBoundingClientRect(); w = r.width; ox = r.left + scrollX; oy = r.top + scrollY; };
    let x = 0, y = 0, tx = 0, ty = 0, raf = 0, moving = false, inside = false, visible = true;
    // The glide home: where it started, where home is, and when it began
    let rx = 0, ry = 0, hx = 0, hy = 0, rt = 0, last = 0;

    const rest = () => { tx = w / 2; ty = 0; };
    const park = () => { cancelAnimationFrame(raf); raf = 0; moving = false; g.style.transform = ""; l.style.transform = ""; };
    const paint = () => { g.style.transform = `translate3d(${x}px,${y}px,0)`; l.style.transform = `translate3d(${-x}px,${-y}px,0)`; };
    const frame = (now: number) => {
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60); last = now;
      if (inside) {
        const k = 1 - Math.exp(-dt / FOLLOW_TAU);
        x += (tx - x) * k; y += (ty - y) * k; paint();
        if (Math.abs(tx - x) < 0.1 && Math.abs(ty - y) < 0.1) { x = tx; y = ty; paint(); raf = 0; last = 0; return; }
      } else {
        if (!rt) rt = now;
        const p = Math.min(1, (now - rt) / RETURN_MS), e = easeInOut(p);
        x = rx + (hx - rx) * e; y = ry + (hy - ry) * e;
        if (p >= 1) { x = hx; y = hy; park(); last = 0; return; } // home again: CSS takes the rest position back
        paint();
      }
      raf = requestAnimationFrame(frame);
    };
    const run = () => { if (!raf && visible) raf = requestAnimationFrame(frame); };

    // The glow follows the pointer anywhere on the page while the card is on screen, so it leans toward a cursor that's
    // outside the card too. Targets are held within a margin around the card so some of the wash always stays inside.
    const target = (e: PointerEvent) => {
      const m = w * 0.25, h = el.offsetHeight;
      tx = Math.max(-m, Math.min(w + m, e.pageX - ox));
      ty = Math.max(-m, Math.min(h + m, e.pageY - oy));
    };
    const enter = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !fine.matches || still.matches || !visible) return;
      measure(); inside = true;
      if (!moving) { x = w / 2; y = 0; moving = true; } // start from where CSS has it parked
      target(e); run();
    };
    const move = (e: PointerEvent) => {
      if (!visible) return;
      if (!inside) { enter(e); return; }
      target(e); run();
    };
    const leave = () => { if (!inside) return; inside = false; rest(); rx = x; ry = y; hx = tx; hy = ty; rt = 0; run(); };
    // The pointer leaving the window counts as leaving
    const out = (e: PointerEvent) => { if (!e.relatedTarget) leave(); };

    // Size changes: re-measure, and if the glow is mid-flight keep its home in step with the new width
    const ro = new ResizeObserver(() => { if (moving) { measure(); if (!inside) { rest(); hx = tx; hy = ty; } } });
    ro.observe(el);
    // Offscreen: stop the loop and park at rest
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (!visible) { inside = false; park(); } else measure(); });
    io.observe(el);

    window.addEventListener("pointermove", move, { capture: true, passive: true });
    document.addEventListener("pointerout", out);
    window.addEventListener("blur", leave);
    return () => {
      window.removeEventListener("pointermove", move, { capture: true });
      document.removeEventListener("pointerout", out);
      window.removeEventListener("blur", leave);
      ro.disconnect(); io.disconnect(); cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="ld2-final-panel ld2-cta" ref={card}>
      <div className="ld2-cta-bg" aria-hidden="true">
        <Tiles className="ld2-cta-tiles" />
        <div className="ld2-cta-glow" ref={glow}>
          <div className="ld2-cta-wash" />
          <div className="ld2-cta-window"><div className="ld2-cta-lit" ref={lit}><Tiles className="ld2-cta-tiles" /></div></div>
        </div>
      </div>
      {children}
    </div>
  );
}
