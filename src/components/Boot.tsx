/** Loading screen: the stacked logo (mark, wordmark, tagline), centered. The mark sits in graphite and fills with green along
 *  both lanes, then hands back to graphite, until the league is ready. */
import { MARK, WORD } from "./Logo";

export function Boot({ step, leaving = false }: { step: string; leaving?: boolean }) {
  const lanes = (cls: string) => MARK.map((d, i) => <path key={i} className={cls} d={d} pathLength={1} />);
  return (
    <div className={`boot3${leaving ? " leaving" : ""}`} role="status" aria-live="polite">
      <span className="sr-only">{step}…</span>
      <div className="boot3-core" aria-hidden="true">
        <span className="boot3-glow" />
        <svg className="boot3-mark" viewBox="-50 -50 100 100" width="96" height="96">
          <g fill="none" strokeWidth="5.26" strokeLinejoin="round" strokeLinecap="butt">
            {lanes("boot3-base")}
            {lanes("boot3-fill")}
          </g>
        </svg>
        <svg className="boot3-wordmark" viewBox="153 -90.26 478.53 108.31" height="34" role="img" aria-label="Sources">
          <path className="boot3-word" d={WORD} transform="translate(153.81 0) scale(0.06983)" />
        </svg>
        <span className="boot3-tag">Your fantasy insider</span>
      </div>
    </div>
  );
}
