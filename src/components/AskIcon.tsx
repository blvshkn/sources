// The Ask icon, and the mark for anything Source writes: Lucide's messages-square (ISC), two chat bubbles, the back one
// tucked behind the front one, no typing dots and no cut-outs, every outline closed. 24 grid, a line set by drawn size (iconStroke.ts), round
// ends and joins. Still at rest. Hovering or focusing the control that holds it plays one short beat (icon-lucide.css):
// the pair pops from the front bubble's tail, so the back bubble swings out down and right while the front one swells.
// Both move as one shape, so the joins stay closed mid-beat. Reduced motion keeps it still.
// currentColor throughout.


/** Length of the hover beat, longest delay included (icon-lucide.css uses the same numbers). */
const PLAY_MS = 520;

import { PX } from "./pixelIcons";

export function AskIcon({ size = 20, active = false, label }: { size?: number; active?: boolean; label?: string }) {
  // Pixel bubbles (Zach, Oct 22): front bubble m1, back bubble m2, so the beat can bring them in left to right
  const [box, html] = PX.ask;
  return (
    <svg width={size} height={size} viewBox={box} fill="currentColor" className={`askic px-ic${active ? " is-on" : ""}`}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} dangerouslySetInnerHTML={{ __html: html }} />
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
    // Tabs (Zach, Oct 22): an icon in a tab row stays still; selecting it is the feedback
    if (!control || reduced?.matches || control.closest(".seg, [role='tablist']")) return;
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
