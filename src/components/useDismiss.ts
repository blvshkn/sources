import { useEffect, useRef, type RefObject } from "react";

/**
 * The one way an overlay closes from outside. Every modal, sheet, menu, dropdown and popover registers here while
 * it's open, and the layers stack in the order they opened:
 *
 * - Escape closes the topmost layer only. Handlers inside the layer (a list's own key handling, a field that clears
 *   first) run before this and can claim the key with stopPropagation or preventDefault.
 * - A pointerdown outside the topmost layer closes it, mouse and touch alike, when `outside` is on (menus, dropdowns,
 *   popovers). The click goes on through to whatever was tapped, like useSwapMenu always did. Modals and sheets set
 *   `outside: false` because their scrim covers the page and takes that tap itself, so nothing underneath fires.
 *   A menu closed by a tap on the scrim of the sheet it sits in swallows that click, so only the menu closes.
 * - Focus goes back to the opener when the layer closes, unless the person has already put it somewhere else.
 * - `escape: false, outside: false` is for destructive asks (delete, disconnect, anything that removes data): they
 *   stay up until answered. Mark the element with `// dismiss-exempt: destructive` for scripts/check-dismiss-static.mjs.
 */
export type DismissReason = "escape" | "outside";

export interface DismissOptions {
  /** Whether the layer is up. Defaults to true, for components that only mount while open. */
  open?: boolean;
  /** What opened it, for focus return and so a tap on it toggles instead of closing and reopening. Defaults to
   *  whatever had focus (or was last pressed) when the layer opened. */
  opener?: RefObject<HTMLElement | null> | (() => HTMLElement | null | undefined);
  /** Close on a pointerdown outside. Default true; false when a scrim covering the page handles the tap. */
  outside?: boolean;
  /** Close on Escape. Default true. */
  escape?: boolean;
  /** Taps on elements matching this (selector or test) don't count as outside. */
  keep?: string | ((t: Element) => boolean);
  /** Put focus back on the opener when the layer closes. Default true. */
  restoreFocus?: boolean;
}

interface Layer {
  el: () => HTMLElement | null;
  opener: () => HTMLElement | null;
  opts: () => DismissOptions;
  close: (r: DismissReason, t?: Element | null) => void;
  closedAt: number;
}

const stack: Layer[] = [];
const SCRIM = ".ps-scrim, .scrim, .ibx-scrim, [data-scrim]";
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"]';
let lastPress: { el: HTMLElement; at: number } | null = null;
/** Recently focused elements, newest first, so a layer that moves focus inside itself before registering still
 *  knows what had it before. */
let focused: HTMLElement[] = [];
let wired = false;

/** Layers that are up and not already on their way out (a close animation keeps a layer mounted for a moment). */
const top = () => { for (let i = stack.length - 1; i >= 0; i--) if (Date.now() - stack[i].closedAt > 400) return stack[i]; return null; };

const swallowNextClick = () => {
  const eat = (e: Event) => { e.stopPropagation(); e.preventDefault(); off(); };
  const off = () => { document.removeEventListener("click", eat, true); window.clearTimeout(t); };
  document.addEventListener("click", eat, true);
  const t = window.setTimeout(off, 800);
};

function wire() {
  if (wired || typeof document === "undefined") return;
  wired = true;
  document.addEventListener("focusin", (e) => {
    if (e.target instanceof HTMLElement) focused = [e.target, ...focused.filter((x) => x !== e.target)].slice(0, 8);
  }, true);
  document.addEventListener("pointerdown", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const f = t?.closest<HTMLElement>(FOCUSABLE);
    if (f) lastPress = { el: f, at: Date.now() };
    const l = top();
    if (!l || !t || !t.isConnected) return;
    const o = l.opts();
    if (o.outside === false) return;
    if (l.el()?.contains(t) || l.opener()?.contains(t)) return;
    if (o.keep && (typeof o.keep === "string" ? t.closest(o.keep) : o.keep(t))) return;
    // A tap on a lower sheet's scrim closes only this layer, not the sheet under it too
    if (stack.length > 1 && t.closest(SCRIM)) swallowNextClick();
    l.closedAt = Date.now();
    l.close("outside", t);
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    const l = top();
    if (!l) return;
    // Only the topmost layer closes, and only when it takes Escape (a destructive ask stays put). preventDefault
    // marks the key as used for anything listening after this; the icon tips (tooltips.ts) still hide on it.
    if (l.opts().escape === false) return;
    e.preventDefault();
    l.closedAt = Date.now();
    l.close("escape");
  });
}

const resolve = (o: DismissOptions["opener"]) => (typeof o === "function" ? o() ?? null : o?.current ?? null);
const lost = (box: HTMLElement | null) => {
  const a = document.activeElement;
  return !a || a === document.body || !a.isConnected || (!!box && box.contains(a));
};

wire();

export function useDismiss(ref: RefObject<HTMLElement | null>, onClose: (reason: DismissReason, target?: Element | null) => void, options: DismissOptions = {}) {
  const live = useRef({ onClose, options });
  live.current = { onClose, options };
  const open = options.open ?? true;
  useEffect(() => {
    if (!open) return;
    let box: HTMLElement | null = ref.current;
    const outsideBox = (x: HTMLElement | null | undefined) => !!x && x !== document.body && x.isConnected && !box?.contains(x);
    const pressed = lastPress && Date.now() - lastPress.at < 1000 ? lastPress.el : null;
    // Captured at open: what had focus before the layer took it, or on touch (where a tap doesn't focus a button)
    // what was just pressed
    const fallback = (pressed && outsideBox(pressed) ? pressed : null) ?? focused.find(outsideBox) ?? null;
    const layer: Layer = {
      el: () => (box = ref.current ?? box),
      opener: () => resolve(live.current.options.opener) ?? fallback,
      opts: () => live.current.options,
      close: (r, t) => live.current.onClose(r, t),
      closedAt: 0,
    };
    stack.push(layer);
    return () => {
      const i = stack.indexOf(layer);
      if (i >= 0) stack.splice(i, 1);
      if (live.current.options.restoreFocus === false) return;
      const back = layer.opener();
      if (!back || !back.isConnected) return;
      const give = () => { if (lost(box) && back.isConnected) back.focus({ preventScroll: true }); };
      give();
      // A tap outside blurs to the page after this runs (the mousedown lands after the pointerdown that closed it)
      window.setTimeout(give, 0);
      window.setTimeout(give, 350);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** For a backdrop that is the dialog's own parent (FirstRun): a click counts only when it both started and ended on
 *  the backdrop itself, so a text selection dragged out of the card doesn't close it. */
export function backdropClose(close: () => void) {
  let down: EventTarget | null = null;
  return {
    onPointerDown: (e: { target: EventTarget; currentTarget: EventTarget }) => { down = e.target === e.currentTarget ? e.target : null; },
    onClick: (e: { target: EventTarget; currentTarget: EventTarget }) => { if (down && e.target === e.currentTarget) close(); down = null; },
  };
}
