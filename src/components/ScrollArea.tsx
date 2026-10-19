import { forwardRef, useEffect, useRef, type ForwardedRef, type HTMLAttributes, type MutableRefObject } from "react";

/**
 * Our own scrollbar. The element still scrolls natively (wheel, touch, keyboard, find-in-page), but its
 * native bar is hidden (scroll.css, [data-sa]) and we draw a thin thumb inside the container's rounded box.
 * That keeps the bar inside the corners even when macOS "Show scroll bars: Always" makes Chrome draw
 * classic bars that CSS can only partly style.
 *
 * - Thumb: 4px, 6px while hovered or dragged, 4px in from the right edge, track clear of the corner radius.
 * - Fades in on scroll or hover, out after 900ms idle. Drag the thumb; click the lane to page.
 * - Size and position from scrollHeight / clientHeight / scrollTop, via scroll events, a ResizeObserver
 *   and a MutationObserver, batched with requestAnimationFrame.
 * - The track sits beside the scroller in its positioned parent when it can, so the compositor scrolls
 *   the content without dragging the thumb along; otherwise it lives inside the scroller and follows scrollTop.
 */

const IDLE = 900;
const LANE = 14;   // hit area at the right edge, in px
const MIN = 28;    // shortest thumb

type Rect = { top: number; bottom: number };

/** Clearance the track needs at the top and bottom so it never runs into a rounded corner. */
function cornerClearance(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  let top = 4, bottom = 4;
  let a: HTMLElement | null = el;
  for (let i = 0; a && a !== document.body && i < 6; i++, a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (a !== el && cs.overflow === "visible" && cs.overflowY === "visible") continue;
    const rt = parseFloat(cs.borderTopRightRadius) || 0, rb = parseFloat(cs.borderBottomRightRadius) || 0;
    if (!rt && !rb) continue;
    const ar = a.getBoundingClientRect();
    const dTop = r.top - ar.top, dBottom = ar.bottom - r.bottom;
    if (rt && dTop < rt) top = Math.max(top, rt - dTop + 4);
    if (rb && dBottom < rb) bottom = Math.max(bottom, rb - dBottom + 4);
  }
  return { top, bottom };
}

const attached = new WeakMap<HTMLElement, () => void>();
let seq = 0;

/** Give one scrolling element the custom scrollbar. Returns a cleanup. Safe to call twice. */
export function attachScrollbar(el: HTMLElement): () => void {
  const prior = attached.get(el);
  if (prior) return prior;

  const track = document.createElement("div");
  track.className = "sa-track";
  track.setAttribute("aria-hidden", "true");
  const thumb = document.createElement("div");
  thumb.className = "sa-thumb";
  track.appendChild(thumb);

  const id = String(++seq);
  el.setAttribute("data-sa", id);
  track.setAttribute("data-sa-for", id);
  const parent = el.parentElement;
  const elPos = getComputedStyle(el).position;
  // Beside the scroller when its parent positions it; inside it otherwise
  const beside = !!parent && getComputedStyle(parent).position !== "static" && elPos !== "fixed" && el.offsetParent === parent;
  let setPos = false;
  if (!beside && elPos === "static") { el.style.position = "relative"; setPos = true; }
  if (beside) {
    const z = parseInt(getComputedStyle(el).zIndex, 10);
    if (!Number.isNaN(z)) track.style.zIndex = String(z + 1);
  }
  const host = beside ? parent! : el;
  // Mounted only while there's overflow, so a list that empties out still matches :empty and :last-child rules
  const mount = () => { if (track.parentElement !== host) host.appendChild(track); };

  let raf = 0, idle = 0, hot = false, drag: { y: number; top: number; ratio: number; id: number } | null = null;
  let geo = { trackH: 0, thumbH: 0, max: 0 };

  const update = () => {
    raf = 0;
    const sh = el.scrollHeight, ch = el.clientHeight;
    const max = sh - ch;
    if (max <= 1 || ch <= 0 || !el.isConnected) { if (track.parentElement) track.remove(); geo.max = 0; return; }
    mount();
    const cs = getComputedStyle(el);
    const bt = parseFloat(cs.borderTopWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0;
    const clear = cornerClearance(el);
    const trackH = Math.max(0, ch - clear.top - clear.bottom);
    const thumbH = Math.min(trackH, Math.max(MIN, (trackH * ch) / sh));
    geo = { trackH, thumbH, max };
    const y = ((trackH - thumbH) * el.scrollTop) / max;
    if (beside) {
      track.style.top = `${el.offsetTop + bt + clear.top}px`;
      track.style.left = `${el.offsetLeft + el.offsetWidth - br - LANE}px`;
    } else {
      track.style.top = `${el.scrollTop + bt + clear.top}px`;
      track.style.left = `${el.scrollLeft + el.clientWidth - LANE}px`;
    }
    if (beside) {
      // The track lives outside the scroller, so it copies the scroller's transform and opacity (a sheet sliding
      // in, or being pulled down) to stay glued to the rounded box
      const tf = cs.transform;
      if (tf && tf !== "none") {
        track.style.transformOrigin = `${el.offsetLeft + el.offsetWidth / 2 - parseFloat(track.style.left)}px ${el.offsetTop + el.offsetHeight / 2 - parseFloat(track.style.top)}px`;
        track.style.transform = tf;
      } else track.style.transform = "";
      thumb.style.opacity = cs.opacity === "1" ? "" : cs.opacity;
    }
    track.style.height = `${trackH}px`;
    thumb.style.height = `${thumbH}px`;
    thumb.style.transform = `translateY(${y}px)`;
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };

  const show = () => {
    track.setAttribute("data-on", "");
    window.clearTimeout(idle);
    idle = window.setTimeout(() => { if (!hot && !drag) track.removeAttribute("data-on"); }, IDLE);
  };
  const setHot = (v: boolean) => {
    if (hot === v) return;
    hot = v;
    if (v) { track.setAttribute("data-hot", ""); show(); }
    else { track.removeAttribute("data-hot"); if (!drag) show(); }
  };

  const onScroll = () => { schedule(); if (geo.max > 0 || el.scrollHeight > el.clientHeight + 1) show(); };
  const onEnter = () => { schedule(); if (geo.max > 0) show(); };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch" || geo.max <= 0) return;
    const r = el.getBoundingClientRect();
    setHot(e.clientX >= r.right - LANE && e.clientX <= r.right);
  };
  const onLeave = (e: PointerEvent) => { if (!drag && !(e.relatedTarget instanceof Node && track.contains(e.relatedTarget))) setHot(false); };
  const onTrackLeave = (e: PointerEvent) => { if (!drag && !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) setHot(false); };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || geo.max <= 0) return;
    e.preventDefault(); e.stopPropagation();
    if (e.target === thumb) {
      drag = { y: e.clientY, top: el.scrollTop, ratio: geo.max / Math.max(1, geo.trackH - geo.thumbH), id: e.pointerId };
      thumb.setPointerCapture(e.pointerId);
      track.setAttribute("data-drag", "");
    } else {
      // Click on the lane pages toward the click, like a native track
      const tr = thumb.getBoundingClientRect();
      el.scrollBy({ top: (e.clientY < tr.top ? -1 : 1) * el.clientHeight * 0.9, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
    show();
  };
  const onDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    el.scrollTop = drag.top + (e.clientY - drag.y) * drag.ratio;
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    track.removeAttribute("data-drag");
    if (thumb.hasPointerCapture(e.pointerId)) thumb.releasePointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    setHot(e.clientX >= r.right - LANE && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
    show();
  };

  el.addEventListener("scroll", onScroll, { passive: true });
  el.addEventListener("pointerenter", onEnter);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerleave", onLeave);
  track.addEventListener("pointermove", onMove);
  track.addEventListener("pointerleave", onTrackLeave);
  track.addEventListener("pointerdown", onDown);
  thumb.addEventListener("pointermove", onDrag);
  thumb.addEventListener("pointerup", onUp);
  thumb.addEventListener("pointercancel", onUp);
  window.addEventListener("resize", schedule);

  const ro = new ResizeObserver(schedule);
  const observeKids = () => { ro.observe(el); for (const c of Array.from(el.children)) if (c !== track) ro.observe(c); };
  observeKids();
  const mo = new MutationObserver((recs) => {
    const ours = (n: Node) => n === track || track.contains(n);
    if (recs.every((r) => ours(r.target) || (r.type === "childList" && [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)].every(ours)))) return;
    observeKids(); schedule();
  });
  mo.observe(el, { childList: true, subtree: true, characterData: true });
  // Inline transforms (pull-to-dismiss) and transitions on the scroller move a beside-mounted track with it
  const so = new MutationObserver(schedule);
  if (beside) so.observe(el, { attributes: true, attributeFilter: ["style", "class"] });
  const onTrans = () => schedule();
  el.addEventListener("transitionend", onTrans);
  schedule();

  const destroy = () => {
    attached.delete(el);
    cancelAnimationFrame(raf); window.clearTimeout(idle);
    el.removeEventListener("scroll", onScroll);
    el.removeEventListener("pointerenter", onEnter);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("resize", schedule);
    el.removeEventListener("transitionend", onTrans);
    ro.disconnect(); mo.disconnect(); so.disconnect();
    track.remove();
    el.removeAttribute("data-sa");
    if (setPos) el.style.position = "";
  };
  attached.set(el, destroy);
  return destroy;
}

/** Hook form: attach to whatever element the ref points at. */
export function useScrollArea(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return attachScrollbar(el);
  }, [ref]);
}

/** A div that scrolls with the custom scrollbar. The ref (object or callback) is the scrolling element itself. */
export const ScrollArea = forwardRef(function ScrollArea(props: HTMLAttributes<HTMLDivElement>, fwd: ForwardedRef<HTMLDivElement>) {
  const own = useRef<HTMLDivElement | null>(null);
  useScrollArea(own);
  return (
    <div {...props} ref={(node) => {
      own.current = node;
      if (typeof fwd === "function") fwd(node);
      else if (fwd) (fwd as MutableRefObject<HTMLDivElement | null>).current = node;
    }} />
  );
});

/**
 * Every contained scroller in the app, including ones in markup this file doesn't own (menus, panels, sheets).
 * Elements are picked up as they mount and cleaned up as they unmount. Only ones that actually scroll
 * vertically get a bar; side-scrolling rows keep theirs hidden in CSS.
 */
export const SCROLL_AREAS = [
  ".side", ".ibx-list", ".sel-list", ".tp-list", ".qs-opts", ".qs-scroll", ".mu-swap", ".psr-list",
  ".ps", ".ps-body", ".sheet", ".builder .deal", ".ob-teams", ".onboard", "[data-scroll-area]",
].join(", ");

export function scrollAreas(root: HTMLElement = document.body) {
  let raf = 0;
  const live = new Set<HTMLElement>();
  const scan = () => {
    raf = 0;
    for (const el of live) if (!el.isConnected) { attached.get(el)?.(); live.delete(el); }
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(SCROLL_AREAS))) {
      if (live.has(el) || attached.has(el)) continue;
      const oy = getComputedStyle(el).overflowY;
      if (oy !== "auto" && oy !== "scroll") continue;
      attachScrollbar(el); live.add(el);
    }
  };
  const mo = new MutationObserver((recs) => {
    if (recs.every((r) => r.target instanceof Element && (r.target.classList.contains("sa-track") || r.target.classList.contains("sa-thumb")))) return;
    if (!raf) raf = requestAnimationFrame(scan);
  });
  mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  // A breakpoint can turn overflow on (the sidebar scrolls only on desktop)
  const onResize = () => { if (!raf) raf = requestAnimationFrame(scan); };
  window.addEventListener("resize", onResize);
  scan();
  return () => { mo.disconnect(); window.removeEventListener("resize", onResize); cancelAnimationFrame(raf); for (const el of live) attached.get(el)?.(); live.clear(); };
}
