import { ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Branded tooltip. Hover opens after a short delay, keyboard focus opens right away, and once one tip
 * is showing its neighbours open with no delay (skip-delay). Escape, blur and mouseleave close it.
 * On touch, a long press shows it while the finger stays down; release or a tap elsewhere hides it, and the press never
 * reaches the card or button underneath. Leaving fades it out. The tip lives in a fixed layer on <body>, so cards never clip it.
 */

const DELAY = 400;
const SKIP_MS = 400; // how long after a tip closes the next one still opens instantly
const LONG_PRESS = 500;
/** Hover delay for number tips (NumTip): long enough that sweeping across a card doesn't flash them. */
export const NUM_DELAY = 650;
const FADE_OUT = 160; // matches the exit fade in num-tips.css
let openNow = 0;
let lastClose = 0;
let closeOther: (() => void) | null = null;
/** The tip still fading out, if any: a new tip removes it at once so two never show together. */
let fading: (() => void) | null = null;

/** Delay for the next tip: none while another tip is open or just closed. */
export const tipDelay = (base = DELAY) => (openNow > 0 || Date.now() - lastClose < SKIP_MS ? 0 : base);
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

export function Tooltip({ content, children, side = "top", focusable = false, delay = DELAY, kind }: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  /** Make a plain (non-interactive) trigger reachable by keyboard. Use for jargon worth explaining. */
  focusable?: boolean;
  /** Hover delay before the first tip opens (skip-delay still makes the next ones instant) */
  delay?: number;
  /** "num": a tip that explains a bare number (NumTip), a class hook for its timing */
  kind?: "num";
}) {
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const pressed = useRef(false);
  const [open, setOpen] = useState(false);
  // Leaving fades the tip out before it unmounts; another tip taking over removes it at once
  const [closing, setClosing] = useState(false);
  const fade = useRef(0);
  const instant = useRef(false);
  const touch = useRef(false);
  const openRef = useRef(false);
  openRef.current = open && !closing;

  const gone = useRef(() => {});
  gone.current = () => { window.clearTimeout(fade.current); setClosing(false); setOpen(false); };
  const drop = useRef(() => gone.current()).current;
  const reveal = () => {
    if (fading && fading !== drop) fading();
    if (fading) fading = null;
    window.clearTimeout(fade.current); setClosing(false); setOpen(true);
  };
  const close = useRef((_now?: boolean) => {});
  close.current = (now = false) => {
    window.clearTimeout(timer.current);
    window.clearTimeout(fade.current);
    if (now || !openRef.current) { if (fading === drop) fading = null; setClosing(false); setOpen(false); return; }
    setClosing(true);
    fading = drop;
    fade.current = window.setTimeout(() => { if (fading === drop) fading = null; gone.current(); }, FADE_OUT);
  };
  const closer = useRef(() => close.current(true)).current;

  const show = (now: boolean) => {
    window.clearTimeout(timer.current);
    const d = now ? 0 : tipDelay(delay);
    instant.current = !now && d === 0;
    if (d) timer.current = window.setTimeout(reveal, d);
    else reveal();
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
    if (!open || closing) return;
    tipOpened(closer);
    // Escape hides the tip first (capture, before a sheet's own handler), so a second Escape closes the sheet
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); close.current(true); } };
    const onScroll = () => close.current(true);
    // A tap anywhere else hides a tip a long press left up
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) close.current(); };
    addEventListener("keydown", onKey, true);
    addEventListener("scroll", onScroll, true);
    addEventListener("pointerdown", onDown, true);
    return () => { removeEventListener("keydown", onKey, true); removeEventListener("scroll", onScroll, true); removeEventListener("pointerdown", onDown, true); tipClosed(closer); };
  }, [open, closing, closer]);

  useLayoutEffect(() => {
    const el = triggerOf(wrap.current);
    if (open && tip.current && el) placeTip(tip.current, el, side);
  }, [open, side, content]);

  useEffect(() => () => { window.clearTimeout(timer.current); window.clearTimeout(fade.current); }, []);

  return (
    <span
      ref={wrap}
      className="tt-wrap"
      onPointerEnter={(e) => { if (e.pointerType === "mouse") show(false); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") close.current(); }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") { close.current(true); return; }
        // Touch and pen: hold to read. The tip shows after the long press and stays while the finger is down.
        pressed.current = false;
        touch.current = true;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => { pressed.current = true; instant.current = false; reveal(); }, LONG_PRESS);
      }}
      onPointerUp={(e) => {
        if (e.pointerType === "mouse") return;
        touch.current = false;
        window.clearTimeout(timer.current);
        if (pressed.current) close.current();
      }}
      onPointerCancel={() => { touch.current = false; window.clearTimeout(timer.current); if (pressed.current) { pressed.current = false; close.current(); } }}
      // The click that ends a long press is swallowed here, so the card or button around the number never opens
      onClickCapture={(e) => { if (pressed.current) { e.preventDefault(); e.stopPropagation(); pressed.current = false; } }}
      onContextMenu={(e) => { if (pressed.current || touch.current) e.preventDefault(); }}
      onFocus={(e) => { if ((e.target as HTMLElement).matches?.(":focus-visible")) show(true); }}
      onBlur={() => close.current()}
    >
      {typeof children === "string" || typeof children === "number" ? <span>{children}</span> : children}
      <span id={id} hidden>{content}</span>
      {open && createPortal(<div ref={tip} className={kind ? `tt tt-${kind}` : "tt"} aria-hidden="true" data-instant={instant.current && !closing ? "" : undefined} data-closing={closing ? "" : undefined}><span className="tt-in">{content}</span></div>, document.body)}
    </span>
  );
}

/** Wraps a number in its numerals: "You lost 137.3 to 138.7" with each figure in Geist Mono (.num). */
export function nums(text: string): ReactNode {
  const parts = text.split(/(-?\d[\d,.]*%?)/);
  return parts.length === 1 ? text : parts.map((x, i) => (i % 2 ? <span key={i} className="num">{x}</span> : x));
}

/**
 * A tip that says what a bare number is: a plain label, and a quieter line of context under it when that helps.
 * Opens on a longer hover (NUM_DELAY) or a long press, never takes the tap from the card around it, and is only a
 * tab stop when asked (not inside a card that is already one button).
 */
export function NumTip({ label, note, children, focusable = false, side = "top" }: {
  label: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  focusable?: boolean;
  side?: "top" | "bottom";
}) {
  const fix = (x: ReactNode) => (typeof x === "string" ? nums(x) : x);
  return (
    <Tooltip kind="num" delay={NUM_DELAY} focusable={focusable} side={side}
      content={<>{fix(label)}{note ? <small>{fix(note)}</small> : null}</>}>
      {children}
    </Tooltip>
  );
}
