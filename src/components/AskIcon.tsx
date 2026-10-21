// The Ask icon, and the mark for anything Sources writes: two chat bubbles, the back one behind the front one, with
// three typing dots in the front bubble. Drawn as in Figma's nav icon set: 24 grid, a line set by drawn size (iconStroke.ts), round ends and
// joins, dots as tiny filled circles. Still at rest. Hovering or focusing the control that holds it
// plays one short beat (ai-loader.css): the back bubble nudges away, the front one pops, the dots pulse in turn.
// Reduced motion keeps it still. currentColor throughout.

/** Back bubble, tail at bottom left. Both bubbles are left open at a break or two, as in Figma's nav icon set.
 *  Paths are Zach's, from Figma's "Nav / Icon" Ask (24 grid, 1.25 line, round ends). */
const BACK = "M3 7.5V9.5C3 10.0238 3.11743 10.5356 3.33772 11C3.50779 11.3586 3.73916 11.6889 4.02513 11.9749C4.6815 12.6313 5.57174 13 6.5 13V15.5L8 14M14.9438 6.87496C14.8887 6.57144 14.7938 6.27729 14.6623 6C14.4922 5.64145 14.2608 5.31109 13.9749 5.02513C13.3185 4.36875 12.4283 4 11.5 4H6.5C5.97616 4 5.46443 4.11743 5 4.33772";
/** Front bubble, tail at bottom right. */
const FRONT = "M21.5 14.5C21.5 15.2956 21.1313 16.0587 20.4749 16.6213C19.8185 17.1839 17.7956 17.5 17 17.5V20L14 17.5H13C12.2044 17.5 11.4413 17.1839 10.8787 16.6213C10.3161 16.0587 10 15.2956 10 14.5V12C10 11.2044 10.3161 10.4413 10.8787 9.87868C11.4413 9.31607 12.2044 9 13 9H18C18.9283 9 19.8185 9.31607 20.4749 9.87868C20.8475 10.1981 21.1274 10.5821 21.2998 11";
const DOTS = [13.25, 15.75, 18.25];
/** Optical centering: the bubbles' mass sits right of and above the grid center, so the glyph moves left and down. */
const ASK_OFFSET = [-0.4, 0.35];

/** Length of the hover beat, longest delay included (ai-loader.css uses the same numbers). */
const PLAY_MS = 380;

import { useIconStroke } from "./iconStroke";

export function AskIcon({ size = 20, active = false, label }: { size?: number; active?: boolean; label?: string }) {
  const stroke = useIconStroke(size);
  return (
    <svg ref={stroke.ref} style={stroke.style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke.strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={`askic${active ? " is-on" : ""}`}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <g transform={`translate(${ASK_OFFSET[0]} ${ASK_OFFSET[1]})`}>
      <path className="askic-back" d={BACK} />
      <g className="askic-front">
        <path d={FRONT} />
        {DOTS.map((x, i) => <circle key={x} className={`askic-dot d${i}`} cx={x} cy={13.25} r={0.75} fill="currentColor" stroke="none" />)}
      </g>
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
