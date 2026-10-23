import { useEffect, type RefObject } from "react";

/** A row that scrolls sideways (Zach, Oct 23): touch swipes it natively; with a mouse you can drag it, and the wheel
 *  scrolls it sideways while the pointer is over it. A drag past 4px doesn't count as a click on the pill under it. */
export function useDragScroll(ref: RefObject<HTMLElement | null>, on: unknown = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startX = 0, startLeft = 0, id = -1, dragged = false;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || el.scrollWidth <= el.clientWidth) return;
      id = e.pointerId; startX = e.clientX; startLeft = el.scrollLeft; dragged = false;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - startX;
      if (!dragged && Math.abs(dx) > 4) { dragged = true; el.setPointerCapture(id); el.classList.add("is-dragging"); }
      if (dragged) el.scrollLeft = startLeft - dx;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      el.classList.remove("is-dragging");
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    // Swallow the click that ends a drag
    const click = (e: MouseEvent) => { if (dragged) { e.preventDefault(); e.stopPropagation(); dragged = false; } };
    const wheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      const next = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY));
      if (next === el.scrollLeft) return; // at an end: let the page scroll on
      e.preventDefault();
      el.scrollLeft = next;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("click", click, true);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("click", click, true);
      el.removeEventListener("wheel", wheel);
    };
  }, [ref, on]);
}
