/** Loading screen: the full logo with its tagline. The mark sits in graphite and fills with green along
 *  both lanes, then hands back to graphite, until the league is ready. */
import { MARK, WORD } from "./Logo";

export function Boot({ step, leaving = false }: { step: string; leaving?: boolean }) {
  const lanes = (cls: string) => MARK.map((d, i) => <path key={i} className={cls} d={d} pathLength={1} />);
  return (
    <div className={`boot3${leaving ? " leaving" : ""}`} role="status" aria-live="polite">
      <span className="sr-only">{step}…</span>
      <div className="boot3-core" aria-hidden="true">
        <span className="boot3-glow" />
        <svg className="boot3-logo" viewBox="0 -90.26 631.53 108.31" height="56">
          <g transform="translate(49.83 -36.10) scale(1.5191)" fill="none" strokeWidth="5.26" strokeLinejoin="round" strokeLinecap="butt">
            {lanes("boot3-base")}
            {lanes("boot3-fill")}
          </g>
          <path className="boot3-word" d={WORD} transform="translate(153.81 0) scale(0.06983)" />
        </svg>
        <span className="boot3-tag">Your fantasy insider</span>
      </div>
    </div>
  );
}
