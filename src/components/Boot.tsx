/** Loading screen, from Zach's Figma ("Loading screen", phone and desktop). The Braille Flipwave loader sits
 *  above the trace of what the load has really fetched so far (sleeper.ts loadLeague), and the logo stands at the
 *  foot of the screen on a football field: mark, wordmark, tagline. The logo doesn't animate. */
import { useEffect, useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { ThinkingTrace } from "./ThinkingTrace";
import { WorkingLoader } from "./WorkingLoader";
import type { TraceState } from "../think";

/** The ground, in Figma's layer order: a dark vertical gradient (CSS), a football field in perspective rising from
 *  the foot of the screen, and a faint lime glow behind the logo (CSS). The field is inline SVG; its fade is a CSS
 *  mask gradient. */

/** The field, drawn for the screen it's on. Measured from both Figma frames, which agree once scaled: the field is
 *  the bottom 44% of the screen; at its top edge the yard lines are 2px wide and 160px apart, 80px either side of
 *  center, and they run toward a vanishing point 444.5px above that edge, so everything widens by (1 + y / 444.5)
 *  on the way down. Two rows of hash marks sit about a quarter and a third of the way down, 23.3px apart at the
 *  top edge. Yard lines are lime at 9%, hash marks ink at 7%. */
const VANISH = 444.5, LINE_GAP = 160, HASH_GAP = 23.33;
function useViewport() {
  const read = () => ({ w: window.innerWidth || 390, h: window.innerHeight || 844 });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vp;
}
function Field() {
  const { w, h: vh } = useViewport();
  const h = Math.round(vh * 0.44), c = w / 2;
  const sAt = (y: number) => 1 + y / VANISH;
  const sb = sAt(h);
  // A quad that starts `half` either side of offset `u` at y0 and widens along the rays to the vanishing point
  const quad = (u: number, half: number, y0: number, y1: number) => {
    const a = sAt(y0), b = sAt(y1), f = (n: number) => n.toFixed(2);
    return `M${f(c + (u - half) * a)} ${f(y0)}H${f(c + (u + half) * a)}L${f(c + (u + half) * b)} ${f(y1)}H${f(c + (u - half) * b)}Z`;
  };
  const lines: string[] = [];
  for (let u = LINE_GAP / 2; (u - 1) * sb < c + 4; u += LINE_GAP) lines.push(quad(u, 1, 0, h), quad(-u, 1, 0, h));
  const hashes: string[] = [];
  for (const [top, len] of [[0.243, 11.9 / 1.21], [0.364, 14 / 1.31]]) {
    const y0 = h * top, y1 = y0 + len * sAt(y0);
    for (let u = -3.7 - Math.ceil((c / sAt(y0)) / HASH_GAP) * HASH_GAP; u * sAt(y0) < c + HASH_GAP; u += HASH_GAP) hashes.push(quad(u, 0.5, y0, y1));
  }
  return (
    <svg className="boot3-field" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
      <path d={lines.join("")} fill="#D8F24A" fillOpacity="0.09" />
      <path d={hashes.join("")} fill="#F2F3EE" fillOpacity="0.07" />
    </svg>
  );
}

export function Boot({ step, leaving = false, trace }: { step: string; leaving?: boolean; trace?: TraceState }) {
  return (
    <div className={`boot3${leaving ? " leaving" : ""}`} role="status" aria-live="polite">
      <span className="sr-only">{step}…</span>
      <Field />
      <span className="boot3-glow" aria-hidden="true" />
      <div className="boot3-col">
        <div className="boot3-top" />
        <div className="boot3-work">
          <span className="boot3-loader" aria-hidden="true"><WorkingLoader size={30} /></span>
          {/* Reserves the finished trace's height, so the logo never moves and nothing jumps as steps arrive */}
          <div className="boot3-trace">
            {trace && trace.status !== "idle" && <ThinkingTrace haptics={false} trace={trace} verb={{ doing: "Loading", done: "Loaded" }} stayOpen />}
          </div>
        </div>
        <div className="boot3-gap" />
        <BrandLogo className="boot3-logo" mark={88} word={40} tagline />
      </div>
    </div>
  );
}
