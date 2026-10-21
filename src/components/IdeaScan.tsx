import { useEffect, useRef } from "react";
import { newScanDiag, type ScanDiag, type Trade } from "../engine";
import type { Steps } from "../steps";
import { useTrace } from "../think";
import { ThinkingTrace } from "./ThinkingTrace";

/** The trade finder working with one manager, as its real steps (reads.ts ideaSteps): notes read, needs checked,
 *  swaps scored. Stays on the page folded once it's done, so the steps can be opened again. When it finds nothing,
 *  the steps stay open and the head says how many trades it searched, since the working is the answer. The scan
 *  fills `diag` as it scores (engine.ts ScanDiag), and onDone hands it on for the "why no trades" read. */
export function IdeaScan({ run, onDone, paused = false }: { run: (diag: ScanDiag) => Steps<Trade[]>; onDone: (found: Trade[], diag: ScanDiag) => void; paused?: boolean }) {
  const { trace, start } = useTrace<Trade[]>();
  const done = useRef(onDone);
  done.current = onDone;
  const diag = useRef<ScanDiag>(newScanDiag());
  useEffect(() => {
    if (paused) return;
    const d = (diag.current = newScanDiag());
    start(() => run(d)).then((r) => { if (r) done.current(r, d); });
  }, [paused]); // eslint-disable-line react-hooks/exhaustive-deps
  // The scan has finished filling diag by the time the trace says it's done
  const empty = trace.status === "done" && diag.current.scored > 0 && diag.current.found === 0;
  return (
    <section className="card thk-card" aria-live="polite" aria-busy={trace.status !== "done"} aria-label="Finding trade ideas">
      <ThinkingTrace trace={trace} stayOpen={empty}
        verb={{ doing: "Finding trade ideas", done: empty ? `Searched ${diag.current.scored.toLocaleString("en-US")} trades in` : "Found trade ideas in" }} />
    </section>
  );
}
