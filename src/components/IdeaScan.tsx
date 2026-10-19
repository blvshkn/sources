import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui";

/** Shows the trade finder working through its steps after something changed (a new note, a new partner).
 *  The steps are what the finder actually weighs; the pacing is just enough to read them. */
export function IdeaScan({ steps, onDone }: { steps: string[]; onDone: () => void }) {
  const [at, setAt] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const each = reduce ? 120 : 420;
    const t = setInterval(() => setAt((n) => n + 1), each);
    const end = setTimeout(() => done.current(), each * (steps.length + 1));
    return () => { clearInterval(t); clearTimeout(end); };
  }, [steps.length]);
  return (
    <section className="card scan" aria-live="polite" aria-busy="true" aria-label="Finding trade ideas">
      <div className="scan-head"><span className="scan-orb" aria-hidden="true"><Icon name="spark" size={16} /></span><b>Finding trade ideas</b></div>
      <ol className="scan-steps">
        {steps.map((s, i) => (
          <li key={s} className={i < at ? "done" : i === at ? "now" : ""}>
            <span className="scan-mark" aria-hidden="true">{i < at ? <Icon name="check" size={12} /> : null}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
