import { useEffect, useRef, type RefObject } from "react";

/**
 * A side-scrolling pill row marks which edges have more past them: data-hfade="none" | "start" | "end" | "both".
 * lint-pages-b.css turns that into an edge fade. Works where CSS scroll timelines don't (Safari).
 * When the row gains a pill, it scrolls to the end so the new one is in view.
 */
export function useHFade(ref: RefObject<HTMLElement | null>, count: number) {
  const last = useRef(count);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      el.dataset.hfade = start && end ? "both" : start ? "start" : end ? "end" : "none";
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    el.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("scroll", schedule); ro.disconnect(); };
  }, [ref]);
  useEffect(() => {
    const el = ref.current;
    if (el && count > last.current) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollTo({ left: el.scrollWidth, behavior: reduce ? "auto" : "smooth" });
    }
    last.current = count;
    if (el) requestAnimationFrame(() => el.dispatchEvent(new Event("scroll")));
  }, [ref, count]);
}
