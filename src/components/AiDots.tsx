// The AI mark: a braille cell, two dots wide and four tall. At rest some dots are lit and the rest sit faint, which is
// the mark wherever Sources writes or works something out. Running, a wave travels down the cell and each dot turns
// over as it passes, swapping lit for faint and back; that's the loader on a thinking step. Hovering or focusing the
// control that holds it plays the wave once and lands back on the resting pattern. Reduced motion keeps it still.
// Plain SVG circles in currentColor, animated with CSS (thinking.css).

const COLS = [8.5, 15.5];
const ROWS = [4, 9.33, 14.67, 20];
/** Resting pattern, column by column, top to bottom. 1 = lit. */
const LIT = [
  [1, 1, 0, 1],
  [0, 1, 1, 0],
];
/** One wave's length on a single dot (thinking.css uses the same number). */
const CYCLE_MS = 1300;
/** The wave reaches the last dot this much after the first. */
const SPREAD_MS = 420;

export function AiDots({ size = 16, run = false, label }: { size?: number; run?: boolean; label?: string }) {
  const dots = COLS.flatMap((x, c) => ROWS.map((y, r) => {
    // A diagonal wave: down the rows, with the right column a half step behind the left
    const delay = Math.round(((r + c * 0.5) / 3.5) * SPREAD_MS);
    return <circle key={`${c}${r}`} cx={x} cy={y} r={2.15} className={LIT[c][r] ? "aid-on" : "aid-off"} style={{ animationDelay: `${delay}ms` }} />;
  }));
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={`aid${run ? " aid-run" : ""}`}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {dots}
    </svg>
  );
}

// Hover and keyboard focus on the control holding a mark play one wave. One pass, so leaving mid-wave still lands
// on the resting pattern instead of snapping back.
let installed = false;
function install() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const play = (control: Element | null) => {
    if (!control || reduced?.matches) return;
    control.querySelectorAll("svg.aid:not(.aid-run)").forEach((svg) => {
      if (svg.hasAttribute("data-play")) return;
      svg.setAttribute("data-play", "");
      window.setTimeout(() => svg.removeAttribute("data-play"), CYCLE_MS + SPREAD_MS + 60);
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
