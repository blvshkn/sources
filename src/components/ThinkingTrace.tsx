// The thinking trace: one line that says what Source is doing and for how long, over a timeline of the real steps
// (think.ts). While it thinks, the plan streams in under the line. While it works, the timeline is open and the
// running step carries the working loader (Braille Flipwave). When it's done it folds to "Worked 1.4s" with a chevron that opens the
// steps again. The head line is always there. When the steps fold or open, the trace changes height in one step and
// whatever sits under it (Ask's answer card, the lineup result) slides from where it was by transform, so nothing jumps.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { WorkingLoader } from "./WorkingLoader";
import { Icon } from "./icons";
import { PlatformLogo } from "./PlatformLogo";
import { MIN_STEP_MS, fillN, type Chip, type TraceState } from "../think";
import { EASE_OUT, mo } from "../motion";

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
 * Text that streams in word by word: each new word fades in. Words not shown yet still take their space (in a trace
 * or an answer card they draw as skeleton bars, trace-flow.css), so the block is its full size and final shape from
 * the start and nothing below it moves. `base` is this text's first word
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
      {shown.map((c, i) => (
        <span key={`${c.label}-${i}`} className={`thk-chip${c.kind ? ` k-${c.kind}` : ""}${c.logo ? " has-logo" : ""}`}>
          {c.label}{c.logo && <PlatformLogo platform={c.logo} size={16} />}
        </span>
      ))}
      {more > 0 && <span className="thk-chip thk-more">{more} more</span>}
    </span>
  );
}

const secs = (ms: number, done: boolean) => {
  const s = Math.max(0, ms) / 1000;
  return done ? (s < 10 ? `${Math.max(0.1, Math.round(s * 10) / 10)}s` : `${Math.round(s)}s`) : `${Math.floor(s)}s`;
};

const SLIDE: KeyframeAnimationOptions = { duration: mo(300), easing: EASE_OUT, id: "thk-slide" };
const scrolls = (e: Element) => e === document.body || /(auto|scroll)/.test(getComputedStyle(e).overflowY);

/**
 * FLIP for whatever follows a trace. Every commit, each element after the trace (its later siblings, then its
 * ancestors' later siblings up to the scroll container) is measured against the trace's own top. When one has moved
 * (a step was added, the steps folded, the answer card came in under them) it starts where it was and slides to its
 * new place by transform alone. An element that has just appeared right after the trace starts where it would have
 * been under the trace's old height. Reduced motion: everything just lands.
 */
function useSlideFollowers(root: RefObject<HTMLDivElement | null>, open: boolean) {
  const seen = useRef(new WeakMap<Element, number>());
  const was = useRef<{ open: boolean; h: number } | null>(null);
  const slide = useRef(0);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) { was.current = null; return; }
    const h = el.offsetHeight, prev = was.current;
    was.current = { open, h };
    const base = el.getBoundingClientRect().top;
    const still = reduced();
    const grew = prev && prev.open !== open ? prev.h - h : 0;
    const runs: Animation[] = [];
    let node: Element = el, siblingsSlid = false;
    for (let lvl = 0; lvl < 4 && node.parentElement; lvl++) {
      for (let n = node.nextElementSibling; n; n = n.nextElementSibling) {
        const st = getComputedStyle(n);
        if (st.position === "fixed" || st.position === "absolute" || st.position === "sticky" || st.display === "none") continue;
        const now = (n as HTMLElement).getAnimations?.().find((a) => a.id === "thk-slide");
        const shift = st.transform !== "none" ? new DOMMatrixReadOnly(st.transform).m42 : 0;
        const at = n.getBoundingClientRect().top - shift - base;
        const before = seen.current.get(n);
        seen.current.set(n, at);
        // Only a real move starts a slide; one already running carries on from where it is
        const moved = before !== undefined ? before - at : lvl === 0 ? grew : 0;
        if (still || Math.abs(moved) < 2) continue;
        const from = moved + (now ? shift : 0);
        now?.cancel();
        const a = (n as HTMLElement).animate?.([{ transform: `translateY(${from}px)` }, { transform: "translateY(0)" }], SLIDE);
        if (a) { runs.push(a); if (lvl === 0) siblingsSlid = true; }
      }
      node = node.parentElement;
      if (scrolls(node)) break;
    }
    // While the trace's own siblings slide, its parent clips them: a box pushed down by a transform still counts
    // toward the scroll height, and Ask's thread would follow that phantom height and jump
    const parent = el.parentElement;
    if (!siblingsSlid || !parent) return;
    if (parent.dataset.thkKeep === undefined) parent.dataset.thkKeep = parent.style.overflow;
    parent.style.overflow = typeof CSS !== "undefined" && CSS.supports?.("overflow", "clip") ? "clip" : "hidden";
    const token = ++slide.current;
    Promise.all(runs.map((a) => a.finished.catch(() => undefined))).then(() => {
      if (token !== slide.current || parent.dataset.thkKeep === undefined) return;
      parent.style.overflow = parent.dataset.thkKeep;
      delete parent.dataset.thkKeep;
    });
  });
}

/** The trace itself. `idle` draws nothing. `doneLabel` lets a surface say "Read" or "Loaded" instead of "Worked". */
export function ThinkingTrace({ trace, verb = { doing: "Working", done: "Worked" }, className = "", compact = false, stayOpen = false, children }: {
  trace: TraceState;
  verb?: { doing: string; done: string };
  className?: string;
  /** One line only, for places where the trace sits above live controls: the running step shows in the head line
   *  instead of the timeline opening under it, so nothing below moves. The chevron still opens the steps. */
  compact?: boolean;
  /** Keep the steps open once it's done instead of folding them, for a result that needs its working shown (the
   *  trade finder when it finds nothing). The chevron still folds them. Off everywhere else. */
  stayOpen?: boolean;
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
  // Open while it runs, folded once it's done (unless stayOpen); the chevron overrides either
  const [manual, setManual] = useState<boolean | null>(null);
  useEffect(() => { setManual(null); }, [trace.status === "done"]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = manual ?? ((running && !compact) || (stayOpen && trace.status === "done"));

  const thinkWords = useMemo(() => wordCount(trace.think), [trace.think]);
  // The plan streams inside the thinking line's minimum time, so showing it never holds the work up
  const k = useReveal(thinkWords, trace.status !== "idle", Math.max(4, Math.min(14, Math.floor((MIN_STEP_MS - 40) / Math.max(1, thinkWords)))));

  // Fold, unfold and new steps never animate height: the trace snaps to its new size and whatever follows it slides
  // from where it was by transform (useSlideFollowers)
  const root = useRef<HTMLDivElement>(null);
  useSlideFollowers(root, open);
  if (trace.status === "idle") return null;

  const elapsed = (trace.ended ?? t) - trace.started;
  const word = trace.status === "thinking" ? "Thinking" : trace.status === "error" ? "Stopped" : running ? verb.doing : verb.done;
  const thinking = trace.status === "thinking";
  const active = trace.steps[trace.steps.length - 1];
  const inline = compact && running && !open && active?.state === "active";
  return (
    <div ref={root} className={`thk ${className}`} data-status={trace.status}>
      <button /* dismiss-exempt: inline accordion, not an overlay */ type="button" className="thk-head" aria-expanded={open} disabled={thinking && !compact}
        onClick={() => setManual(!open)}>
        <span className="thk-ic" aria-hidden="true">{thinking || (compact && running && !open) ? <WorkingLoader size={16} /> : <Icon name="chev" size={14} />}</span>
        <span className={`thk-word${running ? " shim" : ""}`}>{inline ? <Label text={active.doing} n={active.n} /> : word}</span>
        <span className="thk-sec">{secs(elapsed, !running)}</span>
        <span className="sr-only">{open ? ", hide steps" : ", show steps"}</span>
      </button>
      <div className={`thk-body${open ? " open" : ""}`}>
        <div className="thk-clip">
          {/* Thinking and working share one list: the plan is its first row from the start, streaming in over skeleton
              bars, so when the steps start under it nothing above them reflows */}
          <ol className="thk-steps" aria-label="Steps">
              {trace.think && (
                <li className={`thk-step ${thinking ? "plan" : "done"}`}>
                  <i className="thk-mark" aria-hidden="true" />
                  <span className="thk-line"><span className="thk-label">{thinking ? "Planning" : "Done thinking"}</span></span>
                  <p className="thk-plan"><Words text={trace.think} k={k} /></p>
                </li>
              )}
              {trace.steps.map((s, i) => (
                <li key={i} className={`thk-step ${s.state}`} aria-current={s.state === "active" ? "step" : undefined}>
                  {s.state === "active" ? <span className="thk-mark run" aria-hidden="true"><WorkingLoader size={16} /></span> : <i className="thk-mark" aria-hidden="true" />}
                  <span className="thk-line">
                    <span className={`thk-label${s.state === "active" ? " shim" : ""}`}><Label text={s.state === "active" ? s.doing : s.done} n={s.n} /></span>
                    <Chips chips={s.chips} />
                  </span>
                </li>
              ))}
              {children}
          </ol>
        </div>
      </div>
    </div>
  );
}
