/** Loading screen: the mark draws itself in, then a gradient light runs along both lanes until the league is ready. */
import { MARK, Wordmark } from "./Logo";

// Comet: ten stacked dashes, each a little longer and all sharing one head, so the tail fades smoothly toward the back.
const TAIL: [number, number][] = Array.from({ length: 10 }, (_, i) => [0.035 + i * 0.04, 0.17]);

export function Boot({ step, leaving = false }: { step: string; leaving?: boolean }) {
  return (
    <div className={`boot3${leaving ? " leaving" : ""}`} role="status" aria-live="polite">
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
            <g className="boot3-comets">
              {TAIL.map(([l, o], j) => (
                <g key={j} opacity={o}>
                  {/* Gap first, then the dash: every layer's head lands at the same point as the offset runs 0 → -1 */}
                  {MARK.map((d, i) => <path key={i} className="boot3-comet" d={d} pathLength={1} stroke="url(#boot3-sweep)" strokeDasharray={`0 ${1 - l} ${l} 0`} />)}
                </g>
              ))}
            </g>
          </g>
        </svg>
        <Wordmark height={28} className="boot3-word" />
      </div>
    </div>
  );
}
