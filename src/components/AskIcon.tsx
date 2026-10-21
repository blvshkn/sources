// The Ask icon, and the mark for anything Sources writes: Lucide's messages-square (ISC), two chat bubbles, the back one
// tucked behind the front one, no typing dots and no cut-outs, every outline closed. 24 grid, a line set by drawn size (iconStroke.ts), round
// ends and joins. Still at rest. Hovering or focusing the control that holds it plays one short beat (icon-lucide.css):
// the pair pops from the front bubble's tail, so the back bubble swings out down and right while the front one swells.
// Both move as one shape, so the joins stay closed mid-beat. Reduced motion keeps it still.
// currentColor throughout.

/** Front bubble, top left, tail at bottom left (Lucide messages-square, first path). */
const FRONT = "M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z";
/** Back bubble, bottom right, tail at bottom right. Lucide stops its outline 4 units short of the front bubble at both
 *  ends, which leaves a gap; here both ends run on until they meet the front bubble's outline (top edge out from its
 *  right side at y 9, left side up to its bottom at y 12). The round caps sit on the front line's centre, so the joins
 *  close at every drawn size and line weight. */
const BACK = "M16 9h4a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-5";
/** Optical centering, in 24-grid units (icons.tsx measures the same way: mass within about 0.25, ink box within 0.5). */
const ASK_OFFSET = [0, 0.3];

/** Length of the hover beat, longest delay included (icon-lucide.css uses the same numbers). */
const PLAY_MS = 380;

import { useIconStroke } from "./iconStroke";

export function AskIcon({ size = 20, active = false, label }: { size?: number; active?: boolean; label?: string }) {
  const stroke = useIconStroke(size);
  return (
    <svg ref={stroke.ref} style={stroke.style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke.strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={`askic${active ? " is-on" : ""}`}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <g transform={`translate(${ASK_OFFSET[0]} ${ASK_OFFSET[1]})`}>
      {/* The hover beat moves this pair as one, so the back bubble's ends never leave the front's outline */}
      <g className="askic-pair">
      <path className="askic-back" d={BACK} />
      <path className="askic-front" d={FRONT} />
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
