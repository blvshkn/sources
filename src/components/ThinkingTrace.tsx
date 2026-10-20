// The thinking trace: one line that says what Sources is doing and for how long, over a timeline of the real steps
// (think.ts). While it thinks, the plan streams in under the line. While it works, the timeline is open and the
// running step carries the braille loader. When it's done it folds to "Worked 1.4s" with a chevron that opens the
// steps again. The head line is always there, so nothing below it jumps when the steps fold.
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AiDots } from "./AiDots";
import { Icon } from "./icons";
import { MIN_STEP_MS, fillN, type Chip, type TraceState } from "../think";

/** Words per tick when text streams in. Display only: the text is already final when it starts. */
export const WORD_MS = 26;

const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

/** How many words of `total` are showing. Counts up from zero once `go` is true; reduced motion shows them all. */
export function useReveal(total: number, go = true, rate = WORD_MS): number {
  const [k, setK] = useState(() => (go && reduced() ? total : 0));
  useEffect(() => {
    if (!go) { setK(0); return; }
    if (reduced()) { setK(total); return; }
    setK((x) => Math.min(x, total));
    const id = window.setInterval(() => setK((x) => { if (x >= total) { window.clearInterval(id); return x; } return x + 1; }), rate);
    return () => window.clearInterval(id);
  }, [total, go, rate]);
  return k;
}

export const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/**
 * Text that streams in word by word: each new word fades and sharpens in. Words not shown yet still take their
 * space, so the block is its full size from the start and nothing below it moves. `base` is this text's first word
 * in a longer stream; `muteBefore` dims everything older than that word.
 */
export function Words({ text, k, base = 0, muteBefore }: { text: string; k: number; base?: number; muteBefore?: number }) {
  const parts = text.trim().split(/(\s+)/);
  let w = base;
  return (
    <>
      <span className="sr-only">{k > base ? text : ""}</span>
      <span aria-hidden="true">
        {parts.map((p, i) => {
          if (/^\s+$/.test(p)) return p;
          const idx = w++;
          const on = idx < k;
          return <span key={i} className={`thk-w${on ? " on" : ""}${on && muteBefore !== undefined && idx < muteBefore ? " old" : ""}`}>{p}</span>;
        })}
      </span>
    </>
  );
}

/** A short line that streams in once, and again whenever its text changes. */
export function Stream({ text }: { text: string }) {
  return <StreamOnce key={text} text={text} />;
}
function StreamOnce({ text }: { text: string }) {
  const k = useReveal(wordCount(text));
  return <Words text={text} k={k} />;
}

/** A count whose digits roll to their new value. Geist Mono, so the width only changes when a digit is added. */
export function Roll({ n }: { n: number }) {
  const s = n.toLocaleString("en-US");
  const chars = [...s];
  return (
    <span className="thk-roll">
      <span className="sr-only">{s}</span>
      <span aria-hidden="true">
        {chars.map((ch, i) => {
          const key = chars.length - i; // keyed from the right, so a new leading digit doesn't restart the others
          if (!/\d/.test(ch)) return <span key={key} className="thk-sep">{ch}</span>;
          return (
            <span key={key} className="thk-dg">
              <span className="thk-dg-col" style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
                {"0123456789".split("").map((d) => <span key={d}>{d}</span>)}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

/** A label with `{n}` swapped for a rolling count. */
function Label({ text, n }: { text: string; n?: number }) {
  const i = text.indexOf("{n}");
  if (i < 0 || n === undefined) return <>{fillN(text, n)}</>;
  return <>{text.slice(0, i)}<Roll n={n} />{text.slice(i + 3)}</>;
}

const CHIP_MAX = 5;
function Chips({ chips }: { chips: Chip[] }) {
  if (!chips.length) return null;
  const shown = chips.slice(0, CHIP_MAX), more = chips.length - shown.length;
  return (
    <span className="thk-chips">
      {shown.map((c, i) => <span key={`${c.label}-${i}`} className={`thk-chip${c.kind ? ` k-${c.kind}` : ""}`}>{c.label}</span>)}
      {more > 0 && <span className="thk-chip thk-more">{more} more</span>}
    </span>
  );
}

const secs = (ms: number, done: boolean) => {
  const s = Math.max(0, ms) / 1000;
  return done ? (s < 10 ? `${Math.max(0.1, Math.round(s * 10) / 10)}s` : `${Math.round(s)}s`) : `${Math.floor(s)}s`;
};

/** The trace itself. `idle` draws nothing. `doneLabel` lets a surface say "Read" or "Loaded" instead of "Worked". */
export function ThinkingTrace({ trace, verb = { doing: "Working", done: "Worked" }, className = "", compact = false, children }: {
  trace: TraceState;
  verb?: { doing: string; done: string };
  className?: string;
  /** One line only, for places where the trace sits above live controls: the running step shows in the head line
   *  instead of the timeline opening under it, so nothing below moves. The chevron still opens the steps. */
  compact?: boolean;
  /** Extra rows at the foot of the timeline (a surface's own detail). */
  children?: ReactNode;
}) {
  const running = trace.status === "thinking" || trace.status === "working";
  const [t, setT] = useState(() => performance.now());
  useEffect(() => {
    if (!running) return;
    setT(performance.now());
    const id = window.setInterval(() => setT(performance.now()), 200);
    return () => window.clearInterval(id);
  }, [running]);
  // Open while it runs, folded once it's done; the chevron overrides either
  const [manual, setManual] = useState<boolean | null>(null);
  useEffect(() => { setManual(null); }, [trace.status === "done"]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = manual ?? (running && !compact);

  const thinkWords = useMemo(() => wordCount(trace.think), [trace.think]);
  // The plan streams inside the thinking line's minimum time, so showing it never holds the work up
  const k = useReveal(thinkWords, trace.status !== "idle", Math.max(4, Math.min(14, Math.floor((MIN_STEP_MS - 40) / Math.max(1, thinkWords)))));
  if (trace.status === "idle") return null;

  const elapsed = (trace.ended ?? t) - trace.started;
  const word = trace.status === "thinking" ? "Thinking" : trace.status === "error" ? "Stopped" : running ? verb.doing : verb.done;
  const thinking = trace.status === "thinking";
  const active = trace.steps[trace.steps.length - 1];
  const inline = compact && running && !open && active?.state === "active";
  return (
    <div className={`thk ${className}`} data-status={trace.status}>
      <button type="button" className="thk-head" aria-expanded={open} disabled={thinking && !compact}
        onClick={() => setManual(!open)}>
        <span className="thk-ic" aria-hidden="true">{thinking || (compact && running && !open) ? <AiDots size={14} run /> : <Icon name="chev" size={14} />}</span>
        <span className={`thk-word${running ? " shim" : ""}`}>{inline ? <Label text={active.doing} n={active.n} /> : word}</span>
        <span className="thk-sec">{secs(elapsed, !running)}</span>
        <span className="sr-only">{open ? ", hide steps" : ", show steps"}</span>
      </button>
      <div className={`thk-body${open ? " open" : ""}`}>
        <div className="thk-clip">
          {thinking ? (
            <p className="thk-think"><Words text={trace.think} k={k} muteBefore={Math.max(0, k - 10)} /></p>
          ) : (
            <ol className="thk-steps" aria-label="Steps">
              {trace.think && (
                <li className="thk-step done">
                  <i className="thk-mark" aria-hidden="true" />
                  <span className="thk-line"><span className="thk-label">Done thinking</span></span>
                  <p className="thk-plan">{trace.think}</p>
                </li>
              )}
              {trace.steps.map((s, i) => (
                <li key={i} className={`thk-step ${s.state}`} aria-current={s.state === "active" ? "step" : undefined}>
                  {s.state === "active" ? <span className="thk-mark run" aria-hidden="true"><AiDots size={12} run /></span> : <i className="thk-mark" aria-hidden="true" />}
                  <span className="thk-line">
                    <span className={`thk-label${s.state === "active" ? " shim" : ""}`}><Label text={s.state === "active" ? s.doing : s.done} n={s.n} /></span>
                    <Chips chips={s.chips} />
                  </span>
                </li>
              ))}
              {children}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
