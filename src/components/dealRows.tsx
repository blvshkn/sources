// The deal readout's pieces the landing page shares with the trade builder: the one-sentence why, the comparison rows,
// the points cell and the accept cell. Kept out of Trade.tsx so the landing can draw its sample deal without pulling
// the whole builder (and the app behind it) into its first download. Trade.tsx re-exports all of them.
import type { ReactNode } from "react";
import { FAIR_GAP, fmt, valueEdge, valueRatio, type Acceptance } from "../engine";
import { Tooltip } from "./Tooltip";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** The why, in one plain sentence: your points, then your value, then what to do. */
function pointsClause(d: number) {
  return d <= -0.05 ? `You lose ${Math.abs(d).toFixed(1)} points a week` : d >= 0.05 ? `You gain ${d.toFixed(1)} points a week` : "Your lineup barely moves";
}
function valueClause(give: number, get: number) {
  const gap = Math.max(give, get) > 0 ? (get - give) / Math.max(give, get) : 0;
  if (Math.abs(gap) <= FAIR_GAP) return "the value is about even";
  return valueEdge(give > get ? "give" : "get", valueRatio(give, get));
}
/** "Your lineup barely moves" has its own subject, so the value half needs "you". */
export function pointsAndValue(d: number, give: number, get: number) {
  const p = pointsClause(d), v = valueClause(give, get);
  return `${p} and ${p.startsWith("Your") && !v.startsWith("the ") ? "you " : ""}${v}.`;
}
const NEXT: Record<string, (them: string) => string> = {
  "Win-win": () => "Both sides have a reason to say yes.",
  "Helps both, tilted your way": (t) => `${t} may want a little more first.`,
  "Helps both, you overpay": () => "Only worth it if you need the fit.",
  "Tough sell": (t) => `${t} gets nothing out of it, so add something.`,
  "You're overpaying": () => "Ask for a little more before you send it.",
  "Hurts your lineup": () => "Start from a position you need instead.",
  "Value over points": () => "Only worth it if you can spare the points now.",
  "Value play": () => "Worth sending as it stands.",
  "Lateral": () => "Not worth sending as it stands.",
  "Take it": () => "Accept it.",
  "Win-now move": () => "Worth it if you're chasing a title this year.",
  "Close": () => "Ask for a small sweetener.",
  "Lowball": () => "Counter or decline.",
};
export function dealWhy(label: string, youDelta: number, give: number, get: number, them: string) {
  return `${pointsAndValue(youDelta, give, get)} ${NEXT[label]?.(them) ?? ""}`.trim();
}
/** Their odds in neutral ink: it's their call, not good or bad for you. The why sits in a tooltip. */
export function AcceptCell({ a }: { a: Acceptance }) {
  const word = a.label === "Likely yes" ? "Likely" : a.label;
  const why = a.theirBlockers.length ? a.theirBlockers : a.reasons;
  const range = a.label === "Likely yes" ? "Likely is 65% and up" : a.label === "Worth a shot" ? "Worth a shot is 50 to 64%" : "Long shot is under 50%";
  return (
    <span className="dv-v">
      <Tooltip focusable content={<>{why.length ? `${why.map(cap).join(". ")}. ` : ""}{range}, from their needs, notes and trade history.</>}>
        <b className={`dv-acc tt-term ${a.label === "Likely yes" ? "is-likely" : a.label === "Worth a shot" ? "is-maybe" : "is-long"}`}>{word}, <span className="dv-pct">{Math.round(a.p * 100)}%</span></b>
      </Tooltip>
    </span>
  );
}

export interface DvCol { id: string; head: ReactNode; you?: boolean }
export interface DvRow { label: string; tip?: string; cells: ReactNode[]; extra?: ReactNode; cls?: string }
/** Comparison rows: label on the left, a right-aligned column per team, every row on the same grid. */
export function DealRows({ cols, rows }: { cols: DvCol[]; rows: DvRow[] }) {
  return (
    <div className="dv-rows" style={{ ["--dv-n" as string]: cols.length }} role="table" aria-label="How the deal compares">
      <div className="dv-row dv-headrow" role="row">
        <span className="dv-l" role="columnheader"><span className="sr-only">Measure</span></span>
        {cols.map((c) => <span key={c.id} className={`dv-h${c.you ? " you" : ""}`} role="columnheader">{c.head}</span>)}
      </div>
      {rows.map((r) => (
        <div key={r.label} className={`dv-row${r.cls ? ` ${r.cls}` : ""}`} role="row">
          <span className="dv-l" role="rowheader">{r.tip ? <Tooltip focusable content={r.tip}><span className="tt-term">{r.label}</span></Tooltip> : r.label}</span>
          {r.cells.map((c, i) => <span key={i} className="dv-c" role="cell">{c}</span>)}
          {r.extra}
        </div>
      ))}
    </div>
  );
}
const tone = (n: number) => (n >= 0.05 ? "up" : n <= -0.05 ? "down" : "flat");
/** A points cell: the change, big, then before → after in small mono. Only your column gets green or red. */
export function PtsCell({ d, before, after, you }: { d: number; before: number; after: number; you?: boolean }) {
  return <span className="dv-v"><b className={`dv-n${you ? ` ${tone(d)}` : ""}`}>{fmt(d)}</b><small className="dv-s">{before.toFixed(1)} → {after.toFixed(1)}</small></span>;
}
