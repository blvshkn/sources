import { useMemo, useState } from "react";
import { DEADLINES, FAAB, YOU, sleeperUrl , PLAYERS, gameLine } from "../data";
import { WaiverRec, bidDollars, bidsFor, eff, fmt, irReport, waiverHidden } from "../engine";
import { AiLabel, Icon, useSticky } from "./ui";
import { Avatar } from "./Avatar";

/** "$40-$90", or "Up to $150" when the low end is zero. */
const bidText = (b: [number, number] | number[]) => { const lo = bidDollars(b[0]), hi = bidDollars(b[1]); return lo <= 0 ? `Up to $${hi}` : `$${lo}-$${hi}`; };

export function Waivers({ recs, onToast }: { recs: WaiverRec[]; onToast: (m: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [pos, setPos] = useSticky<"ALL" | "QB" | "RB" | "WR" | "TE">("waivers.pos", "ALL");
  const [sort, setSort] = useSticky<"fit" | "trend" | "proj">("waivers.sort", "fit");
  const top = recs[0];
  const ir = irReport(YOU);
  const irMove = ir.open > 0 ? ir.moveIn[0] : undefined;
  const shown = useMemo(() => {
    const list = recs.filter((r) => pos === "ALL" || r.fa.pos === pos);
    if (sort === "trend") return [...list].sort((a, b) => (b.fa.trend === "up" ? 1 : 0) - (a.fa.trend === "up" ? 1 : 0) || (b.fa.rostered ?? 0) - (a.fa.rostered ?? 0));
    if (sort === "proj") return [...list].sort((a, b) => b.value - a.value);
    return list;
  }, [recs, pos, sort]);
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Waivers</h1>
          <p className="page-meta">{DEADLINES.waivers}</p>
        </div>
        {FAAB.enabled && <div className="faab" aria-label={`FAAB remaining ${FAAB.remaining} of ${FAAB.budget}`}>
          <span className="tiny muted">FAAB left</span>
          <b className="num">${FAAB.remaining}<span className="muted">/{FAAB.budget}</span></b>
          <span className="faab-track"><span style={{ width: `${(FAAB.remaining / FAAB.budget) * 100}%` }} /></span>
        </div>}
      </header>

      {top && (() => {
        const hi = bidDollars(top.bid[1]);
        const starts = top.gain > 0.05;
        const game = gameLine(PLAYERS[top.fa.id] ?? {});
        return (
          <section className={`card topk${starts ? " gain" : ""}`} aria-label="Top pickup">
            <div className="topk-head"><span className="topk-label">Top pickup</span><AiLabel /></div>
            <div className="topk-who">
              <Avatar p={top.fa} size={52} />
              <div className="topk-id">
                <h3 className="topk-name">{top.fa.name}</h3>
                <span className="wv-meta"><b className={`lu-pos p-${top.fa.pos}`}>{top.fa.pos}</b>{top.fa.nfl}{game && <span className="lu-game">· {game}</span>}</span>
              </div>
            </div>
            <dl className="topk-stats">
              <div><dt>This week</dt><dd>{top.fa.proj.toFixed(1)}</dd></div>
              <div><dt>ROS per week</dt><dd>{top.value.toFixed(1)}</dd></div>
              <div><dt>{FAAB.enabled ? "Bid" : "Claim"}</dt><dd>{FAAB.enabled ? bidText(top.bid) : "Priority"}</dd></div>
            </dl>
            {!/^Projects /.test(top.fa.why) && <p className="topk-why">{top.fa.why}</p>}
            <ul className="topk-plan">
              <li className={starts ? "good" : ""}><Icon name={starts ? "check" : "eye"} size={16} />
                {starts ? <span>Starts for you. <b>{fmt(top.gain)} pts</b> this week.</span> : <span>Bench stash for now. Doesn't crack your lineup this week.</span>}
              </li>
              <li><Icon name="trade" size={16} />
                {irMove ? <span>Move <b>{irMove.name}</b> to IR first. No drop needed.</span>
                  : top.drop ? <span>Drop <b>{top.drop.name}</b> ({eff(top.drop).toFixed(1)} projected).</span>
                  : <span>You have an open roster spot.</span>}
              </li>
            </ul>
            <a className="btn btn-primary topk-cta" href={sleeperUrl()} target="_blank" rel="noreferrer"
              onClick={() => onToast(`Opening Sleeper. ${FAAB.enabled ? `Bid up to $${hi} on` : "Claim"} ${top.fa.name}${top.drop && !irMove ? `, drop ${top.drop.name}` : ""}.`)}>
              Claim in Sleeper
            </a>
          </section>
        );
      })()}

      <section className="card wv-card" aria-label="Waiver targets">
        <div className="wv-head">
          <div className="wv-head-t">
            <b>Available</b>
            <span>{sort === "fit" ? "Ranked by points added to your lineup" : sort === "trend" ? "Most added across Sleeper" : "Ranked by weekly projection"}</span>
          </div>
          <label className="wv-sort">
            <span className="sr-only">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="fit">Best fit</option>
              <option value="trend">Trending</option>
              <option value="proj">Projected</option>
            </select>
            <Icon name="chev" size={14} />
          </label>
        </div>
        <div className="wv-pos" role="group" aria-label="Position">
          {(["ALL", "QB", "RB", "WR", "TE"] as const).map((p) => (
            <button key={p} aria-pressed={pos === p} onClick={() => setPos(p)}>{p === "ALL" ? "All" : p}</button>
          ))}
        </div>
        {shown.length === 0 && <p className="small muted" style={{ padding: "8px 16px 18px" }}>No {pos} worth adding right now. Check back after waivers run.</p>}
        {shown.map((r, i) => {
          const isOpen = open === r.fa.id;
          return (
            <div key={r.fa.id} className={`wv${isOpen ? " open" : ""}`}>
              <button className="wv-row" onClick={() => setOpen(isOpen ? null : r.fa.id)} aria-expanded={isOpen}>
                <span className="wv-rank">{i + 1}</span>
                <Avatar p={r.fa} size={40} />
                <span className="wv-who">
                  <span className="wv-name">{r.fa.name}{r.fa.trend === "up" && <Icon name="spark" size={14} />}</span>
                  <span className="wv-meta"><b className={`lu-pos p-${r.fa.pos}`}>{r.fa.pos}</b>{r.fa.nfl}{gameLine(PLAYERS[r.fa.id] ?? {}) && <span className="lu-game">· {gameLine(PLAYERS[r.fa.id] ?? {})}</span>}{r.fa.rookie && <span className="wv-flag">Rookie</span>}</span>
                </span>
                <span className="wv-proj"><span>Proj</span><b>{r.value.toFixed(1)}</b></span>
                <span className="wv-stats">
                  <span><i>Your lineup</i><b className={r.gain > 0.05 ? "good" : ""}>{r.gain > 0.05 ? fmt(r.gain) : "No change"}</b></span>
                  <span><i>{FAAB.enabled ? "Bid" : "Tier"}</i><b>{FAAB.enabled ? bidText(r.bid) : r.tier}</b></span>
                  {r.fa.rostered !== undefined && <span><i>Rostered</i><b>{r.fa.rostered}%</b></span>}
                  {r.fa.adds !== undefined && <span><i>Adds 24h</i><b>{r.fa.adds >= 1000 ? `${(r.fa.adds / 1000).toFixed(1)}K` : r.fa.adds}</b></span>}
                </span>
              </button>
              {isOpen && (
                <div className="wv-detail">
                  <p className="small">{r.fa.why}</p>
                  <div className="wv-grid">
                    <div><span className="eyebrow">Add</span><p className="small"><b>{r.fa.name}</b>, {r.tier.toLowerCase()} tier</p></div>
                    <div><span className="eyebrow">Drop</span><p className="small">{r.drop ? <><b>{r.drop.name}</b> ({eff(r.drop).toFixed(1)} proj, your lowest bench player)</> : "Open roster spot"}</p></div>
                    <div><span className="eyebrow">{FAAB.enabled ? "Bid range" : "Claim"}</span><p className="small">{FAAB.enabled ? <><b>{bidText(r.bid)}</b> ({r.bid[0]} to {r.bid[1]} percent of budget)</> : <>Rolling waiver priority in your league</>}</p></div>
                  </div>
                  {FAAB.enabled && <BidHistory tier={r.tier} range={r.bid} />}
                  <div className="row wrap">
                    <a className="btn btn-primary btn-sm" href={sleeperUrl()} target="_blank" rel="noreferrer" onClick={() => onToast(`Opening Sleeper. Bid ${r.bid[1]}% on ${r.fa.name}, drop ${r.drop?.name ?? "nobody"}.`)}>
                      <Icon name="app" size={16} />Open Sleeper
                    </a>
                    <span className="tiny muted">Claims are placed in your league app. Sources never bids for you.</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {(() => {
          const h = waiverHidden();
          if (!h.played && !h.bye) return null;
          const n = (k: number) => `${k} ${k === 1 ? "player" : "players"}`;
          const parts = [h.played ? `${n(h.played)} whose game already started` : "", h.bye ? `${n(h.bye)} on bye` : ""].filter(Boolean).join(" and ");
          return <p className="wv-hidden"><Icon name="lock" size={14} />Hidden: {parts}. They can't score for you this week.</p>;
        })()}
      </section>
    </>
  );
}

function BidHistory({ tier, range }: { tier: string; range: [number, number] }) {
  const { bids, estimated } = bidsFor(tier as "Starter" | "Flex" | "Depth" | "Stash");
  const max = Math.max(30, ...bids);
  return (
    <div className="bid-hist">
      <span className="tiny muted">{estimated ? `Not enough winning ${tier.toLowerCase()} bids in your league yet, so this shows a typical range` : `Winning ${tier.toLowerCase()} bids in your league this season (${bids.length})`}</span>
      <div className="bid-track" role="img" aria-label={`Winning bids: ${bids.join(", ")} percent`}>
        <span className="bid-range" style={{ left: `${(range[0] / max) * 100}%`, width: `${Math.max(2, ((range[1] - range[0]) / max) * 100)}%` }} />
        {bids.map((b, i) => <span key={i} className="bid-dot" style={{ left: `${(b / max) * 100}%` }} title={`${b}%`} />)}
      </div>
      <div className="bid-scale"><span>0%</span><span>{Math.round(max / 2)}%</span><span>{max}%</span></div>
    </div>
  );
}
