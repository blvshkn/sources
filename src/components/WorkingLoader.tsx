// The working loader: Braille Flipwave from "loader-buttons" (vendored in src/vendor/loader-buttons), the loader
// Zach picked, recolored to the app's ink and otherwise exactly as its author made it. It only shows while
// something is being worked out: the running step and the Thinking line of a trace, the Ask send button while an
// answer is built, and the league loading screen. Mounted while it's on screen, destroyed when it leaves.
// `run={false}` freezes it on the current frame. Reduced motion freezes it too (the package handles that).
// It is DOM and CSS 3D, not WebGL, so any number of them can run without using a GL context.
import { useEffect, useRef } from "react";
import { mountLoader, type LoaderInstance } from "../vendor/loader-buttons/loader.js";
import { PX_AI } from "./pixelIcons";

export function WorkingLoader({ size = 16, run = true, label, className = "" }: {
  size?: number;
  run?: boolean;
  /** Read out instead of hiding it, when the loader is the only sign of work in its control. */
  label?: string;
  className?: string;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const inst = useRef<LoaderInstance | null>(null);
  useEffect(() => {
    if (!host.current) return;
    let li: LoaderInstance | null = null;
    try { li = mountLoader(host.current, { design: "braille-flipwave", size, paused: !run }); } catch { /* no DOM: draw nothing */ }
    inst.current = li;
    return () => { li?.destroy(); inst.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (run) inst.current?.play(); else inst.current?.pause(); }, [run]);
  return (
    <span ref={host} className={`wkl ${className}`.trim()} style={{ width: size, height: size }}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
  );
}

/** The loader standing still: its 5 by 5 dots at rest, the first frame of Braille Flipwave. Marks AI work inline
 *  (AI tags, Sources tips) without moving, so a page full of them stays calm. Takes the text color around it. */
export function AiMark({ size = 14, className = "" }: { size?: number; className?: string }) {
  // Pixel circles (Zach, Oct 22): the same 5 by 5 grid, each dot a 4 by 4 pixel circle at half scale
  return <svg className={`ai-mark ${className}`.trim()} width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: PX_AI }} />;
}
