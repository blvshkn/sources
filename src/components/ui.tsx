import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Player, onBye } from "../data";
import { fmt } from "../engine";

import { Icon, type IconName } from "./icons";
export { Icon };
export type { IconName } from "./icons";

export const PosBadge = ({ pos }: { pos: string }) => <span className={`pos pos-${pos}`}>{pos}</span>;

export function StatusPill({ p }: { p: Player }) {
  if (onBye(p.nfl)) return <span className="status status-BYE" title="On bye this week">Bye</span>;
  if (!p.status) return null;
  return <span className={`status status-${p.status}`} title={p.note}>{p.status === "O" ? "Out" : "Questionable"}</span>;
}

export function Delta({ n, suffix = "" }: { n: number; suffix?: string }) {
  const cls = n >= 0.05 ? "up" : n <= -0.05 ? "down" : "flat";
  return <span className={`delta ${cls}`}>{fmt(n)}{suffix}</span>;
}

export function Stamp({ children = "Per sources" }: { children?: ReactNode }) {
  return <span className="stamp">{children}</span>;
}

/** Guardrail: AI-written text is labeled and links to the data behind it. */
export function AiLabel({ onData, dataLabel = "See the numbers" }: { onData?: () => void; dataLabel?: string }) {
  return (
    <span className="ai-label">
      <Icon name="spark" size={12} />AI summary
      {onData && <button className="linkish" onClick={onData}>{dataLabel}</button>}
    </span>
  );
}

/** Build-phase labels were for internal review. Users never see them. */
export const Phase = (_: { v: "MVP" | "v1" | "Later" }) => null;

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: string; icon?: IconName }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.v} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.icon && <Icon name={o.icon} size={16} />}{o.label}</button>)}
    </div>
  );
}

/**
 * Section tabs under a page title. Switching keeps the tab row exactly where it was on screen:
 * the page never jumps when the new section is shorter, and nothing animates in.
 */
export function PageTabs<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string; icon?: IconName }[]; onChange: (v: T) => void }) {
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
  return <div ref={ref} className="page-tabs"><Seg label="Section" value={value} onChange={pick} options={options} /></div>;
}

/** useState that survives a reload. Per-device convenience only; falls back to the default if storage is blocked. */
export function useSticky<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(`sources.ui.${key}`); return (s as T) ?? initial; } catch { return initial; }
  });
  const set = (n: T) => { setV(n); try { localStorage.setItem(`sources.ui.${key}`, n); } catch { /* ignore */ } };
  return [v, set];
}

/** A live score. When it goes up, it ticks lime for a moment so you notice the change. Alternates two
 *  animation names so back to back updates restart the tick. */
export function LiveNum({ v, className }: { v: number; className?: string }) {
  const prev = useRef(v);
  const [bump, setBump] = useState(0);
  useEffect(() => { if (v > prev.current + 0.05) setBump((b) => b + 1); prev.current = v; }, [v]);
  return <span className={className} data-bump={bump ? (bump % 2 ? "a" : "b") : undefined}>{v.toFixed(1)}</span>;
}
