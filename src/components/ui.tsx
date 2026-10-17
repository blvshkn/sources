import type { ReactNode } from "react";
import { Player, onBye } from "../data";
import { fmt } from "../engine";

export type IconName =
  | "wire" | "league" | "trade" | "roster" | "check" | "x" | "lock" | "copy" | "msg" | "send" | "share" | "alert"
  | "waivers" | "ask" | "gear" | "mic" | "chev" | "group" | "app" | "plug" | "trash" | "spark" | "clock" | "eye";

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "wire": return <svg {...p}><path d="M4 6h16M4 12h10M4 18h7" /><circle cx="19" cy="16" r="3" /></svg>;
    case "league": return <svg {...p}><rect x="3" y="4" width="7" height="7" rx="1.5" /><rect x="14" y="4" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
    case "trade": return <svg {...p}><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></svg>;
    case "roster": return <svg {...p}><path d="M12 3v18M4 7h16M4 17h16" /><rect x="3" y="3" width="18" height="18" rx="3" /></svg>;
    case "check": return <svg {...p} strokeWidth={3}><path d="m5 12 5 5 9-10" /></svg>;
    case "x": return <svg {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>;
    case "lock": return <svg {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
    case "copy": return <svg {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></svg>;
    case "msg": return <svg {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.7A8 8 0 1 1 21 12Z" /></svg>;
    case "send": return <svg {...p}><path d="m4 12 16-8-6 16-2-7-8-1Z" /></svg>;
    case "share": return <svg {...p}><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>;
    case "alert": return <svg {...p}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>;
    case "waivers": return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>;
    case "ask": return <svg {...p}><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.6-.8 1.1M12 15.5h.01" /></svg>;
    case "gear": return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>;
    case "mic": return <svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
    case "chev": return <svg {...p}><path d="m9 6 6 6-6 6" /></svg>;
    case "group": return <svg {...p}><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6" /></svg>;
    case "app": return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M9 12h6M12 9v6" /></svg>;
    case "plug": return <svg {...p}><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0V7ZM12 16v5" /></svg>;
    case "trash": return <svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
    case "spark": return <svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></svg>;
    case "clock": return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "eye": return <svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
  }
}

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
      <Icon name="spark" size={12} />AI-written from engine numbers
      {onData && <button className="linkish" onClick={onData}>{dataLabel}</button>}
    </span>
  );
}

export const Phase = ({ v }: { v: "MVP" | "v1" | "Later" }) => <span className={`phase phase-${v}`}>{v === "v1" ? "v1 preview" : v}</span>;

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.v} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.label}</button>)}
    </div>
  );
}
