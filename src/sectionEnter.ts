/** Section load-in. Picking a section from the sidebar, the tab bar or the tablet nav brings its page in with a short
 *  stagger: the header first, then each card in reading order, a small rise and a fade. In-page tabs, week steppers
 *  and filters never call this, so their content swaps in place (a skeleton covers anything that isn't ready).
 *
 *  One mechanism for every section: Shell calls useSectionEnter(tab). After the new page mounts and before it paints,
 *  the cards in or near the viewport get a Web Animation each (opacity plus the `translate` property, so a card's own
 *  transform and CSS animations are left alone). Cards below the fold are skipped, they're already settled by the time
 *  you scroll to them. While it runs, <html data-entering> is set; chartReveal reads it so charts only grow in as part
 *  of a section entrance or when scrolled to, never on a tab or week swap.
 *
 *  Timings (tokens in loadin.css, read once): 240ms per card, 35ms apart, the last start capped at 160ms, so a page
 *  is settled by 400ms. Going back to a section you left less than 8 seconds ago skips it: flipping between two pages
 *  to compare them shouldn't replay the same entrance. The first section after the app loads doesn't play it either:
 *  the boot screen (live) or the demo hand-off already brought the app in. Reduced motion gets a 160ms fade, no rise,
 *  no stagger. */
import { useLayoutEffect, useRef } from "react";

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
/** Left a section this recently? Coming back to it skips the entrance. */
const AGAIN_MS = 8000;
/** Things inside a page that are fixed to the viewport. A moving ancestor would carry them along, so a card holding
 *  one is split into its children instead, and the fixed piece itself never moves. */
const FIXED = ".deal-tray";
/** Not part of the page: the desktop bell sits on the frame, outside the section */
const SKIP = ".desk-bell, .sr-only, script, style";
/** Entrances some cards play by themselves when they mount */
const OWN = new Set(["rise", "fade", "fade-up", "rm-fade"]);

type Tokens = { dur: number; step: number; cap: number; rise: number; near: number };
let tokens: Tokens | null = null;
const read = (): Tokens => {
  if (tokens) return tokens;
  const cs = getComputedStyle(document.documentElement);
  const n = (k: string, d: number) => { const v = parseFloat(cs.getPropertyValue(k)); return Number.isFinite(v) ? v : d; };
  tokens = { dur: n("--ld-dur", 240), step: n("--ld-step", 35), cap: n("--ld-cap", 160), rise: n("--ld-rise", 8), near: n("--ld-near", 120) };
  return tokens;
};

let entering = 0;
/** Mark the page as mid-entrance for `ms` (chartReveal lets charts grow while this is set). */
function mark(ms: number) {
  const el = document.documentElement;
  el.dataset.entering = "";
  window.clearTimeout(entering);
  entering = window.setTimeout(() => { delete el.dataset.entering; }, ms);
}

/** The pieces that enter one by one: direct children of the page, opening up tall layout wrappers (a two column grid,
 *  the Waivers layout) until each piece is a card-sized block. Only what's in or near the viewport. */
function pieces(root: HTMLElement, t: Tokens) {
  const vh = window.innerHeight, sy = window.scrollY;
  const out: { el: HTMLElement; top: number; left: number }[] = [];
  const walk = (el: Element, depth: number) => {
    for (const c of Array.from(el.children) as HTMLElement[]) {
      if (c.matches(SKIP) || c.matches(FIXED)) continue;
      // A wrapper with no box of its own (display: contents) lays its children out in the page: open it
      if (getComputedStyle(c).display === "contents") { walk(c, depth); continue; }
      const r = c.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // The page scrolls to the top on a section switch, so judge from the top of the document
      const top = r.top + sy;
      if (top > vh + t.near) continue;
      const tall = r.height > vh * 0.6 && c.children.length > 1 && depth < 3 && !c.matches(".card");
      if (tall || (depth < 4 && c.querySelector(FIXED))) walk(c, depth + 1);
      else out.push({ el: c, top, left: r.left });
    }
  };
  walk(root, 0);
  // Reading order: top to bottom, then left to right for cards sharing a row
  return out.sort((a, b) => (Math.abs(a.top - b.top) < 24 ? a.left - b.left : a.top - b.top));
}

function enter(root: HTMLElement) {
  const t = read();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const list = pieces(root, t);
  if (!list.length) return;
  const last = reduce ? 0 : Math.min((list.length - 1) * t.step, t.cap);
  const dur = reduce ? 160 : t.dur;
  mark(last + dur + 40);
  list.forEach(({ el }, i) => {
    // A card that eases in on its own (a nudge's rise) lands settled instead, so the two don't stack
    el.getAnimations().forEach((a) => { if (a instanceof CSSAnimation && OWN.has(a.animationName)) a.finish(); });
    const frames: Keyframe[] = reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, translate: `0 ${t.rise}px` }, { opacity: 1, translate: "0 0" }];
    el.animate(frames, { duration: dur, delay: reduce ? 0 : Math.min(i * t.step, t.cap), easing: EASE, fill: "backwards" });
  });
}

/** Call once in the app shell with the current section. */
export function useSectionEnter(section: string) {
  const prev = useRef<string | null>(null);
  const leftAt = useRef<Record<string, number>>({});
  useLayoutEffect(() => {
    const from = prev.current;
    prev.current = section;
    // First paint of the app: no stagger, but charts on it still grow in as they always have
    if (from === null) { mark(1000); return; }
    if (from === section) return;
    // Shell scrolls to the top after paint; do it now so the first frame and the measuring below see the top
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    const now = performance.now();
    leftAt.current[from] = now;
    const was = leftAt.current[section];
    if (was !== undefined && now - was < AGAIN_MS) return;
    if (document.hidden) return;
    const root = document.querySelector<HTMLElement>(".main-inner");
    if (root) enter(root);
  }, [section]);
}
