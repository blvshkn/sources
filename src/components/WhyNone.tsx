// Trade > Ideas when the finder comes up empty: why, in plain words, from the scan's own record (scanWhy.ts). The
// nearest deals open in Build so they can be tweaked, and a next step shows only when the numbers back it.
import { useMemo } from "react";
import { YOU, type ManagerTag, type MyTag, type Team } from "../data";
import { fmt, newScanDiag, scanTrades, type Price, type ScanDiag, type Trade } from "../engine";
import { drain } from "../steps";
import { whyNone } from "../scanWhy";
import { Icon } from "./icons";
import { AiMark } from "./WorkingLoader";

const share = (x: number) => (x > 0 && x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);

export function WhyNone({ them, diag, tags, myTags, prices, ideasByTeam, onOpen, onTeam }: {
  them: Team;
  /** The scan the Ideas tab just ran. Without one (the tab was left and reopened), the same scan runs here. */
  diag?: ScanDiag;
  tags: ManagerTag[]; myTags: Record<string, MyTag>; prices: Record<string, Price>;
  ideasByTeam: Record<string, Trade[]>;
  onOpen: (t: Trade) => void;
  onTeam: (teamId: string) => void;
}) {
  const d = useMemo(() => {
    if (diag) return diag;
    const x = newScanDiag();
    drain(scanTrades(YOU, them, tags, myTags, prices, 3, { n: 0 }, x));
    return x;
  }, [diag, them, tags, myTags, prices]);
  const w = useMemo(() => whyNone(them, d, tags, myTags, prices, ideasByTeam), [them, d, tags, myTags, prices, ideasByTeam]);
  const who = them.manager;
  if (!w.scored) return <p className="empty-deal">{who} has no players to trade right now.</p>;
  return (
    <section className="card wn-card" aria-labelledby="wn-title">
      <h2 id="wn-title" className="wn-title">Why no trades with {who}</h2>
      {w.lead.map((p) => <p key={p} className="wn-lead">{p}</p>)}

      <div className="wn-block">
        <p className="wn-k">What ruled out <span className="num">{w.scored.toLocaleString("en-US")}</span> trades</p>
        <ul className="wn-rows">
          {w.rows.map((r) => (
            <li key={r.key} className="wn-row">
              <span className="wn-label">{r.label}</span>
              <span className="wn-pct num">{share(r.share)}</span>
              <span className="wn-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, Math.round(r.share * 100))}%` }} /></span>
            </li>
          ))}
        </ul>
      </div>

      {w.misses.length > 0 && (
        <div className="wn-block">
          <p className="wn-k">{w.misses.length > 1 ? "Closest deals" : "Closest deal"}</p>
          <ul className="wn-misses">
            {w.misses.map((m) => (
              <li key={m.trade.key}>
                <button type="button" className="wn-miss" onClick={() => onOpen(m.trade)} aria-label={`${m.title}. ${m.nums}. ${m.reason}. Open in Build`}>
                  <span className="wn-mmain">
                    <span className="wn-mtitle">{m.title}</span>
                    <span className="wn-mnums">You <span className="num">{fmt(m.trade.youDelta)}</span>, {who} <span className="num">{fmt(m.trade.themDelta)}</span> a week</span>
                    <span className="wn-mwhy">{m.reason}</span>
                  </span>
                  <Icon name="chev" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {w.tip && (
        <div className="wn-tip">
          <p><AiMark size={14} /><span>{w.tip.text}</span></p>
          {(w.tip.trade || w.tip.teams?.length) && (
            <div className="wn-acts">
              {w.tip.trade && <button type="button" className="wn-act" onClick={() => onOpen(w.tip!.trade!)}>Open in Build</button>}
              {w.tip.teams?.map((t) => <button key={t.id} type="button" className="wn-act" onClick={() => onTeam(t.id)}>Try {t.manager}</button>)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
