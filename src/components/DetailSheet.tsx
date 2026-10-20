import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBackClose } from "../backClose";
import { Icon } from "./ui";
import { usePullToDismiss } from "./sheetDrag";
import { useFocusTrap } from "./focusTrap";
import { ScrollArea } from "./ScrollArea";
import { chartReveal } from "../chartReveal";

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
export function DetailSheet({ title, label, className = "", onClose, children }: {
  title: ReactNode;
  /** Accessible name when the title slot isn't plain text */
  label?: string;
  className?: string;
  onClose: () => void;
  children: ReactNode | ((close: (after?: () => void) => void) => ReactNode);
}) {
  const [shown, setShown] = useState(false);
  const sheet = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const closing = useRef(false);
  const titleId = useId();
  useFocusTrap(sheet);

  const close = (after?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    const el = sheet.current;
    if (el) { el.style.transition = ""; el.style.transform = ""; }
    if (scrim.current) { scrim.current.style.transition = ""; scrim.current.style.opacity = ""; }
    setShown(false);
    window.setTimeout(() => { onClose(); after?.(); }, 220);
  };

  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    // The sheet renders outside #root, so its charts need their own reveal watcher to grow in
    if (sheet.current) chartReveal(sheet.current);
    requestAnimationFrame(() => setShown(true));
    closeBtn.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", key);
    // The root keeps a stable scrollbar gutter (frame.css), so locking the page moves nothing behind
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = prev;
      const back = opener.current;
      if (back && document.contains(back)) back.focus({ preventScroll: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useBackClose(() => close());
  // Pull down to dismiss, on the phone sheet only; the modal stays put
  usePullToDismiss(sheet,
    (y) => {
      if (!isSheet()) return;
      if (sheet.current) { sheet.current.style.transition = "none"; sheet.current.style.transform = `translateY(${y}px)`; }
      if (scrim.current) { scrim.current.style.transition = "none"; scrim.current.style.opacity = String(Math.max(0, 1 - y / 400)); }
    },
    (y, v) => {
      if (!isSheet()) return;
      if (y > 120 || v > 700) close();
      else {
        if (sheet.current) { sheet.current.style.transition = ""; sheet.current.style.transform = ""; }
        if (scrim.current) { scrim.current.style.transition = ""; scrim.current.style.opacity = ""; }
      }
    });

  return createPortal(
    <div className={`ps-wrap ds-wrap${shown ? " in" : ""}`}>
      <div ref={scrim} className="ps-scrim" onClick={() => close()} aria-hidden="true" />
      <section ref={sheet} className={`ps ps-detail ${className}`.trim()} role="dialog" aria-modal="true" {...(label ? { "aria-label": label } : { "aria-labelledby": titleId })}>
        <div className="ds-top">
          <span className="ps-handle" aria-hidden="true" />
          <div className="ds-title" id={titleId}>{title}</div>
          <button ref={closeBtn} className="ps-x" onClick={() => close()} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>
        <ScrollArea className="ds-body" data-sheet-scroll>
          {typeof children === "function" ? children(close) : children}
        </ScrollArea>
      </section>
    </div>,
    document.body,
  );
}
