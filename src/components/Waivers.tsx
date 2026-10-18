import { useState } from "react";
import { DEADLINES, FAAB, YOU, sleeperUrl } from "../data";
import { WaiverRec, bidDollars, bidsFor, eff, fmt } from "../engine";
import { AiLabel, Delta, Icon, Phase, PosBadge, Stamp } from "./ui";

export function Waivers({ recs, onToast }: { recs: WaiverRec[]; onToast: (m: string) => void }) {
  const [open, setOpen] = useState<string | null>(recs[0]?.fa.id ?? null);
  const top = recs[0];
  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">{DEADLINES.waivers} · <Phase v="v1" /></div>
          <h1 className="page-title">Waivers</h1>
          <p className="page-sub">Who to add, who to drop, and how much to bid, based on what actually wins in your league.</p>
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
          <p className="small muted">{top.fa.name} adds {fmt(top.gain)} to your starters this week{top.drop ? `. Drop ${top.drop.name} (${eff(top.drop).toFixed(1)} projected)` : ""}.</p>
        </section>
      )}

      <section className="card" style={{ overflow: "hidden" }} aria-label="Waiver targets">
        <div className="roster-head"><b>Best available for {YOU.name}</b><span className="tiny muted">Ranked by points added to your starters</span></div>
        {recs.map((r) => {
          const isOpen = open === r.fa.id;
          return (
            <div key={r.fa.id} className={`wv${isOpen ? " open" : ""}`}>
              <button className="wv-row" onClick={() => setOpen(isOpen ? null : r.fa.id)} aria-expanded={isOpen}>
                <PosBadge pos={r.fa.pos} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="pname" style={{ display: "block" }}>{r.fa.name} {r.fa.trend === "up" && <span className="trend">Trending</span>}{r.fa.rookie && <span className="trend">Rookie</span>}</span>
                  <span className="pmeta">{r.fa.nfl} · {r.value.toFixed(1)} a week{r.fa.rostered !== undefined ? ` · ${r.fa.rostered}% rostered` : ""}</span>
                </span>
                {FAAB.enabled ? <span className="wv-bid"><b className="num">{r.bid[0]}-{r.bid[1]}%</b><span className="tiny muted">${bidDollars(r.bid[0])}-${bidDollars(r.bid[1])}</span></span> : <span className="wv-bid"><span className="tiny muted">{r.tier}</span></span>}
                <Delta n={r.gain} />
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
                      <Icon name="app" size={16} />Place claim in Sleeper
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
