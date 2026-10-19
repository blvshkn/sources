import { useEffect, useState } from "react";
import { LEAGUE, WEEK, YOU } from "../data";

/** One reading of your win chance: when, and the percent. */
type Pt = [number, number];

const keyOf = () => `sources.swing2.${LEAGUE.id}.${WEEK}.${YOU.id}`;
export const readSwing = (): Pt[] => read();
const read = (): Pt[] => {
  try { const v = JSON.parse(localStorage.getItem(keyOf()) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
};

/** Keeps a running log of this week's win chance, one point each time it moves, so the card can show the swing.
 *  Lives on this device; it fills in while the app is open. */
export function useSwing(chance: number | null): Pt[] {
  const [pts, setPts] = useState<Pt[]>(read);
  useEffect(() => {
    if (chance === null) return;
    const cur = read();
    const last = cur[cur.length - 1];
    if (last && last[1] === chance) { if (cur.length !== pts.length) setPts(cur); return; }
    const next = [...cur, [Date.now(), chance] as Pt].slice(-300);
    try { localStorage.setItem(keyOf(), JSON.stringify(next)); } catch { /* storage blocked: still show this session */ }
    setPts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chance]);
  return pts;
}

/** Sparkline of the win chance this week with a 50% line, plus how far it has moved. */
export function Swing({ pts, now, className = "" }: { pts: Pt[]; now: number; className?: string }) {
  if (pts.length < 2) return null;
  const from = pts[0][1], d = now - from;
  const W = 160, H = 40, n = pts.length - 1;
  // Zoom to the range the chance has moved through (at least 20 points tall) so small swings still read
  const vs = pts.map((p) => p[1]);
  let lo = Math.min(...vs, now), hi = Math.max(...vs, now);
  if (hi - lo < 20) { const mid = (hi + lo) / 2; lo = mid - 10; hi = mid + 10; }
  lo = Math.max(0, lo - 3); hi = Math.min(100, hi + 3);
  const y = (v: number) => (H - 2 - ((v - lo) / (hi - lo || 1)) * (H - 4)).toFixed(1);
  const even = lo <= 50 && hi >= 50;
  const line = pts.map(([, v], i) => `${((i / n) * W).toFixed(1)},${y(v)}`).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;
  return (
    <span className={`swing ${d >= 0 ? "up" : "down"} ${className}`} role="img" aria-label={`Win chance moved from ${from}% to ${now}% this week`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {even && <line className="swing-mid" x1="0" x2={W} y1={y(50)} y2={y(50)} />}
        <polygon className="swing-fill" points={area} />
        <polyline className="swing-line" points={line} />
        <circle className="swing-dot" cx={W} cy={y(now)} r="2.6" />
      </svg>
      <small>{d === 0 ? `Even with ${from}%` : `${d > 0 ? "▲" : "▼"} ${Math.abs(d)} from ${from}%`}</small>
    </span>
  );
}
