// The thinking trace's engine. Real work reports its own steps as it runs: the engine's step generators (engine.ts
// askSteps, scanTrades, ...) yield what they're doing and how far they've got, and async loaders (Sleeper) call a
// tracer directly between fetches. Nothing here invents a step, a count or a wait, with one exception: a step that
// finishes faster than MIN_STEP_MS stays on screen until MIN_STEP_MS so it can be read.
import { useCallback, useEffect, useRef, useState } from "react";

/** The one pacing rule: the shortest time any step (and the thinking line) stays on screen. Work that takes longer
 *  than this is never slowed down. */
export const MIN_STEP_MS = 280;
/** How long CPU work runs between paints. Not a wait: the work runs this long, then the frame paints. */
const WORK_MS = 24;

export { drain } from "./steps";
export type { Chip, TraceEv, Steps } from "./steps";
import type { Chip, Steps } from "./steps";

export interface TraceStep { doing: string; done: string; n?: number; chips: Chip[]; state: "active" | "done"; at: number }
export interface TraceState {
  status: "idle" | "thinking" | "working" | "done" | "error";
  think: string;
  steps: TraceStep[];
  started: number;
  ended?: number;
}

export const IDLE: TraceState = { status: "idle", think: "", steps: [], started: 0 };

const now = () => performance.now();
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
/** Hand the main thread back long enough for React to commit and the browser to paint. rAF is raced with a timer
 *  so a background tab never stalls the work. */
const breathe = () => new Promise<void>((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; window.setTimeout(r, 0); } };
  requestAnimationFrame(go);
  window.setTimeout(go, 34);
});

export class Cancelled extends Error {}

/** Push-style tracer for async work. Each call paints, and `step` waits out the pacing of the step before it. */
export function tracer(emit: (s: TraceState) => void, alive: () => boolean = () => true) {
  const s: TraceState = { status: "thinking", think: "", steps: [], started: now() };
  let lastPaint = now();
  let thinkAt = 0;
  const push = () => { if (!alive()) throw new Cancelled(); emit({ ...s, steps: s.steps.map((x) => ({ ...x, chips: [...x.chips] })) }); };
  /** Paint, then let the work run for WORK_MS before the next paint. */
  const yieldToPaint = async () => { await breathe(); lastPaint = now(); };
  const cur = () => s.steps[s.steps.length - 1];
  /** Close whatever is on screen once it has had its minimum time. */
  const settle = async () => {
    const c = cur();
    const since = c && c.state === "active" ? c.at : !c && s.think ? thinkAt : 0;
    if (since) { const left = MIN_STEP_MS - (now() - since); if (left > 0) await sleep(left); }
    if (!alive()) throw new Cancelled();
    if (c && c.state === "active") c.state = "done";
  };
  push();
  return {
    state: s,
    async think(text: string) { s.think = text; thinkAt = now(); push(); await yieldToPaint(); },
    async step(doing: string, done: string, opts: { n?: number; chips?: Chip[] } = {}) {
      await settle();
      s.status = "working";
      s.steps.push({ doing, done, n: opts.n, chips: opts.chips ? [...opts.chips] : [], state: "active", at: now() });
      push();
      await yieldToPaint();
    },
    /** Progress on the step that's running. Paints at most about once a frame; between paints the work keeps going. */
    async n(n: number, chip?: Chip, done?: string) {
      const c = cur();
      if (!c) return;
      c.n = n;
      if (chip) c.chips.push(chip);
      if (done) c.done = done;
      if (now() - lastPaint > WORK_MS) { push(); await yieldToPaint(); }
    },
    async finish() { await settle(); s.status = "done"; s.ended = now(); push(); },
    fail() { const c = cur(); if (c) c.state = "done"; s.status = "error"; s.ended = now(); if (alive()) emit({ ...s, steps: [...s.steps] }); },
  };
}
export type Tracer = ReturnType<typeof tracer>;

/** Drives a step generator through a tracer, painting between chunks. Returns what the generator returns. */
export async function runSteps<R>(g: Steps<R>, tr: Tracer): Promise<R> {
  for (;;) {
    const r = g.next();
    if (r.done) { await tr.finish(); return r.value; }
    const e = r.value;
    if (e.t === "think") await tr.think(e.text);
    else if (e.t === "step") await tr.step(e.doing, e.done, { n: e.n, chips: e.chips });
    else await tr.n(e.n, e.chip, e.done);
  }
}

/**
 * One trace and its result for a component. `start` runs either a step generator or an async job that takes the
 * tracer; starting again (or unmounting) cancels the run in flight.
 */
export function useTrace<R>(): { trace: TraceState; result: R | undefined; start: (job: (() => Steps<R>) | ((tr: Tracer) => Promise<R>)) => Promise<R | undefined> } {
  const [trace, setTrace] = useState<TraceState>(IDLE);
  const [result, setResult] = useState<R | undefined>(undefined);
  const gen = useRef(0);
  useEffect(() => () => { gen.current++; }, []);
  const start = useCallback(async (job: (() => Steps<R>) | ((tr: Tracer) => Promise<R>)) => {
    const id = ++gen.current;
    const alive = () => gen.current === id;
    setResult(undefined);
    const tr = tracer((s) => { if (alive()) setTrace(s); }, alive);
    try {
      const out = job.length === 0 ? await runSteps((job as () => Steps<R>)(), tr) : await (job as (tr: Tracer) => Promise<R>)(tr);
      if (alive()) setResult(out);
      return out;
    } catch (e) {
      if (e instanceof Cancelled) return undefined;
      tr.fail();
      throw e;
    }
  }, []);
  return { trace, result, start };
}

/** Labels carry `{n}`; this fills it in for plain text (screen readers, tests). */
export const fillN = (label: string, n?: number) => label.replace("{n}", n === undefined ? "" : n.toLocaleString("en-US")).replace(/\s{2,}/g, " ").trim();
