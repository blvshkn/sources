import { useLayoutEffect, useRef } from "react";
import { EASE_OUT, mo } from "../motion";

/**
 * Sliding number (Zach's motion pick): when a number changes because you did something, only the digits that changed
 * slide, up for a rise and down for a drop, and the old digit leaves the other way. "25" to "30" moves both digits;
 * "25" to "28" moves just the 5. Digits line up from the right, so a number that gains a digit keeps its ones in place.
 * The first render and anything that isn't a digit (a sign, a %, a decimal point) never move. Reduced motion: no motion.
 * 520ms on screen (mo(297)).
 */
export function SlideNum({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(text);
  useLayoutEffect(() => {
    const from = prev.current;
    prev.current = text;
    const el = ref.current;
    if (!el || from === text || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const num = (s: string) => parseFloat(s.replace(/[^\d.-]/g, ""));
    const a = num(from), b = num(text);
    const dir = Number.isFinite(a) && Number.isFinite(b) && b < a ? -1 : 1;
    const cells = Array.from(el.children) as HTMLElement[];
    const n = text.length, m = from.length;
    cells.forEach((cell, i) => {
      const ch = text[i], old = from[m - (n - i)];
      if (old === ch || !/\d/.test(ch) || (old !== undefined && !/\d/.test(old))) return;
      const face = cell.firstElementChild as HTMLElement | null;
      face?.animate([{ transform: `translateY(${dir * 100}%)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: mo(297), easing: EASE_OUT });
      if (old === undefined) return;
      const ghost = document.createElement("span");
      ghost.className = "sn-ghost";
      ghost.setAttribute("aria-hidden", "true");
      ghost.textContent = old;
      cell.appendChild(ghost);
      const out = ghost.animate([{ transform: "none", opacity: 1 }, { transform: `translateY(${-dir * 100}%)`, opacity: 0 }], { duration: mo(297), easing: EASE_OUT, fill: "forwards" });
      out.onfinish = out.oncancel = () => ghost.remove();
    });
  }, [text]);
  // Keyed from the right, so the ones digit keeps its cell when the number grows or shrinks a digit
  return <span ref={ref} className={"sn" + (className ? " " + className : "")}>{Array.from(text).map((c, i) => <span key={text.length - i} className="sn-c"><span>{c}</span></span>)}</span>;
}
