import { ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Branded tooltip. Hover opens after a short delay, keyboard focus opens right away, and once one tip
 * is showing its neighbours open with no delay (skip-delay). Escape, blur and mouseleave close it.
 * On touch, a long press shows it. The tip lives in a fixed layer on <body>, so cards never clip it.
 */

const DELAY = 400;
const SKIP_MS = 400; // how long after a tip closes the next one still opens instantly
const LONG_PRESS = 450;
let openNow = 0;
let lastClose = 0;
let closeOther: (() => void) | null = null;

/** Delay for the next tip: none while another tip is open or just closed. */
export const tipDelay = () => (openNow > 0 || Date.now() - lastClose < SKIP_MS ? 0 : DELAY);
/** Bookkeeping shared with the icon-button tips in tooltips.ts. */
export function tipOpened(close: () => void) {
  if (closeOther && closeOther !== close) closeOther();
  closeOther = close;
  openNow = 1;
}
export function tipClosed(close: () => void) {
  if (closeOther === close) { closeOther = null; openNow = 0; lastClose = Date.now(); }
}

/** Places a tip above its trigger (below when there's no room), kept 8px inside the viewport. */
export function placeTip(tip: HTMLElement, trigger: Element, prefer: "top" | "bottom" = "top") {
  const r = trigger.getBoundingClientRect();
  const w = tip.offsetWidth, h = tip.offsetHeight, gap = 8, pad = 8;
  const fitsTop = r.top - gap - h >= pad, fitsBottom = r.bottom + gap + h <= innerHeight - pad;
  const side = prefer === "top" ? (fitsTop || !fitsBottom ? "top" : "bottom") : (fitsBottom || !fitsTop ? "bottom" : "top");
  const cx = r.left + r.width / 2;
  const left = Math.round(Math.min(Math.max(pad, cx - w / 2), innerWidth - pad - w));
  const top = Math.round(side === "top" ? r.top - gap - h : r.bottom + gap);
  const ax = Math.min(Math.max(12, cx - left), w - 12);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.style.setProperty("--ax", `${ax}px`);
  tip.dataset.side = side;
}

/** The trigger is the wrapper's first element child (the wrapper itself is display: contents). */
const triggerOf = (wrap: HTMLElement | null) => (wrap?.firstElementChild as HTMLElement | null) ?? null;
const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";

export function Tooltip({ content, children, side = "top", focusable = false }: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  /** Make a plain (non-interactive) trigger reachable by keyboard. Use for jargon worth explaining. */
  focusable?: boolean;
}) {
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const pressed = useRef(false);
  const [open, setOpen] = useState(false);
  const instant = useRef(false);

  const close = useRef(() => {});
  close.current = () => { window.clearTimeout(timer.current); setOpen(false); };
  const closer = useRef(() => close.current()).current;

  const show = (now: boolean) => {
    window.clearTimeout(timer.current);
    const d = now ? 0 : tipDelay();
    instant.current = !now && d === 0;
    if (d) timer.current = window.setTimeout(() => setOpen(true), d);
    else setOpen(true);
  };

  // Describe the trigger with the tip text, and give plain triggers a tab stop when asked
  useEffect(() => {
    const el = triggerOf(wrap.current);
    if (!el) return;
    el.setAttribute("data-tt", "");
    const prev = el.getAttribute("aria-describedby");
    el.setAttribute("aria-describedby", [prev, id].filter(Boolean).join(" "));
    const addTab = focusable && !el.matches(FOCUSABLE);
    if (addTab) el.tabIndex = 0;
    return () => {
      if (prev) el.setAttribute("aria-describedby", prev); else el.removeAttribute("aria-describedby");
      if (addTab) el.removeAttribute("tabindex");
    };
  }, [id, focusable]);

  useEffect(() => {
    if (!open) return;
    tipOpened(closer);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    const onScroll = () => close.current();
    addEventListener("keydown", onKey);
    addEventListener("scroll", onScroll, true);
    return () => { removeEventListener("keydown", onKey); removeEventListener("scroll", onScroll, true); tipClosed(closer); };
  }, [open, closer]);

  useLayoutEffect(() => {
    const el = triggerOf(wrap.current);
    if (open && tip.current && el) placeTip(tip.current, el, side);
  }, [open, side, content]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <span
      ref={wrap}
      className="tt-wrap"
      onPointerEnter={(e) => { if (e.pointerType === "mouse") show(false); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") close.current(); }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") { close.current(); return; }
        pressed.current = false;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => { pressed.current = true; instant.current = false; setOpen(true); }, LONG_PRESS);
      }}
      onPointerUp={(e) => {
        if (e.pointerType === "mouse") return;
        window.clearTimeout(timer.current);
        if (pressed.current) timer.current = window.setTimeout(() => close.current(), 1600);
      }}
      onPointerCancel={() => window.clearTimeout(timer.current)}
      onClickCapture={(e) => { if (pressed.current) { e.preventDefault(); e.stopPropagation(); pressed.current = false; } }}
      onContextMenu={(e) => { if (pressed.current) e.preventDefault(); }}
      onFocus={(e) => { if ((e.target as HTMLElement).matches?.(":focus-visible")) show(true); }}
      onBlur={() => close.current()}
    >
      {typeof children === "string" || typeof children === "number" ? <span>{children}</span> : children}
      <span id={id} hidden>{content}</span>
      {open && createPortal(<div ref={tip} className="tt" aria-hidden="true" data-instant={instant.current ? "" : undefined}><span className="tt-in">{content}</span></div>, document.body)}
    </span>
  );
}
