import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./ui";

/** Banners (Zach, Oct 23): the cards that slide in at the top right (top center on phones) to tell you something,
 *  like a Mac's notification banners. New inbox items and app updates use them; toasts at the bottom stay for the
 *  feedback on something you just did ("Offer sent").
 *  A notification banner leaves on its own after a few seconds (held while hovered or focused); the update banner
 *  stays until Refresh. Tapping a banner opens what it's about. */
export interface Banner {
  id: string;
  icon: IconName;
  title: string;
  text: string;
  urgent?: boolean;
  /** Stays until acted on (the update) */
  sticky?: boolean;
  action?: { label: string; run: () => void };
  open?: () => void;
}

const LIFE = 6000;

export function Banners({ items, onClose, dockKey }: { items: Banner[]; onClose: (id: string) => void; dockKey?: unknown }) {
  // Clear of the docked inbox: the stack sits just left of it when it's open beside the page
  const [right, setRight] = useState(16);
  useLayoutEffect(() => {
    const place = () => {
      const rail = document.getElementById("inbox");
      const r = rail?.getBoundingClientRect();
      const docked = !!r && r.width > 0 && getComputedStyle(rail!).position !== "fixed" && r.left < window.innerWidth - 1;
      setRight(docked ? Math.round(window.innerWidth - r!.left + 16) : 16);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [dockKey, items.length]);
  if (!items.length) return null;
  return createPortal(
    <div className="bnr-stack" style={{ ["--bnr-right" as string]: `${right}px` }} role="region" aria-label="Notifications" aria-live="polite">
      {/* A card stack: the newest in front, two more peeking behind; hover or focus fans them out */}
      {items.slice(0, 3).map((b, i) => <BannerCard key={b.id} b={b} i={i} onClose={() => onClose(b.id)} />)}
    </div>,
    document.body,
  );
}

function BannerCard({ b, i, onClose }: { b: Banner; i: number; onClose: () => void }) {
  const held = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const close = () => { setLeaving(true); window.setTimeout(onClose, 220); };
  useEffect(() => {
    if (b.sticky) return;
    let left = LIFE, t = 0;
    const tick = () => { t = window.setTimeout(() => { if (held.current) { left = 1500; tick(); } else close(); }, left); };
    tick();
    return () => clearTimeout(t);
  }, [b.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`bnr${b.urgent ? " is-urgent" : ""}${leaving ? " is-leaving" : ""}`} style={{ ["--i" as string]: i }} aria-hidden={i > 0 || undefined}
      onPointerEnter={() => { held.current = true; }} onPointerLeave={() => { held.current = false; }}
      onFocus={() => { held.current = true; }} onBlur={() => { held.current = false; }}>
      <button type="button" className="bnr-main" onClick={() => { b.open?.(); if (!b.sticky) close(); }} disabled={!b.open} aria-label={`${b.title}. ${b.text}`}>
        <span className="bnr-ic" aria-hidden="true"><Icon name={b.icon} size={16} /></span>
        <span className="bnr-copy"><b>{b.title}</b><span>{b.text}</span></span>
      </button>
      {b.action && <button type="button" className="btn btn-sm btn-primary bnr-go" onClick={b.action.run}>{b.action.label}</button>}
      {/* The update stays until Refresh; everything else can be closed, the ones that need you only that way */}
      {b.id !== "app-update" && <button type="button" className="bnr-x" aria-label="Dismiss" onClick={close}><Icon name="x" size={14} /></button>}
    </div>
  );
}
