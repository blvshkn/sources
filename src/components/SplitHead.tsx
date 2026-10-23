import { useEffect, type RefObject } from "react";

/** A landing section heading in two lines (Zach, Oct 22, after getdropset.app): the first line in ink, the second
 *  indented and in muted ink. Read as one heading; the lines are just how it's set. */
export function SplitHead({ id, a, b }: { id: string; a: string; b: string }) {
  return (
    <h2 id={id} className="ld-h2 ld2-split">
      <span className="ld2-split-a">{a}</span> <span className="ld2-split-b">{b}</span>
    </h2>
  );
}

/** Drives every SplitHead under `root` from the page's scroll: --p runs 0 to 1 as the heading rises from the bottom
 *  of the screen to a bit above the middle. CSS turns it into the two lines sliding together from opposite sides and
 *  brightening as they meet. Only headings near the screen are updated; reduced motion pins them at 1. */
export function useSplitHeads(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const heads = [...el.querySelectorAll<HTMLElement>(".ld2-split")];
    if (!heads.length) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { heads.forEach((h) => h.style.setProperty("--p", "1")); return; }
    const near = new Set<HTMLElement>();
    let raf = 0;
    const paint = () => {
      raf = 0;
      const vh = window.innerHeight;
      near.forEach((h) => {
        const top = h.getBoundingClientRect().top;
        // 0 when its top is at the bottom edge, settled once it's 70% of the way down the screen, so the heading is still
        // well before the reader gets to it (Zach, Oct 22: things came in too late)
        const p = Math.min(1, Math.max(0, (vh - top) / (vh * 0.3)));
        h.style.setProperty("--p", p.toFixed(3));
      });
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => (e.isIntersecting ? near.add(e.target as HTMLElement) : near.delete(e.target as HTMLElement)));
      kick();
    }, { rootMargin: "20% 0px" });
    heads.forEach((h) => { h.style.setProperty("--p", "0"); io.observe(h); });
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);
    return () => { io.disconnect(); window.removeEventListener("scroll", kick); window.removeEventListener("resize", kick); cancelAnimationFrame(raf); };
  }, [root]);
}
