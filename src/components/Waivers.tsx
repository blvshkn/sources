import { useMemo, useState } from "react";
import { DEADLINES, FAAB, YOU, sleeperUrl } from "../data";
import { WaiverRec, bidDollars, bidsFor, eff, fmt, irReport } from "../engine";
import { AiLabel, Icon, Seg, Stamp } from "./ui";
import { Jersey } from "./Jersey";

export function Waivers({ recs, onToast }: { recs: WaiverRec[]; onToast: (m: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [pos, setPos] = useState<"ALL" | "QB" | "RB" | "WR" | "TE">("ALL");
  const [sort, setSort] = useState<"fit" | "trend" | "proj">("fit");
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
          <div className="eyebrow">{DEADLINES.waivers}</div>
          <h1 className="page-title">Waivers</h1>
          <p className="page-sub">Who to add, who to drop, and what to bid, based on what wins in your league.</p>
        </div>
        {FAAB.enabled && <div className="faab" aria-label={`FAAB remaining ${FAAB.remaining} of ${FAAB.budget}`}>
          <span className="tiny muted">FAAB left</span>
          <b className="num">${FAAB.remaining}<span className="muted">/{FAAB.budget}</span></b>
          <span className="faab-track"><span style={{ width: `${(FAAB.remaining / FAAB.budget) * 100}%` }} /></span>
        </div>}
      </header>

      {top && (
        <section className="card nudge nudge-waiver">
          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <div className="row wrap"><Stamp>Waivers</Stamp><span className="deadline"><Icon name="clock" size={12} />{DEADLINES.waivers}</span></div>
            <AiLabel />
          </div>
          <h3>Per sources, {top.fa.name} is your best add. <em>{FAAB.enabled ? `Bid ${top.bid[0]} to ${top.bid[1]} percent.` : "Put in a claim."}</em></h3>
          <p className="small">{top.fa.why}</p>
          <p className="small muted">{top.fa.name} adds {fmt(top.gain)} to your starters this week{irMove ? `. Move ${irMove.name} to IR first and you won't need to drop anyone` : top.drop ? `. Drop ${top.drop.name} (${eff(top.drop).toFixed(1)} projected)` : ""}.</p>
        </section>
      )}

      <div className="wv-filters">
        <div className="chips" role="group" aria-label="Position">
          {(["ALL", "QB", "RB", "WR", "TE"] as const).map((p) => (
            <button key={p} className={`chip-btn${pos === p ? " on" : ""}`} aria-pressed={pos === p} onClick={() => setPos(p)}>{p === "ALL" ? "All" : p}</button>
          ))}
        </div>
        <Seg label="Sort" value={sort} onChange={setSort} options={[{ v: "fit", label: "Best fit" }, { v: "trend", label: "Trending" }, { v: "proj", label: "Projected" }]} />
      </div>

      <section className="card" style={{ overflow: "hidden" }} aria-label="Waiver targets">
        <div className="roster-head"><b>Available</b><span className="tiny muted">{sort === "fit" ? "Ranked by points added to your starters" : sort === "trend" ? "Most added across Sleeper first" : "Ranked by weekly projection"}</span></div>
        {shown.length === 0 && <p className="small muted" style={{ padding: "8px 16px 18px" }}>No {pos} worth adding right now. Check back after waivers run.</p>}
        {shown.map((r, i) => {
          const isOpen = open === r.fa.id;
          return (
            <div key={r.fa.id} className={`wv${isOpen ? " open" : ""}`}>
              <button className="wv-row" onClick={() => setOpen(isOpen ? null : r.fa.id)} aria-expanded={isOpen}>
                <span className="wv-rank">{i + 1}</span>
                <Jersey p={r.fa} size={40} />
                <span className="wv-who">
                  <span className="wv-name">{r.fa.name}{r.fa.trend === "up" && <Icon name="spark" size={14} />}</span>
                  <span className="wv-meta"><b className={`lu-pos p-${r.fa.pos}`}>{r.fa.pos}</b>{r.fa.nfl}{r.fa.rookie && <span className="wv-flag">Rookie</span>}</span>
                </span>
                <span className="wv-proj"><span>Proj</span><b>{r.value.toFixed(1)}</b></span>
                <span className="wv-stats">
                  <span><i>Your lineup</i><b className={r.gain > 0.05 ? "good" : ""}>{r.gain > 0.05 ? fmt(r.gain) : "No change"}</b></span>
                  <span><i>{FAAB.enabled ? "Bid" : "Tier"}</i><b>{FAAB.enabled ? `$${bidDollars(r.bid[0])}-$${bidDollars(r.bid[1])}` : r.tier}</b></span>
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
                    <div><span className="eyebrow">{FAAB.enabled ? "Bid range" : "Claim"}</span><p className="small">{FAAB.enabled ? <><b>{r.bid[0]} to {r.bid[1]} percent</b> of budget</> : <>Rolling waiver priority in your league</>}</p></div>
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
