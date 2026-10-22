import { useEffect, useRef, useState } from "react";
import { mo } from "../motion";

const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*";
const reduce = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A line that resolves out of scrambled characters, left to right, when it changes to a new value (a new verdict).
 * The first value shows as it is, so nothing scrambles on mount. Screen readers get only the final text, in a polite
 * live region; the scrambled copy is aria-hidden. The part not reached yet holds its space (invisible), so the line
 * never grows or rewraps while it resolves. `hold` (still loading) waits without spending the change.
 */
export function Decrypt({ text, hold = false }: { text: string; hold?: boolean }) {
  const shown = useRef(text);
  const [frame, setFrame] = useState<{ head: string; tail: string; rest: string } | null>(null);
  useEffect(() => {
    if (hold || text === shown.current) return;
    shown.current = text;
    if (reduce() || document.hidden) { setFrame(null); return; }
    // 22ms a character at the preview's pace, with a 6-character scrambled run ahead of the resolved part
    const per = mo(22 / 1.75), t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const n = Math.floor((now - t0) / per);
      if (n >= text.length) { setFrame(null); return; }
      const tail = text.slice(n, n + 6).replace(/\S/g, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);
      setFrame({ head: text.slice(0, n), tail, rest: text.slice(n + 6) });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); setFrame(null); };
  }, [text, hold]);
  return (
    <>
      <span className="sr-only" aria-live="polite">{text}</span>
      <span className="dc-vis" aria-hidden="true">{frame ? <>{frame.head}<span className="dc-scr">{frame.tail}</span><span className="dc-rest">{frame.rest}</span></> : text}</span>
    </>
  );
}
