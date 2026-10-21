/** Loading screen, from Zach's Figma ("Loading screen", phone and desktop). The large Braille Flipwave loader sits
 *  above the trace of what the load has really fetched so far (sleeper.ts loadLeague), and the logo stands at the
 *  foot of the screen on a football field: mark, wordmark, tagline. The logo doesn't animate. */
import { useEffect, useId, useState } from "react";
import { MARK } from "./Logo";
import { BrandLogo } from "./BrandLogo";
import { ThinkingTrace } from "./ThinkingTrace";
import { WorkingLoader } from "./WorkingLoader";
import type { TraceState } from "../think";

/** The ground, in Figma's layer order: a dark vertical gradient (CSS), a football field in perspective rising from
 *  the foot of the screen, the graphite mark tiled at 5% and fading out down the screen, and a faint lime glow
 *  behind the logo (CSS). The field and the tiles are inline SVG; their fades are CSS mask gradients. */

/** The tiled mark. Figma's pattern: the 96px mark component at 1.6x on the phone, each tile overlapping the next by
 *  45% across and 40% down. One tile step holds the four tiles that reach into it. CSS scales the layer up for wider
 *  screens (2.8x on desktop), so the numbers here are the phone's. */
const TILE = 96 * 1.6, STEP_X = TILE * 0.55, STEP_Y = TILE * 0.6;
function Tiles() {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="boot3-tiles" aria-hidden="true" focusable="false">
      <defs>
        {/* The mark as Figma draws it: its -50..50 artwork in a 96px square */}
        <g id={`${id}m`} fill="none" stroke="#3A3F3C" strokeWidth="5.26" strokeLinejoin="round">
          {MARK.map((d) => <path key={d.slice(0, 12)} d={d} />)}
        </g>
        <pattern id={`${id}p`} width={STEP_X} height={STEP_Y} patternUnits="userSpaceOnUse">
          {[[0, 0], [-STEP_X, 0], [0, -STEP_Y], [-STEP_X, -STEP_Y]].map(([x, y]) => (
            <use key={`${x},${y}`} href={`#${id}m`} transform={`translate(${x} ${y}) scale(${1.6 * 0.96}) translate(50 50)`} />
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}p)`} />
    </svg>
  );
}

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
      <Tiles />
      <span className="boot3-glow" aria-hidden="true" />
      <div className="boot3-col">
        <div className="boot3-top" />
        <div className="boot3-work">
          <span className="boot3-loader" aria-hidden="true"><WorkingLoader size={30} /></span>
          {/* Reserves the finished trace's height, so the logo never moves and nothing jumps as steps arrive */}
          <div className="boot3-trace">
            {trace && trace.status !== "idle" && <ThinkingTrace trace={trace} verb={{ doing: "Loading", done: "Loaded" }} stayOpen />}
          </div>
        </div>
        <div className="boot3-gap" />
        <BrandLogo className="boot3-logo" mark={88} word={40} tagline />
      </div>
    </div>
  );
}
