/** Loading screen: a floodlit field, the mark inside two counter-rotating rings, and the load steps ticking off. */
const STEPS = ["Loading your league", "Loading projections and trade values", "Loading trades, waivers and past weeks", "Loading player details"];
const SHORT: Record<string, string> = {
  "Loading your league": "League and rosters",
  "Loading projections and trade values": "Projections and trade values",
  "Loading trades, waivers and past weeks": "Trades, waivers, past weeks",
  "Loading player details": "Player details",
};

export function Boot({ step }: { step: string }) {
  const at = Math.max(0, STEPS.indexOf(step));
  const pct = Math.round(((at + 0.5) / STEPS.length) * 100);
  return (
    <div className="boot2" role="status" aria-live="polite" aria-label={`${step}…`}>
      <div className="boot2-field" aria-hidden="true" />
      <div className="boot2-core">
        <div className="boot2-mark" aria-hidden="true">
          <span className="boot2-ring a" /><span className="boot2-ring b" /><span className="boot2-pulse" />
          <span className="brand-mark big">“</span>
        </div>
        <div className="boot2-word" aria-hidden="true">Sources</div>
        <ol className="boot2-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < at ? "done" : i === at ? "now" : ""}>
              <i aria-hidden="true" />{SHORT[s]}
            </li>
          ))}
        </ol>
        <div className="boot2-meter" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
          <b>{String(pct).padStart(2, "0")}%</b>
        </div>
      </div>
    </div>
  );
}
