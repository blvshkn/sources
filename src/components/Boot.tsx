/** Loading screen: the mark draws itself in, then a gradient light runs along both lanes until the league is ready. */
import { MARK, Wordmark } from "./Logo";

// Comet layers along each lane: [dash length, opacity]. Heads stay aligned so the shorter, brighter dashes read as the tip.
const TAIL: [number, number][] = [[0.44, 0.1], [0.32, 0.2], [0.22, 0.36], [0.13, 0.62], [0.06, 1]];

export function Boot({ step }: { step: string }) {
  return (
    <div className="boot3" role="status" aria-live="polite">
      <span className="sr-only">{step}…</span>
      <div className="boot3-core" aria-hidden="true">
        <span className="boot3-glow" />
        <svg className="boot3-mark" viewBox="-50 -50 100 100" width="112" height="112">
          <defs>
            <linearGradient id="boot3-sweep" gradientUnits="userSpaceOnUse" x1="-40" y1="0" x2="40" y2="0">
              <stop offset="0" stopColor="#D8F24A" />
              <stop offset="0.5" stopColor="#F2F4F1" />
              <stop offset="1" stopColor="#D8F24A" />
              <animateTransform attributeName="gradientTransform" type="rotate" from="0" to="360" dur="3.2s" repeatCount="indefinite" />
            </linearGradient>
          </defs>
          <g fill="none" strokeWidth="5.26" strokeLinejoin="round" strokeLinecap="butt">
            {MARK.map((d, i) => <path key={"b" + i} className="boot3-base" d={d} pathLength={1} style={{ animationDelay: `${i * 40}ms` }} />)}
            {MARK.map((d, i) => TAIL.map(([l, o], j) => (
              <path key={`c${i}-${j}`} className="boot3-comet" d={d} pathLength={1} stroke="url(#boot3-sweep)"
                style={{ "--l": l, opacity: o, strokeDasharray: `${l} ${1 - l}` } as {}} />
            )))}
          </g>
        </svg>
        <Wordmark height={28} className="boot3-word" />
      </div>
    </div>
  );
}
