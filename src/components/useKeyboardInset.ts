import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Search pickers on phones: keep every row reachable above the on-screen keyboard.
 *
 * While an input inside `field` has focus on a touch device:
 * - html gets data-kb-pick, so keyboard.css hides the deal tray and the tab bar and leaves room to scroll
 * - once the keyboard is up, the page scrolls so the field sits near the top of what's visible, under the sticky top bar
 * - the returned max-height fits `list` between its top and the top of the keyboard, less 12px,
 *   tracked with window.visualViewport (resize and scroll), which is the area actually visible above the keyboard
 * On blur it returns undefined again, so the list goes back to its CSS max-height.
 * Desktop (fine pointer) never activates.
 */
const GAP = 12;
const MIN = 120;
let holders = 0;

const touch = () => typeof window !== "undefined" && window.matchMedia("(hover: none), (pointer: coarse)").matches;

export function useKeyboardInset(field: RefObject<HTMLElement | null>, list: RefObject<HTMLElement | null>, on = true): number | undefined {
  const [max, setMax] = useState<number>();
  const [active, setActive] = useState(false);
  const measureRef = useRef<() => void>(() => {});

  useEffect(() => {
    const el = field.current;
    if (!on || !el || !touch()) return;
    const vv = window.visualViewport;
    let live = false, aligned = false, raf = 0, settle = 0, blurT = 0, alignedAt = 0;
    const view = () => ({ top: vv ? vv.offsetTop : 0, height: vv ? vv.height : window.innerHeight });

    const measure = () => {
      raf = 0;
      if (!live) return;
      const ul = list.current;
      if (!ul) { setMax(undefined); return; }
      const v = view();
      const top = ul.getBoundingClientRect().top - v.top;
      setMax(Math.max(MIN, Math.floor(v.height - top - GAP)));
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measureRef.current = schedule;

    // Field near the top of the visible area: as many rows as possible fit above the keyboard
    const align = () => {
      if (!live || aligned) return;
      aligned = true;
      const v = view();
      alignedAt = v.height;
      // Clear the sticky top bar when it shows, so the field lands just under it rather than behind it
      const bar = document.querySelector(".topbar");
      const barB = bar && /sticky|fixed/.test(getComputedStyle(bar).position) ? Math.max(0, bar.getBoundingClientRect().bottom - v.top) : 0;
      const delta = el.getBoundingClientRect().top - v.top - GAP - barB;
      if (Math.abs(delta) > 4) window.scrollBy({ top: delta, behavior: "auto" });
      schedule();
    };
    const onViewport = () => {
      if (!live) return;
      // A shrink is the keyboard arriving (or growing): align once it settles, even if we aligned before it
      const h = view().height;
      if ((!aligned && vv && h < window.innerHeight - 80) || (aligned && h < alignedAt - 80)) { aligned = false; window.clearTimeout(settle); settle = window.setTimeout(align, 60); }
      schedule();
    };

    const start = () => {
      window.clearTimeout(blurT);
      if (live) return;
      live = true; aligned = false;
      if (holders++ === 0) document.documentElement.setAttribute("data-kb-pick", "");
      setActive(true);
      vv?.addEventListener("resize", onViewport);
      vv?.addEventListener("scroll", onViewport);
      window.addEventListener("resize", onViewport);
      // Fallback for keyboards that don't resize the visual viewport, and for emulators
      window.clearTimeout(settle);
      settle = window.setTimeout(align, 320);
      schedule();
    };
    const stop = () => {
      if (!live) return;
      live = false;
      if (--holders <= 0) { holders = 0; document.documentElement.removeAttribute("data-kb-pick"); }
      vv?.removeEventListener("resize", onViewport);
      vv?.removeEventListener("scroll", onViewport);
      window.removeEventListener("resize", onViewport);
      window.clearTimeout(settle); cancelAnimationFrame(raf); raf = 0;
      setActive(false); setMax(undefined);
    };
    const onIn = (e: FocusEvent) => { if (e.target instanceof HTMLInputElement) start(); };
    // Focus can hop inside the picker (sort buttons, Done); only stop once it has really left
    const onOut = () => { window.clearTimeout(blurT); blurT = window.setTimeout(() => { if (!(document.activeElement instanceof HTMLInputElement && el.contains(document.activeElement))) stop(); }, 80); };

    el.addEventListener("focusin", onIn);
    el.addEventListener("focusout", onOut);
    // autoFocus fires before effects run
    if (document.activeElement instanceof HTMLInputElement && el.contains(document.activeElement)) start();
    return () => {
      el.removeEventListener("focusin", onIn);
      el.removeEventListener("focusout", onOut);
      window.clearTimeout(blurT);
      stop();
      measureRef.current = () => {};
    };
  }, [field, list, on]);

  // The list can mount, grow or move after focus (typing, results arriving): measure after every render while active
  useEffect(() => { if (active) measureRef.current(); });

  return max;
}
