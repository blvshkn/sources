// The Ask icon, and the mark for anything Sources writes: two chat bubbles, the back one behind the front one, with
// three typing dots in the front bubble. Drawn as in Figma's nav icon set: 24 grid, a 1.3 line, round ends and
// joins, dots as tiny filled circles. Still at rest. Hovering or focusing the control that holds it
// plays one short beat (ai-loader.css): the back bubble nudges away, the front one pops, the dots pulse in turn.
// Reduced motion keeps it still. currentColor throughout.

/** Back bubble: an open line that stops short of the front bubble, so the two read as stacked. Tail at bottom left.
 *  Paths are Zach's, from Figma's "Nav / Icon" Ask (24 grid, 1.3 line, round ends). */
const BACK = "M15 9V7.5A3.5 3.5 0 0 0 11.5 4h-5A3.5 3.5 0 0 0 3 7.5v2A3.5 3.5 0 0 0 6.5 13v2.5L9 13";
/** Front bubble, tail at bottom right. */
const FRONT = "M13 9h5c.93 0 1.82.32 2.47.88.66.56 1.03 1.33 1.03 2.12v2.5c0 .8-.37 1.56-1.03 2.12-.65.56-2.68.88-3.47.88V20l-3-2.5h-1a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3z";
const DOTS = [13.25, 15.75, 18.25];

/** Length of the hover beat, longest delay included (ai-loader.css uses the same numbers). */
const PLAY_MS = 380;

export function AskIcon({ size = 20, active = false, label }: { size?: number; active?: boolean; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.3}
      strokeLinecap="round" strokeLinejoin="round" className={`askic${active ? " is-on" : ""}`}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path className="askic-back" d={BACK} />
      <g className="askic-front">
        <path d={FRONT} />
        {DOTS.map((x, i) => <circle key={x} className={`askic-dot d${i}`} cx={x} cy={13.25} r={0.75} fill="currentColor" stroke="none" />)}
      </g>
    </svg>
  );
}

// Hover (mouse) and keyboard focus on the control holding the icon play the beat once. It always runs to the end,
// so leaving mid-beat still lands at rest instead of snapping.
let installed = false;
function install() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const play = (control: Element | null) => {
    if (!control || reduced?.matches) return;
    control.querySelectorAll("svg.askic").forEach((svg) => {
      if (svg.hasAttribute("data-play")) return;
      svg.setAttribute("data-play", "");
      window.setTimeout(() => svg.removeAttribute("data-play"), PLAY_MS + 40);
    });
  };
  const SEL = "button, a, summary, label, [role='button'], [role='tab'], .ai-label-k, .ibx-ai, .ibx-ask";
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    const control = (e.target as Element | null)?.closest?.(SEL);
    if (!control || (e.relatedTarget instanceof Node && control.contains(e.relatedTarget))) return;
    play(control);
  }, { passive: true });
  document.addEventListener("focusin", (e) => {
    const t = e.target as Element | null;
    if (t?.matches?.(":focus-visible")) play(t.closest(SEL) ?? t);
  });
}
install();
