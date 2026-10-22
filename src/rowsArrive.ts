/** Animated list (Zach's motion pick): the rows in Waivers, Lineup and League values drift up and sharpen in, one
 *  after another, the first time the list shows this visit. 760ms each, 110ms apart, an 8px rise from a faint 2px
 *  blur; the last start is capped so a long list is settled quickly. Only rows in or near the viewport take part.
 *
 *  It plays once per list per visit (motionOnce.firstTime), on mount only: a week switch, a filter or coming back to the
 *  section shows the rows settled.
 *
 *  With the section entrance (sectionEnter.ts): the card is one of the pieces that rises in, and its rows stagger
 *  inside it. The two don't stack on the same element: the card moves as a whole with `translate` and opacity, the
 *  rows move inside it with their own `translate`, so the rows simply arrive a beat behind their card's frame.
 *  Uses `translate`, so a row's own transform (a press, a swipe, a pin) is left alone. Reduced motion: no motion. */
import { useLayoutEffect, type RefObject } from "react";
import { EASE_OUT, mo } from "./motion";
import { firstTime, wasSeen } from "./motionOnce";

const STEP = 110, CAP = 660, DUR = 760, RISE = 8, NEAR = 120;

function play(root: HTMLElement, rows: string) {
  const vh = window.innerHeight, sy = window.scrollY;
  // The page scrolls to the top on a section switch (after this runs), so judge from the top of the document
  const list = Array.from(root.querySelectorAll<HTMLElement>(rows)).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.top + sy < vh + NEAR;
  });
  list.forEach((el, i) => {
    el.animate([
      { opacity: 0, translate: `0 ${RISE}px`, filter: "blur(2px)" },
      { opacity: 1, translate: "0 0", filter: "blur(0px)" },
    ], { duration: mo(DUR / 1.75), delay: mo(Math.min(i * STEP, CAP) / 1.75), easing: EASE_OUT, fill: "backwards" });
  });
}

/** `ready` false (another tab of the page, a skeleton) waits without spending the visit. */
export function useRowsArrive(ref: RefObject<HTMLElement | null>, key: string, rows: string, ready = true) {
  useLayoutEffect(() => {
    const root = ref.current;
    const k = `rows:${key}`;
    if (!ready || !root || document.hidden || wasSeen(k)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { firstTime(k); return; }
    // A live league opens under its loading screen: wait for it to start lifting so the rows aren't spent behind it
    if (!document.querySelector(".boot3")) { firstTime(k); play(root, rows); return; }
    let t = 0, n = 0;
    const wait = () => {
      if (!root.isConnected) return;
      if (!document.querySelector(".boot3:not(.leaving)") || ++n > 80) { if (firstTime(k)) play(root, rows); return; }
      t = window.setTimeout(wait, 100);
    };
    wait();
    return () => window.clearTimeout(t);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
}
