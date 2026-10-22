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
 *  Timings (tokens in loadin.css, read once): 200ms per card, 30ms apart, the last start capped at 90ms, so a page
 *  is settled quickly. Each section enters once per visit: coming back to one you already opened shows it settled.
 *  The app's first appearance gets a fuller version once a
 *  session (enterApp: 12px rise, 40ms apart, 240ms each), under the lifting loading screen or on the demo's first paint. Reduced motion gets a 160ms fade, no rise,
 *  no stagger. */
import { useLayoutEffect, useRef } from "react";
import { EASE_OUT, mo } from "./motion";
import { firstTime } from "./motionOnce";

const EASE = EASE_OUT;
/** Things inside a page that are fixed to the viewport. A moving ancestor would carry them along, so a card holding
 *  one is split into its children instead, and the fixed piece itself never moves. */
const FIXED = ".deal-tray";
/** Not part of the page: the desktop bell sits on the frame, outside the section */
const SKIP = ".desk-bell, .sr-only, script, style";
/** Entrances some cards play by themselves when they mount */
const OWN = new Set(["rise", "fade", "fade-up", "rm-fade"]);

type Tokens = { dur: number; step: number; cap: number; rise: number; near: number; first: { dur: number; step: number; cap: number; rise: number } };
let tokens: Tokens | null = null;
const read = (): Tokens => {
  if (tokens) return tokens;
  const cs = getComputedStyle(document.documentElement);
  const n = (k: string, d: number) => { const v = parseFloat(cs.getPropertyValue(k)); return Number.isFinite(v) ? v : d; };
  tokens = { dur: n("--ld-dur", 200), step: n("--ld-step", 30), cap: n("--ld-cap", 90), rise: n("--ld-rise", 6), near: n("--ld-near", 120),
    first: { dur: n("--ld-first-dur", 240), step: n("--ld-first-step", 40), cap: n("--ld-first-cap", 140), rise: n("--ld-first-rise", 12) } };
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

function enter(root: HTMLElement, first = false) {
  const base = read();
  const t = first ? { ...base, ...base.first } : base;
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

let appIn = false;
/** The app's first appearance, once a session: the loading screen calls it as it lifts, and the first paint calls it
 *  when there was no loading screen (the demo). */
export function enterApp() {
  if (appIn) return;
  appIn = true;
  const root = document.querySelector<HTMLElement>(".main-inner");
  if (root && !document.hidden) enter(root, true); else mark(1000);
}

/** Call once in the app shell with the current section. */
export function useSectionEnter(section: string) {
  const prev = useRef<string | null>(null);
  useLayoutEffect(() => {
    const from = prev.current;
    prev.current = section;
    // First paint of the app: no stagger, but charts on it still grow in as they always have
    if (from === null) {
      // The loading screen is up: it calls enterApp as it lifts. Otherwise (the demo) the app comes in now.
      firstTime(`section:${section}`);
      if (document.querySelector(".boot3")) mark(1000); else enterApp();
      return;
    }
    if (from === section) return;
    // Shell scrolls to the top after paint; do it now so the first frame and the measuring below see the top
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    // Once per section per visit (Zach): the first time you open a section it comes in; coming back to one you've
    // already seen this visit shows it settled, charts included (chartReveal reads data-revisit)
    if (!firstTime(`section:${section}`)) {
      // Coming back: no stagger, just a short fade of the whole page, so the switch still registers (Zach)
      document.documentElement.dataset.revisit = "";
      const page = document.querySelector<HTMLElement>(".main-inner");
      if (page && !document.hidden) page.animate([{ opacity: 0 }, { opacity: 1 }], { duration: mo(140), easing: EASE });
      return;
    }
    delete document.documentElement.dataset.revisit;
    if (document.hidden) return;
    const root = document.querySelector<HTMLElement>(".main-inner");
    if (root) enter(root);
  }, [section]);
}
