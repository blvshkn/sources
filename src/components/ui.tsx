import type { ReactNode } from "react";
import { Player, onBye } from "../data";
import { fmt } from "../engine";

import { Icon } from "./icons";
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

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.v} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.label}</button>)}
    </div>
  );
}
