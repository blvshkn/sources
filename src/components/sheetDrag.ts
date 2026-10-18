import { useEffect } from "react";

/**
 * Pull a bottom sheet down from anywhere on it. The drag only starts when the sheet is scrolled to the
 * top and the finger moves down, so normal scrolling inside the sheet still works. Fields and sliders
 * keep their own gestures.
 */
export function usePullToDismiss(
  sheet: { current: HTMLElement | null },
  onMove: (y: number) => void,
  onRelease: (y: number, velocity: number) => void,
) {
  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    let startY = 0, startX = 0, dragging = false, decided = false, hist: { y: number; t: number }[] = [];
    const skip = (t: EventTarget | null) => t instanceof Element && !!t.closest("textarea, input, select, [contenteditable], .no-pull");

    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1 || skip(e.target)) { decided = true; dragging = false; return; }
      startY = e.touches[0].clientY; startX = e.touches[0].clientX;
      dragging = false; decided = false; hist = [{ y: startY, t: performance.now() }];
    };
    const move = (e: TouchEvent) => {
      if (decided && !dragging) return;
      const y = e.touches[0].clientY, dy = y - startY, dx = e.touches[0].clientX - startX;
      if (!decided) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        decided = true;
        dragging = dy > 0 && Math.abs(dy) > Math.abs(dx) && el.scrollTop <= 0;
        if (!dragging) return;
        startY = y; // start tracking from here so the sheet doesn't jump
      }
      e.preventDefault();
      hist = [...hist.slice(-4), { y, t: performance.now() }];
      onMove(Math.max(0, y - startY));
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      const a = hist[0], b = hist[hist.length - 1];
      const v = b && a && b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0;
      onRelease(Math.max(0, (b?.y ?? startY) - startY), v);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }); // re-binds each render so the callbacks always see current state
}
