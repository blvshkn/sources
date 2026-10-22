// Runs an engine step generator (steps.ts) in idle time, a slice at a time, after the page has painted. The work is
// the same as drain(); it just never holds the main thread for more than a slice. A new `job` cancels the old run.
import { useEffect, useState } from "react";
import type { Steps } from "./steps";

type Idle = (cb: (d: { timeRemaining: () => number }) => void, o?: { timeout: number }) => number;
const SLICE_MS = 12;

export function runIdle<R>(make: () => Steps<R>, done: (r: R) => void): () => void {
  const w = window as Window & { requestIdleCallback?: Idle; cancelIdleCallback?: (id: number) => void };
  let gen: Steps<R> | null = null, stop = false, id = 0;
  const step = (d?: { timeRemaining: () => number }) => {
    if (stop) return;
    gen ??= make();
    const until = performance.now() + Math.max(SLICE_MS, d ? Math.min(d.timeRemaining(), 40) : SLICE_MS);
    while (performance.now() < until) {
      const r = gen.next();
      if (r.done) { done(r.value); return; }
    }
    id = w.requestIdleCallback ? w.requestIdleCallback(step, { timeout: 500 }) : window.setTimeout(() => step(), 16);
  };
  id = w.requestIdleCallback ? w.requestIdleCallback(step, { timeout: 800 }) : window.setTimeout(() => step(), 60);
  return () => { stop = true; if (w.cancelIdleCallback) w.cancelIdleCallback(id); window.clearTimeout(id); };
}

/** The result of `make()` for the current `job`, or null while it runs. `job` is any value that changes when the
 *  inputs do (a memoized object works). The last result stays up while a new run works. */
export function useIdleSteps<R>(job: unknown, make: () => Steps<R>): { result: R | null; running: boolean } {
  const [state, setState] = useState<{ job: unknown; result: R | null }>({ job: null, result: null });
  useEffect(() => runIdle(make, (result) => setState({ job, result })), [job]); // eslint-disable-line react-hooks/exhaustive-deps
  return { result: state.result, running: state.job !== job };
}
