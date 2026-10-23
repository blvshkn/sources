import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, PointerEvent as RPointerEvent } from "react";
import { Player, onBye } from "../data";
import { fmt } from "../engine";

import { Icon, type IconName } from "./icons";
import { Tooltip } from "./Tooltip";
import { AiMark } from "./WorkingLoader";
import { mo } from "../motion";
import { haptic } from "../haptics";
import { MorphPill, RollNum } from "../gameDayMotion";
export { Icon };
export type { IconName } from "./icons";

export const PosBadge = ({ pos }: { pos: string }) => <span className={`pos pos-${pos}`}>{pos}</span>;

export function StatusPill({ p }: { p: Player }) {
  if (onBye(p.nfl)) return <Tooltip content="On bye this week. He won't score."><span className="status status-BYE">Bye</span></Tooltip>;
  if (!p.status) return null;
  const tip = p.injury === "IR" ? "On injured reserve. Can move to an IR slot." : p.injury === "PUP" ? "On the PUP list." : p.injury === "Sus" ? "Suspended." : p.status === "O" ? "Ruled out this week." : p.injury === "Doubtful" ? "Doubtful. Unlikely to play." : "Questionable. Check his status before lock.";
  // Same word Sleeper uses, so IR, PUP and Doubtful don't all read as Out or Questionable
  const word = p.injury === "IR" ? "IR" : p.injury === "PUP" ? "PUP" : p.injury === "Sus" ? "Suspended" : p.injury === "Doubtful" ? "Doubtful" : p.status === "O" ? "Out" : "Questionable";
  // A status that changes while the pill is up (Questionable to Out) morphs its word and shifts its color
  return <Tooltip content={p.note ? <>{tip}<small>{p.note}</small></> : tip}><MorphPill className={`status status-${p.status}`} word={word} /></Tooltip>;
}

export function Delta({ n, suffix = "" }: { n: number; suffix?: string }) {
  const cls = n >= 0.05 ? "up" : n <= -0.05 ? "down" : "flat";
  return <span className={`delta ${cls}`}>{fmt(n)}{suffix}</span>;
}

export function Stamp({ children = "Per sources" }: { children?: ReactNode }) {
  return <span className="stamp">{children}</span>;
}

/** Guardrail: AI-written text is labeled and links to the data behind it. */
export function AiLabel({ onData, dataLabel = "See the numbers", thinking = false }: { onData?: () => void; dataLabel?: string; /** Still writing: a slow sheen runs across the words until the answer lands */ thinking?: boolean }) {
  return (
    <span className="ai-label">
      <Tooltip focusable content="Written by AI from this league's data. Worth a second look before you act."><span className="ai-label-k"><AiMark size={14} /><span className={thinking ? "ai-shine" : undefined}>AI summary</span></span></Tooltip>
      {onData && <button className="linkish" onClick={onData}>{dataLabel}</button>}
    </span>
  );
}

/** Build-phase labels were for internal review. Users never see them. */
export const Phase = (_: { v: "MVP" | "v1" | "Later" }) => null;

/**
 * Segmented control. One thumb slides under the picked option instead of each button lighting up on its own: it is
 * placed at the picked button, and on a change it plays from the old spot and width to the new one, stretching across both on the way and springing in (a FLIP on
 * transform alone). Reduced motion: the thumb fades in at its new spot. Page tabs (PageTabs)
 * are separate chips, not one track, so they keep their own highlight (thumb={false}).
 */
export function Seg<T extends string>({ value, options, onChange, label, thumb = true }: { value: T; options: { v: T; label: string; icon?: IconName }[]; onChange: (v: T) => void; label: string; thumb?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const th = useRef<HTMLSpanElement>(null);
  const last = useRef<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const seg = ref.current, el = th.current;
    if (!thumb || !seg || !el) return;
    const place = () => {
      const b = seg.querySelector<HTMLElement>(':scope > button[aria-pressed="true"]');
      if (!b) { el.style.opacity = "0"; return null; }
      el.style.opacity = "";
      el.style.top = `${b.offsetTop}px`; el.style.height = `${b.offsetHeight}px`; el.style.width = `${b.offsetWidth}px`;
      el.style.transform = `translateX(${b.offsetLeft}px)`;
      return { x: b.offsetLeft, w: b.offsetWidth };
    };
    const prev = last.current, now = place();
    last.current = now;
    if (prev && now && (prev.x !== now.x || prev.w !== now.w)) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      el.getAnimations().forEach((a) => a.cancel());
      if (reduce) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: mo(160), easing: "ease-out" });
      else {
        // Rubber segment: on the way the thumb stretches to span a little more than both tabs' edges, then springs
        // into the new one with a small overshoot (Motion Picks, approved)
        const l = Math.min(prev.x, now.x), r = Math.max(prev.x + prev.w, now.x + now.w);
        const mid = { x: l + (r - l) * 0.04, w: (r - l) * 0.92 };
        el.animate([
          { transform: `translateX(${prev.x}px) scaleX(${prev.w / now.w})` },
          { transform: `translateX(${mid.x}px) scaleX(${mid.w / now.w})`, offset: 0.45 },
          { transform: `translateX(${now.x}px)` },
        ], { duration: mo(320), easing: "cubic-bezier(0.34, 1.3, 0.64, 1)" });
      }
    }
    // A resize (fonts landing, the row reflowing) re-places it without motion
    const ro = new ResizeObserver(() => { last.current = place(); });
    ro.observe(seg);
    return () => ro.disconnect();
  }, [value, thumb, options.length]);
  // Drag to pick (Zach, Oct 23): press anywhere on the track and slide; the thumb snaps to whichever option is under the
  // finger, with a light tick per change, like the iOS control. A drag swallows the click it ends in, so letting go
  // never snaps back to where it started. Vertical swipes still scroll the page (touch-action: pan-y in CSS).
  const drag = useRef<{ id: number; x0: number; moved: boolean; at: T } | null>(null);
  const eat = useRef(false);
  const optAt = (x: number): T | null => {
    const btns = ref.current ? [...ref.current.querySelectorAll<HTMLElement>(":scope > button")] : [];
    let best = -1, d = Infinity;
    btns.forEach((b, i) => { const r = b.getBoundingClientRect(); const dd = x < r.left ? r.left - x : x > r.right ? x - r.right : 0; if (dd < d) { d = dd; best = i; } });
    return best >= 0 ? options[best].v : null;
  };
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (!thumb || e.button !== 0) return;
    drag.current = { id: e.pointerId, x0: e.clientX, moved: false, at: value };
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    if (!g.moved) {
      if (Math.abs(e.clientX - g.x0) < 6) return;
      g.moved = true;
      try { ref.current?.setPointerCapture(e.pointerId); } catch { /* fine without capture */ }
    }
    const v = optAt(e.clientX);
    if (v && v !== g.at) { g.at = v; haptic("tap"); onChange(v); }
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    drag.current = null;
    if (g.moved) { eat.current = true; window.setTimeout(() => { eat.current = false; }, 0); }
  };
  return (
    <div ref={ref} className={`seg${thumb ? " has-thumb" : ""}`} role="group" aria-label={label}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }}
      onClickCapture={(e) => { if (eat.current) { e.stopPropagation(); e.preventDefault(); eat.current = false; } }}>
      {options.map((o) => <button key={o.v} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.icon && <Icon name={o.icon} size={16} />}{o.label}</button>)}
      {thumb && <span ref={th} className="seg-thumb" aria-hidden="true" />}
    </div>
  );
}

/**
 * Section tabs under a page title. Switching keeps the tab row exactly where it was on screen:
 * the page never jumps when the new section is shorter, and nothing animates in.
 */
export function PageTabs<T extends string>({ value, options, onChange, inSheet = false, label = "Section", className = "" }: {
  value: T; options: { v: T; label: string; icon?: IconName }[]; onChange: (v: T) => void;
  /** In a sheet or modal: the sheet's own body scrolls, so the page isn't held in place on a switch */
  inSheet?: boolean; label?: string; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the selected tab visible in the scrolling row: jump there on open, glide there on change
  const first = useRef(true);
  useEffect(() => {
    const row = ref.current?.querySelector<HTMLElement>(".seg");
    const btn = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !btn || row.scrollWidth <= row.clientWidth) { first.current = false; return; }
    const r = row.getBoundingClientRect(), bb = btn.getBoundingClientRect();
    const left = row.scrollLeft + (bb.left - r.left) - (row.clientWidth - bb.width) / 2;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollTo({ left: Math.max(0, left), behavior: first.current || reduce ? ("instant" as ScrollBehavior) : "smooth" });
    first.current = false;
  }, [value]);
  // Sticky on scroll (Zach, Oct 22): page tabs stay put under the phone top bar, or at the top on tablet and desktop.
  // Measures where to stick, how far the backing band reaches to the page column's edges, and whether it's stuck.
  useEffect(() => {
    const el = ref.current;
    if (inSheet || !el || el.parentElement?.className.split(" ").indexOf("main-inner") === -1) return;
    el.classList.add("pt-sticky");
    const root = document.documentElement;
    const measure = () => {
      const bar = document.querySelector<HTMLElement>(".topbar");
      const barH = bar && getComputedStyle(bar).position === "sticky" ? bar.getBoundingClientRect().height : 0;
      const main = el.closest<HTMLElement>(".main") ?? el.parentElement!;
      const mr = main.getBoundingClientRect(), pr = el.parentElement!.getBoundingClientRect();
      el.style.setProperty("--pt-top", `${Math.round(barH)}px`);
      el.style.setProperty("--pt-l", `${Math.max(0, Math.round(pr.left - mr.left))}px`);
      el.style.setProperty("--pt-r", `${Math.max(0, Math.round(mr.right - pr.right))}px`);
      stickAt = parseFloat(getComputedStyle(el).top) || 0;
      check();
    };
    // Stuck is read straight from where the tabs sit: pinned at their sticky line once the page has moved. A position
    // check on scroll works the same in every browser and inside the landing's scaled phone frames, where an
    // intersection threshold of exactly 1 can be missed (Zach, Oct 22: the band didn't show there).
    let stickAt = 0, raf = 0;
    const check = () => {
      raf = 0;
      const stuck = window.scrollY > 0 && el.getBoundingClientRect().top <= stickAt + 0.5;
      if (stuck !== el.classList.contains("is-stuck")) { el.classList.toggle("is-stuck", stuck); root.toggleAttribute("data-tabs-stuck", stuck); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    window.addEventListener("scroll", onScroll, { passive: true });
    measure();
    const ro = new ResizeObserver(measure); ro.observe(document.body);
    return () => { ro.disconnect(); window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); root.removeAttribute("data-tabs-stuck"); };
  }, [inSheet]);
  const pick = (v: T) => {
    if (v === value) return;
    if (inSheet) { onChange(v); return; }
    const el = ref.current; const main = document.getElementById("main");
    if (!el || !main) { onChange(v); return; }
    // Stuck: measure from where the tabs sit in the page, not where they're pinned, and land the new section's top
    // right under them
    const stuck = el.classList.contains("is-stuck");
    const stickAt = parseFloat(getComputedStyle(el).top) || 0;
    const prev = el.previousElementSibling as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(el.parentElement!).rowGap) || 0;
    const top = stuck && prev ? prev.getBoundingClientRect().bottom + gap : el.getBoundingClientRect().top;
    const docTop = top + window.scrollY;
    const bar = (document.querySelector(".topbar, header.top") as HTMLElement | null)?.getBoundingClientRect().bottom ?? 0;
    // Enough room below the tabs that a short section can't pull the page up
    main.style.minHeight = `${Math.ceil(docTop - main.getBoundingClientRect().top - window.scrollY + window.innerHeight)}px`;
    onChange(v);
    requestAnimationFrame(() => {
      const target = stuck ? docTop - stickAt : top < bar ? docTop - bar - 8 : docTop - top;
      window.scrollTo({ top: Math.max(0, target), behavior: "instant" as ScrollBehavior });
    });
  };
  return <div ref={ref} className={`page-tabs ${className}`.trim()}><Seg label={label} value={value} onChange={pick} options={options} thumb={false} /></div>;
}

/** useState that survives a reload. Per-device convenience only; falls back to the default if storage is blocked. */
export function useSticky<T extends string>(key: string, initial: T, allowed?: readonly T[]): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(`sources.ui.${key}`) as T | null;
      // A value saved by an older version may name a tab or filter that no longer exists.
      return s && (!allowed || allowed.includes(s)) ? s : initial;
    } catch { return initial; }
  });
  const set = (n: T) => { setV(n); try { localStorage.setItem(`sources.ui.${key}`, n); } catch { /* ignore */ } };
  return [v, set];
}

/** A live score. When it changes, the digits that changed morph into place (up for a rise), so you see the points
 *  arrive. It mounts settled. */
export function LiveNum({ v, className }: { v: number; className?: string }) {
  return <RollNum v={v} className={className} />;
}
