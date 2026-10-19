import { useEffect, type RefObject } from "react";

/**
 * Menus and pickers fade their rows out under the top and bottom edges instead of cutting a row in half.
 * Marks the scroller with data-fade="none" | "top" | "end" | "both" (which edges have more rows past them);
 * lint-overlays.css turns that into a mask. The mask sits on the scroller only, never on the panel that
 * carries the background and shadow, so the panel keeps its rounded corners and its shadow.
 */
export function edgeFade(el: HTMLElement): () => void {
  let raf = 0;
  const update = () => {
    raf = 0;
    const top = el.scrollTop > 1;
    const end = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    el.dataset.fade = top && end ? "both" : top ? "top" : end ? "end" : "none";
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
  update();
  el.addEventListener("scroll", schedule, { passive: true });
  const ro = new ResizeObserver(schedule);
  ro.observe(el);
  const mo = new MutationObserver(schedule);
  mo.observe(el, { childList: true, subtree: true });
  return () => {
    cancelAnimationFrame(raf);
    el.removeEventListener("scroll", schedule);
    ro.disconnect();
    mo.disconnect();
    delete el.dataset.fade;
  };
}

/** edgeFade for a ref'd scroller while `on` (the menu is open). */
export function useEdgeFade(ref: RefObject<HTMLElement | null>, on = true) {
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    return edgeFade(el);
  }, [ref, on]);
}

/** Room for a menu that drops below `anchor`: down to the viewport bottom, or the phone tab bar, less a 16px margin. */
export function roomBelow(anchor: Element, gap = 8): number {
  const b = anchor.getBoundingClientRect();
  const bar = document.querySelector(".tabbar")?.getBoundingClientRect();
  const floor = bar && bar.height > 0 && bar.top < window.innerHeight ? bar.top : window.innerHeight;
  return Math.floor(floor - b.bottom - gap - 16);
}

/** Scrollers in markup this file doesn't own that fade their rows too: the add-player list and FirstRun's team list. */
export const EDGE_FADES = [".qs-pick .qs-opts", ".onboard .ob-teams"].join(", ");

/** Attach edgeFade to every EDGE_FADES scroller as it mounts, and clean up as it unmounts. */
export function edgeFades(root: HTMLElement = document.body): () => void {
  const live = new Map<HTMLElement, () => void>();
  let raf = 0;
  const scan = () => {
    raf = 0;
    for (const [el, off] of live) if (!el.isConnected) { off(); live.delete(el); }
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(EDGE_FADES))) if (!live.has(el)) live.set(el, edgeFade(el));
  };
  const mo = new MutationObserver((recs) => {
    // Ignore our own data-fade writes and the scrollbar thumb's moves
    if (recs.every((r) => r.type === "attributes" || (r.target instanceof Element && r.target.closest(".sa-track")))) return;
    if (!raf) raf = requestAnimationFrame(scan);
  });
  mo.observe(root, { childList: true, subtree: true });
  scan();
  return () => { mo.disconnect(); cancelAnimationFrame(raf); for (const off of live.values()) off(); live.clear(); };
}
