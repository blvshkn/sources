import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./ui";

const KEY = "sources.fold.";
const remembered = (id: string): boolean | null => {
  try { const v = sessionStorage.getItem(KEY + id); return v === null ? null : v === "1"; } catch { return null; }
};

/** A secondary block of the deal read that folds to one header line. Your choice sticks for the session;
 *  until you make one it follows `auto` (open for small deals, folded for big ones). */
export function Fold({ id, title, summary, auto, className, children }: {
  id: string; title: string; summary: ReactNode; auto: boolean; className?: string; children: ReactNode;
}) {
  const [choice, setChoice] = useState<boolean | null>(() => remembered(id));
  const open = choice ?? auto;
  const body = useRef<HTMLDivElement>(null);
  const uid = useId();
  // Folded content stays out of the tab order and the accessibility tree
  useEffect(() => { const el = body.current; if (!el) return; if (open) el.removeAttribute("inert"); else el.setAttribute("inert", ""); }, [open]);
  const flip = () => {
    const n = !open;
    setChoice(n);
    try { sessionStorage.setItem(KEY + id, n ? "1" : "0"); } catch { /* ignore */ }
  };
  return (
    <section className={`fold${open ? " open" : ""}${className ? ` ${className}` : ""}`} aria-label={title}>
      <button className="fold-head" aria-expanded={open} aria-controls={`${uid}-b`} onClick={flip}>
        <Icon name="chev" size={16} />
        <b>{title}</b>
        <span className="fold-sum" aria-hidden={open}>{summary}</span>
      </button>
      <div className="fold-body" id={`${uid}-b`} ref={body}>
        <div className="fold-in">{children}</div>
      </div>
    </section>
  );
}
