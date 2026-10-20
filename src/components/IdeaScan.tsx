import { useEffect, useRef } from "react";
import type { Trade } from "../engine";
import type { Steps } from "../steps";
import { useTrace } from "../think";
import { ThinkingTrace } from "./ThinkingTrace";

/** The trade finder working with one manager, as its real steps (reads.ts ideaSteps): notes read, needs checked,
 *  swaps scored. Stays on the page folded once it's done, so the steps can be opened again. */
export function IdeaScan({ run, onDone, paused = false }: { run: () => Steps<Trade[]>; onDone: (found: Trade[]) => void; paused?: boolean }) {
  const { trace, start } = useTrace<Trade[]>();
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => { if (!paused) start(run).then((r) => { if (r) done.current(r); }); }, [paused]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="card thk-card" aria-live="polite" aria-busy={trace.status !== "done"} aria-label="Finding trade ideas">
      <ThinkingTrace trace={trace} verb={{ doing: "Finding trade ideas", done: "Found trade ideas in" }} />
    </section>
  );
}
