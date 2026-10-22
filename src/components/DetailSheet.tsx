import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
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
    // The root keeps a stable scrollbar gutter (frame.css), so locking the page moves nothing behind
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape (topmost layer only) and focus back to the opener; the scrim takes the outside tap
  useDismiss(sheet, () => close(), { outside: false });
  useBackClose(() => close());
  // Pull down to dismiss, on the phone sheet only; the modal stays put
  usePullToDismiss(sheet, { scrim, enabled: isSheet, onDismiss: () => close() });

  return createPortal(
    <div className={`ps-wrap ds-wrap${shown ? " in" : ""}${out ? " out" : ""}`}>
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
