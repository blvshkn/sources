import { useState } from "react";
import { LEAGUE, Player, WEEK, YOU, gameLine, onBye, playerById } from "../data";
import { eff, round1, scored } from "../engine";
import { Avatar } from "./Avatar";
import { Icon, StatusPill } from "./ui";

type Metric = { label: string; get: (p: Player) => number | null; fmt?: (n: number) => string };

const recent = (p: Player) => {
  const pts = Object.keys(LEAGUE.history ?? {}).map(Number).filter((w) => w < WEEK).sort((a, b) => b - a)
    .map((w) => LEAGUE.history![w].points[p.id]).filter((v): v is number => typeof v === "number").slice(0, 3);
  return pts.length ? round1(pts.reduce((a, b) => a + b, 0) / pts.length) : null;
};

const METRICS: Metric[] = [
  { label: "This week", get: (p) => eff(p, true) },
  { label: "Rest of season, per week", get: (p) => eff(p) },
  { label: "Playoff weeks, per week", get: (p) => (p.playoff ? round1(scored({ ...p, pts: p.playoff, wk: undefined })) : null) },
  { label: "Last 3 games, average", get: recent },
  { label: "Trade value", get: (p) => p.value ?? null, fmt: (n) => Math.round(n).toLocaleString() },
];

/** Head-to-head start/sit: pick two of your players and compare them stat by stat. */
export function StartSit({ a: a0, b: b0 }: { a?: string; b?: string }) {
  const pool = YOU.roster.map(playerById).sort((x, y) => eff(y, true) - eff(x, true));
  const [aId, setA] = useState(a0 ?? pool[0]?.id);
  const [bId, setB] = useState(b0 ?? pool[1]?.id);
  if (!aId || !bId) return null;
  const A = playerById(aId), B = playerById(bId);
  const rows = METRICS.map((m) => ({ m, a: m.get(A), b: m.get(B) })).filter((r) => r.a !== null || r.b !== null);
  const wa = eff(A, true), wb = eff(B, true);
  const gap = round1(Math.abs(wa - wb));
  const lead = wa >= wb ? A : B, other = lead === A ? B : A;
  const rosEdge = eff(A) === eff(B) ? null : eff(A) > eff(B) ? A : B;
  const verdict = wa === 0 && wb === 0 ? "Neither is projected to play this week."
    : gap < 1 ? `Coin flip. ${rosEdge ? `Lean ${rosEdge.name}, who has the rest-of-season edge.` : "Go with your gut."}`
    : `Start ${lead.name}. Projects ${gap} pts more than ${other.name} this week.`;

  const Pick = ({ id, set, side }: { id: string; set: (v: string) => void; side: "a" | "b" }) => {
    const p = playerById(id);
    return (
      <label className={`sx-pick ${side}${p.id === lead.id && gap >= 1 ? " lead" : ""}`}>
        <Avatar p={p} size={44} />
        <b className="sx-name">{p.name}</b>
        <small>{p.pos} · {p.nfl}{!onBye(p.nfl) && gameLine(p) ? ` · ${gameLine(p)}` : ""} <StatusPill p={p} /></small>
        <span className="sx-change">Change<Icon name="chev" size={12} /></span>
        <select className="sx-native" value={id} onChange={(e) => set(e.target.value)} aria-label={side === "a" ? "First player" : "Second player"}>
          {pool.map((o) => <option key={o.id} value={o.id} disabled={o.id === (side === "a" ? bId : aId)}>{o.name} ({o.pos})</option>)}
        </select>
      </label>
    );
  };

  return (
    <section className="card sx" aria-labelledby="sx-title">
      <header className="sx-head">
        <h2 className="section-title" id="sx-title">Start / Sit compare</h2>
        <p>Pick any two players on your roster.</p>
      </header>
      <div className="sx-picks">
        <Pick id={aId} set={setA} side="a" />
        <span className="sx-vs" aria-hidden="true">vs</span>
        <Pick id={bId} set={setB} side="b" />
      </div>
      <p className={`sx-verdict${gap < 1 ? " flip" : ""}`}>{verdict}</p>
      <div className="sx-rows">
        {rows.map(({ m, a, b }) => {
          const av = a ?? 0, bv = b ?? 0, max = Math.max(av, bv, 0.0001);
          const f = m.fmt ?? ((n: number) => n.toFixed(1));
          return (
            <div key={m.label} className="sx-row">
              <span className="sx-label">{m.label}</span>
              <div className="sx-bars">
                <span className={`sx-bar a${av > bv ? " win" : ""}`}><i style={{ width: `${(av / max) * 100}%` }} /><b>{a === null ? "n/a" : f(a)}</b></span>
                <span className={`sx-bar b${bv > av ? " win" : ""}`}><i style={{ width: `${(bv / max) * 100}%` }} /><b>{b === null ? "n/a" : f(b)}</b></span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
