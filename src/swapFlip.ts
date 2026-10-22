/** Lineup swap (approved Oct 22, motion-picks.html "Lineup swap"): when two players trade places, the slot labels stay
 *  put and the two players glide past each other (420ms on screen), so you see who went in and who went to the bench.
 *  A FLIP measured after the swap renders: each row starts where the other one is now and eases home, on the card's
 *  own fill so it passes cleanly over the rows between. The slot chip runs the same move backwards, so it never
 *  leaves its place. Reduced motion: the rows just change. */
import { EASE_OUT, mo } from "./motion";

const reduce = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const rowOf = (list: Element, id: string) => list.querySelector<HTMLElement>(`.lu-row[data-pid="${CSS.escape(id)}"]`);

/** `inId` just went into the lineup, `outId` came out of it. Call after the swap has rendered (a layout effect). */
export function flipSwap(list: Element | null, inId: string, outId: string) {
  if (!list || reduce()) return;
  const a = rowOf(list, inId), b = rowOf(list, outId);
  if (!a || !b) return;
  const dy = b.getBoundingClientRect().top - a.getBoundingClientRect().top;
  if (Math.abs(dy) < 1) return;
  const opts = { duration: mo(240), easing: EASE_OUT };
  const glide = (row: HTMLElement, from: number, lead: boolean) => {
    row.classList.add("nm-gliding");
    if (lead) row.classList.add("nm-lead");
    // The incoming player passes over the one leaving
    const anim = row.animate(lead
      ? [{ transform: `translateY(${from}px)` }, { transform: "none" }]
      : [{ transform: `translateY(${from}px)`, opacity: 0.85 }, { transform: "none", opacity: 1 }], opts);
    row.querySelector(":scope > .lu-slot")?.animate([{ transform: `translateY(${-from}px)` }, { transform: "none" }], opts);
    anim.onfinish = anim.oncancel = () => row.classList.remove("nm-gliding", "nm-lead");
  };
  glide(a, dy, true);
  glide(b, -dy, false);
}
