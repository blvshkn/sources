import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Player, onBye } from "../data";
import { fmt } from "../engine";

import { Icon, type IconName } from "./icons";
import { Tooltip } from "./Tooltip";
import { AiMark } from "./WorkingLoader";
import { mo } from "../motion";
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
  return (
    <div ref={ref} className={`seg${thumb ? " has-thumb" : ""}`} role="group" aria-label={label}>
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
  const pick = (v: T) => {
    if (v === value) return;
    if (inSheet) { onChange(v); return; }
    const el = ref.current; const main = document.getElementById("main");
    if (!el || !main) { onChange(v); return; }
    const top = el.getBoundingClientRect().top;
    const docTop = top + window.scrollY;
    const bar = (document.querySelector(".topbar, header.top") as HTMLElement | null)?.getBoundingClientRect().bottom ?? 0;
    // Enough room below the tabs that a short section can't pull the page up
    main.style.minHeight = `${Math.ceil(docTop - main.getBoundingClientRect().top - window.scrollY + window.innerHeight)}px`;
    onChange(v);
    requestAnimationFrame(() => {
      const target = top < bar ? docTop - bar - 8 : docTop - top;
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
