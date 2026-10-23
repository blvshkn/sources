import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { useBackClose } from "../backClose";
import { Icon } from "./ui";
import { usePullToDismiss } from "./sheetDrag";
import { useFocusTrap } from "./focusTrap";
import { useDismiss } from "./useDismiss";
import { ScrollArea } from "./ScrollArea";
import { chartReveal } from "../chartReveal";
import { mo } from "../motion";

/** Below this the detail is a bottom sheet; from here up (tablet and desktop) a centered modal. Matches detail-sheet.css. */
const MODAL_FROM = 768;
const isSheet = () => typeof window !== "undefined" && window.innerWidth < MODAL_FROM;

/**
 * The one surface for anything that opens a page within a page: a bottom sheet below 768px, a centered modal from
 * 768px up. Same shell and behavior as PartnerProfile and MatchupSheet: pull to dismiss on the phone sheet, focus
 * trap, Escape, a click outside and the browser's Back close it, and focus goes back to whatever opened it.
 * The header (title slot plus the close button) stays put; only the body scrolls.
 * `children` can be a function that gets `close(after)`, for actions that should close the sheet and then go somewhere.
 */
export function DetailSheet({ title, label, className = "", onClose, children, bar, foot }: {
  title: ReactNode;
  /** Optional row under the title that stays put with it (tabs, say). Only the body below scrolls. */
  bar?: ReactNode;
  /** Accessible name when the title slot isn't plain text */
  label?: string;
  className?: string;
  /** Optional row pinned to the sheet's bottom edge, outside the scrolling body (the player sheet's docked actions) */
  foot?: ReactNode;
  onClose: () => void;
  children: ReactNode | ((close: (after?: () => void) => void) => ReactNode);
}) {
  const [shown, setShown] = useState(false);
  const [out, setOut] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const closing = useRef(false);
  const titleId = useId();
  useFocusTrap(sheet);

  const close = (after?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    const el = sheet.current;
    if (el) { el.style.transition = ""; el.style.transform = ""; }
    if (scrim.current) { scrim.current.style.transition = ""; scrim.current.style.opacity = ""; }
    // Out on a shorter 240ms ease (styles.css .ps-wrap.out) and unmounted only once it has fully left
    setOut(true);
    setShown(false);
    window.setTimeout(() => { onClose(); after?.(); }, mo(240));
  };

  useEffect(() => {
    // The sheet renders outside #root, so its charts need their own reveal watcher to grow in
    if (sheet.current) chartReveal(sheet.current);
    requestAnimationFrame(() => setShown(true));
    closeBtn.current?.focus({ preventScroll: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The page behind holds still while any sheet is open (lockPage below). A layout effect, so the lock lifts and the
  // scroll position comes back in the same commit that removes the sheet, not a beat later.
  useLayoutEffect(() => lockPage(), []);

  // Phone keyboard: keep the sheet above it (useKeyboardLift below)
  useKeyboardLift(wrap, sheet);

  // Escape (topmost layer only) and focus back to the opener; the scrim takes the outside tap
  useDismiss(sheet, () => close(), { outside: false });
  useBackClose(() => close());
  // Pull down to dismiss, on the phone sheet only; the modal stays put
  usePullToDismiss(sheet, { scrim, enabled: isSheet, onDismiss: () => close() });
  // iOS can still drag the page through the scrim; a swipe there never scrolls anything
  useEffect(() => {
    const el = scrim.current;
    if (!el) return;
    const stop = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);

  return createPortal(
    <div ref={wrap} className={`ps-wrap ds-wrap${shown ? " in" : ""}${out ? " out" : ""}`}>
      <div ref={scrim} className="ps-scrim" onClick={() => close()} aria-hidden="true" />
      <section ref={sheet} className={`ps ps-detail ${className}`.trim()} role="dialog" aria-modal="true" {...(label ? { "aria-label": label } : { "aria-labelledby": titleId })}>
        <div className="ds-top">
          <span className="ps-handle" aria-hidden="true" />
          <div className="ds-title" id={titleId}>{title}</div>
          <button ref={closeBtn} className="ps-x" onClick={() => close()} aria-label="Close"><Icon name="x" size={18} /></button>
          {bar}
        </div>
        <ScrollArea className="ds-body" data-sheet-scroll>
          {typeof children === "function" ? children(close) : children}
        </ScrollArea>
        {foot}
      </section>
    </div>,
    document.body,
  );
}

/**
 * Page scroll lock, shared by every open DetailSheet and released only when the last one closes. html gets
 * data-sheet-lock, which sets overflow: hidden on html and body (detail-sheet.css); iOS Safari honors that since 16,
 * and the sheet body's overscroll-behavior: contain keeps its own scroll from chaining out. Overflow rather than
 * body position: fixed, so sticky headers and pinned sections behind the scrim don't jump. The root keeps a stable
 * scrollbar gutter (frame.css), so nothing shifts sideways. iOS can still move the window to show a focused field
 * above the keyboard, so the scroll position from before the first sheet opened is put back exactly on release.
 */
let locks = 0;
let lockedY = 0;
function lockPage() {
  const root = document.documentElement;
  if (locks++ === 0) { lockedY = window.scrollY; root.setAttribute("data-sheet-lock", ""); }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--locks > 0) return;
    locks = 0;
    root.removeAttribute("data-sheet-lock");
    if (Math.abs(window.scrollY - lockedY) > 0.5) window.scrollTo({ top: lockedY, behavior: "instant" as ScrollBehavior });
  };
}

/** A text field that brings up the on-screen keyboard (not a checkbox, radio or button) */
const editable = (el: Element | null): el is HTMLElement =>
  !!el && (el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)
    || (el instanceof HTMLInputElement && !/^(checkbox|radio|button|submit|reset|range|color|file|image|hidden)$/.test(el.type)));

/**
 * iOS Safari (and Chrome on Android) lay the keyboard over the page instead of resizing it, so a fixed bottom sheet
 * ends up behind it. While a text field inside the sheet has focus and the visual viewport (the part actually
 * visible above the keyboard) is shorter than the window, the wrap gets data-kb and is pinned to exactly that
 * visible box through --ds-vv-top and --ds-vv-h (detail-sheet.css). The sheet keeps sitting on the wrap's bottom
 * edge, so it rides on top of the keyboard and its max-height shrinks to fit. Without a keyboard nothing changes.
 * Pinch zoom also shrinks the visual viewport, so it only counts at scale 1.
 */
function useKeyboardLift(wrap: RefObject<HTMLDivElement | null>, sheet: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const vv = window.visualViewport;
    const w = wrap.current, s = sheet.current;
    if (!vv || !w || !s) return;
    let raf = 0, on = false, lastH = 0;
    let lastEl: Element | null = null;
    const apply = () => {
      raf = 0;
      const focused = document.activeElement;
      const kb = editable(focused) && s.contains(focused) && Math.abs(vv.scale - 1) < 0.01 && window.innerHeight - vv.height > 120;
      if (kb) {
        w.style.setProperty("--ds-vv-top", `${Math.round(vv.offsetTop)}px`);
        w.style.setProperty("--ds-vv-h", `${Math.round(vv.height)}px`);
        if (!on) { on = true; w.setAttribute("data-kb", ""); }
        // The field stays in view inside the (now shorter) scrolling body, once per keyboard size or new field
        if (vv.height !== lastH || focused !== lastEl) {
          lastH = vv.height; lastEl = focused;
          requestAnimationFrame(() => focused.scrollIntoView({ block: "nearest" }));
        }
      } else if (on) {
        on = false; lastH = 0; lastEl = null;
        w.removeAttribute("data-kb");
        w.style.removeProperty("--ds-vv-top");
        w.style.removeProperty("--ds-vv-h");
      }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };
    // The keyboard's resize can land a beat after focus, so check again once it has settled
    let late = 0;
    const onFocus = () => { schedule(); window.clearTimeout(late); late = window.setTimeout(schedule, 350); };
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    s.addEventListener("focusin", onFocus);
    s.addEventListener("focusout", onFocus);
    return () => {
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      s.removeEventListener("focusin", onFocus);
      s.removeEventListener("focusout", onFocus);
      cancelAnimationFrame(raf); window.clearTimeout(late);
    };
  }, [wrap, sheet]);
}
