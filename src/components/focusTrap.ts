import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab inside a modal sheet or dialog while it is open (aria-modal alone doesn't). */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, on = true) {
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      const box = ref.current;
      if (e.key !== "Tab" || !box) return;
      const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.getClientRects().length > 0 && !el.closest("[inert], [aria-hidden='true']"));
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      const at = document.activeElement;
      if (!box.contains(at)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [ref, on]);
}
