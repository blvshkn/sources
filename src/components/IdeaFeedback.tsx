import { createContext, useEffect, useRef, useState } from "react";
import { useBackClose } from "../backClose";
import { deny } from "../deny";
import { playerById, teamById } from "../data";
import type { Trade } from "../engine";
import { Icon } from "./ui";
import { usePullToDismiss } from "./sheetDrag";
import { useFocusTrap } from "./focusTrap";

/** Anything that renders a trade idea can offer "Won't work" when this is provided. */
export const IdeaFeedbackCtx = createContext<((t: Trade) => void) | null>(null);

export type IdeaReason =
  | { kind: "refuses"; playerId: string }
  | { kind: "notInterested"; playerId: string }
  | { kind: "keeping"; playerId: string }
  /** You don't want this player back, from anyone */
  | { kind: "pass"; playerId: string }
  | { kind: "paused" }
  | { kind: "value" }
  | { kind: "note"; text: string };

/** Tell Sources why an idea won't work. Every answer hides this idea and teaches future ones. */
export function IdeaFeedback({ trade, onPick, onClose }: { trade: Trade; onPick: (r: IdeaReason) => void; onClose: () => void }) {
  const them = teamById(trade.partnerId);
  const [shown, setShown] = useState(false);
  const [note, setNote] = useState("");
  const sheet = useRef<HTMLElement>(null);
  useFocusTrap(sheet);
  const scrim = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const close = () => {
    if (sheet.current) { sheet.current.style.transition = ""; sheet.current.style.transform = ""; }
    if (scrim.current) { scrim.current.style.transition = ""; scrim.current.style.opacity = ""; }
    setShown(false); window.setTimeout(onClose, 220);
  };
  const pick = (r: IdeaReason) => { onPick(r); close(); };

  useEffect(() => {
    requestAnimationFrame(() => setShown(true));
    closeBtn.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", key);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = prev; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useBackClose(close);
  usePullToDismiss(sheet,
    (y) => {
      if (sheet.current) { sheet.current.style.transition = "none"; sheet.current.style.transform = `translateY(${y}px)`; }
      if (scrim.current) { scrim.current.style.transition = "none"; scrim.current.style.opacity = String(Math.max(0, 1 - y / 400)); }
    },
    (y, v) => {
      if (y > 120 || v > 700) close();
      else {
        if (sheet.current) { sheet.current.style.transition = ""; sheet.current.style.transform = ""; }
        if (scrim.current) { scrim.current.style.transition = ""; scrim.current.style.opacity = ""; }
      }
    });

  const first = (id: string) => playerById(id).name;
  const options: { label: string; r: IdeaReason }[] = [
    ...trade.get.map((id) => ({ label: `${them.manager} won't move ${first(id)}`, r: { kind: "refuses", playerId: id } as IdeaReason })),
    ...trade.get.map((id) => ({ label: `I don't want ${first(id)}`, r: { kind: "pass", playerId: id } as IdeaReason })),
    ...trade.give.map((id) => ({ label: `${them.manager} doesn't want ${first(id)}`, r: { kind: "notInterested", playerId: id } as IdeaReason })),
    ...trade.give.map((id) => ({ label: `I'm keeping ${first(id)}`, r: { kind: "keeping", playerId: id } as IdeaReason })),
    { label: `${them.manager} isn't trading right now`, r: { kind: "paused" } },
    { label: "The value is off", r: { kind: "value" } },
  ];

  return (
    <div className={`ps-wrap${shown ? " in" : ""}`}>
      <div ref={scrim} className="ps-scrim" onClick={close} aria-hidden="true" />
      <section ref={sheet} className="ps fb" role="dialog" aria-modal="true" aria-labelledby="fb-title">
        <span className="ps-handle" aria-hidden="true" />
        <header className="fb-head">
          <span>
            <b id="fb-title">Why won't this work?</b>
            <small>Sources hides this idea and uses your answer for the next ones.</small>
          </span>
          <button ref={closeBtn} className="ps-x" onClick={close} aria-label="Close"><Icon name="x" size={18} /></button>
        </header>
        <ul className="fb-list">
          {options.map((o) => (
            <li key={o.label}><button className="fb-opt" onClick={() => pick(o.r)}><span>{o.label}</span><Icon name="chev" size={16} /></button></li>
          ))}
        </ul>
        <form className="fb-note" onSubmit={(e) => { e.preventDefault(); if (note.trim()) pick({ kind: "note", text: note.trim() }); }}>
          <label htmlFor="fb-text">Something else</label>
          <div className="composer">
            <input id="fb-text" className="composer-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={`${them.manager} only wants youth`} />
            <button type="submit" className="composer-btn send" aria-disabled={!note.trim() || undefined} aria-label="Save reason"
              onClick={(e) => { if (!note.trim()) { e.preventDefault(); deny(e.currentTarget, "Type a reason first, or pick one above."); } }}><Icon name="send" size={18} /></button>
          </div>
        </form>
      </section>
    </div>
  );
}
