// The deal comparison (both sides' starting points, market value, slot bars), on its own so the landing can show it
// without loading the trade builder (Trade.tsx).
import { Team, YOU } from "../data";
import { FAIR_GAP, Trade as TradeT, pct, groupPoints, groupsFor, lineupFor, rosterAfter, fmt } from "../engine";

/** Apple Sports "team stats" layout: big net change per side, then each slot group with a two-color bar. */

/** Each slot group after the deal, you on the left and them on the right, with a two-color bar. */
export function PositionBars({ trade, them }: { trade: TradeT; them: Team }) {
  const youAfter = groupPoints(lineupFor(rosterAfter(YOU, trade, "you")));
  const themAfter = groupPoints(lineupFor(rosterAfter(them, trade, "them")));
  return (
    <div className="tc-rows">
      {groupsFor().map((g) => {
        const a = youAfter[g], b = themAfter[g];
        return (
          <div key={g} className="tc-row">
            <span className="v">{a.toFixed(1)}</span>
            <span className="lbl">{groupName(g)}</span>
            <span className="v r">{b.toFixed(1)}</span>
            <span className="tc-bar" aria-hidden="true"><span style={{ flex: Math.max(a, 0.1) }} /><span style={{ flex: Math.max(b, 0.1) }} /></span>
          </div>
        );
      })}
    </div>
  );
}
const groupName = (g: string) => (g === "SF" ? "Superflex" : g === "FLEX" ? "Flex" : g);

/** One line for a folded position breakdown: where your lineup moves most, up and down. */
export function positionSummary(roster: string[], after: string[]): string {
  const b = groupPoints(lineupFor(roster)), a = groupPoints(lineupFor(after));
  const d = groupsFor().map((g) => ({ g, n: Math.round((a[g] - b[g]) * 10) / 10 })).filter((x) => Math.abs(x.n) >= 0.1);
  if (!d.length) return "Your lineup holds at every spot";
  const up = d.filter((x) => x.n > 0).sort((x, y) => y.n - x.n)[0], down = d.filter((x) => x.n < 0).sort((x, y) => x.n - y.n)[0];
  return ["Your", [up && `${groupName(up.g)} ${fmt(up.n)}`, down && `${groupName(down.g)} ${fmt(down.n)}`].filter(Boolean).join(", ")].join(" ");
}

export function TradeCompare({ trade, them, bars = true }: { trade: TradeT; them: Team; bars?: boolean }) {
  const cls = (n: number) => (n >= 0.05 ? "up" : n <= -0.05 ? "down" : "flat");
  return (
    <div className="tc" aria-label={`You ${fmt(trade.youDelta)} a week, ${them.manager} ${fmt(trade.themDelta)} a week`}>
      <div className="tc-head">
        <div className="tc-side">
          <span className="who"><i />You</span>
          <span className={`numeral ${cls(trade.youDelta)}`}>{fmt(trade.youDelta)}</span>
          <span className="sub">{trade.youBefore.toFixed(1)} to {trade.youAfter.toFixed(1)}</span>
        </div>
        <span className="tc-mid">pts / wk</span>
        <div className="tc-side right">
          <span className="who">{them.manager}<i /></span>
          <span className={`numeral ${cls(trade.themDelta)}`}>{fmt(trade.themDelta)}</span>
          <span className="sub">{trade.themBefore.toFixed(1)} to {trade.themAfter.toFixed(1)}</span>
        </div>
      </div>
      <MarketRow trade={trade} them={them} />
      {bars && <PositionBars trade={trade} them={them} />}
    </div>
  );
}

/** Market value of both packages, the fairness lens a trade calculator uses. */
function MarketRow({ trade, them }: { trade: TradeT; them: Team }) {
  const g = trade.marketGap;
  const fair = Math.abs(g) <= FAIR_GAP;
  const total = Math.max(1, trade.marketGive + trade.marketGet);
  const label = fair ? "Fair" : g > 0 ? `You win by ${pct(g).slice(1)}` : `${them.manager} wins by ${pct(g).slice(1)}`;
  return (
    <div className="tc-market" aria-label={`Market value. You give ${trade.marketGive}, you get ${trade.marketGet}. ${label}.`}>
      <div className="tc-market-top">
        <span className="tiny muted">Market value</span>
        <span className={`tc-fair ${fair || g > 0 ? "good" : "bad"}`}>{label}</span>
      </div>
      <div className="tc-market-bar" aria-hidden="true">
        <span className="give" style={{ flex: trade.marketGive / total }} />
        <span className="get" style={{ flex: trade.marketGet / total }} />
      </div>
      <div className="tc-market-top">
        <span className="small"><b className="num">{trade.marketGive.toLocaleString()}</b> <span className="muted">you give</span></span>
        <span className="small"><span className="muted">you get</span> <b className="num">{trade.marketGet.toLocaleString()}</b></span>
      </div>
    </div>
  );
}
