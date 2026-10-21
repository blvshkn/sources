import { useEffect, useRef, useState } from "react";
import { useBackClose } from "../backClose";
import { createPortal } from "react-dom";
import { WEEK } from "../data";
import { Icon } from "./ui";
import { usePullToDismiss } from "./sheetDrag";
import { useFocusTrap } from "./focusTrap";
import { useDismiss } from "./useDismiss";
import { ScrollArea } from "./ScrollArea";
import { WeekStepper } from "./WeekStepper";
import { MatchupWeek, useMatchupWeek } from "./Matchup";

/** Below this the matchup is a bottom sheet; from here up (tablet and desktop) a centered modal. Matches matchup-sheet.css. */
const MODAL_FROM = 768;
const isSheet = () => typeof window !== "undefined" && window.innerWidth < MODAL_FROM;

/**
 * The full matchup in its own surface, opened from the Wire's matchup card: a bottom sheet below 768px, a centered
 * modal from 768px up. The same content as the #matchup page (MatchupWeek), so there is one implementation. The
 * week stepper sits in the fixed header and the sheet keeps one height, so switching weeks moves nothing but the
 * rows below it. Same shell as PartnerProfile: pull to dismiss on the phone sheet, focus trap, Escape and a click
 * outside close it, focus goes back to the opener.
 */
export function MatchupSheet({ week: start = WEEK, onClose }: { week?: number; onClose: () => void }) {
  const [week, setWeek] = useMatchupWeek(start);
  const [shown, setShown] = useState(false);
  const sheet = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const closing = useRef(false);
  useFocusTrap(sheet);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const el = sheet.current;
    if (el) { el.style.transition = ""; el.style.transform = ""; }
    if (scrim.current) { scrim.current.style.transition = ""; scrim.current.style.opacity = ""; }
    setShown(false);
    window.setTimeout(onClose, 220);
  };

  useEffect(() => {
    requestAnimationFrame(() => setShown(true));
    closeBtn.current?.focus({ preventScroll: true });
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useDismiss(sheet, close, { outside: false });

  useBackClose(close);
  usePullToDismiss(sheet, { scrim, enabled: isSheet, onDismiss: () => close() });

  return createPortal(
    <div className={`ps-wrap mus-wrap${shown ? " in" : ""}`}>
      <div ref={scrim} className="ps-scrim" onClick={close} aria-hidden="true" />
      <section ref={sheet} className="ps ps-matchup" role="dialog" aria-modal="true" aria-labelledby="mus-title">
        <div className="mus-top">
          <span className="ps-handle" aria-hidden="true" />
          <h2 id="mus-title" className="mus-title">Full matchup</h2>
          <WeekStepper week={week} onChange={setWeek} className="mu-weeks mus-weeks" />
          <button ref={closeBtn} className="ps-x" onClick={close} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>
        <ScrollArea className="mus-body" data-sheet-scroll>
          <MatchupWeek week={week} />
        </ScrollArea>
      </section>
    </div>,
    document.body,
  );
}
