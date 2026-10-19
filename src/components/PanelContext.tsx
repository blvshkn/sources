import { DEADLINES, FAAB, ManagerTag, TEAMS, YOU, sleeperUrl } from "../data";
import { TeamNeeds, WaiverRec, bidDollars, fmt, groupsFor, irReport, recDrop, tendencies } from "../engine";
import { Avatar } from "./Avatar";
import { TeamAvatar } from "./TeamPicker";
import { bidText } from "./Waivers";

/** Waivers, in the docked panel: what you can spend, when claims run, and the one add worth making.
 *  Same numbers and wording as the Waivers screen's top pickup card. */
export function WaiverContext({ top, onToast }: { top?: WaiverRec; onToast: (m: string) => void }) {
  const run = DEADLINES.waivers.replace(/^Waivers run\s*/i, "") || "Weekly";
  const ir = irReport(YOU);
  const irMove = ir.open > 0 ? ir.moveIn[0] : undefined;
  const starts = !!top && top.gain > 0.05;
  const drop = top ? recDrop(top) : null;
  const kd = top?.kdef;
  return (
    <section className="ibx-ctx pctx" aria-label="Waivers">
      <div className="ibx-ctx-head"><b>Waivers</b><span className="pctx-sub">Runs {run}</span></div>
      {FAAB.enabled ? (
        <div className="pctx-faab" aria-label={`FAAB remaining ${FAAB.remaining} of ${FAAB.budget}`}>
          <span className="pctx-faab-n"><b>${FAAB.remaining}</b><span>/{FAAB.budget}</span></span>
          <span className="pctx-faab-l">FAAB left</span>
          <span className="pctx-track" aria-hidden="true"><span style={{ width: `${(FAAB.remaining / Math.max(1, FAAB.budget)) * 100}%` }} /></span>
        </div>
      ) : FAAB.priority ? (
        <div className="pctx-faab">
          <span className="pctx-faab-n"><b>#{FAAB.priority}</b><span>/{TEAMS.length}</span></span>
          <span className="pctx-faab-l">Waiver priority</span>
        </div>
      ) : (
        <p className="pctx-note">Rolling waiver priority. Claims go in order.</p>
      )}
      {top ? (
        <div className="pctx-pick">
          <span className="pctx-eyebrow">Top pickup</span>
          <div className="pctx-row">
            <Avatar p={top.fa} size={28} badge={false} />
            <span className="pctx-who">
              <b>{top.fa.name}</b>
              <small><b className={`lu-pos p-${top.fa.pos}`}>{top.fa.pos}</b> {top.fa.nfl} · {(kd ? top.value : top.fa.proj).toFixed(1)} proj</small>
            </span>
            <span className="pctx-bid"><small>{FAAB.enabled ? "Bid" : "Claim"}</small><b>{FAAB.enabled ? bidText(top.bid) : "Priority"}</b></span>
          </div>
          <ul className="pctx-plan">
            <li className={starts ? "good" : undefined}>{kd?.fix ? <>Your {top.fa.pos} is {kd.fix === "empty" ? "empty" : kd.fix === "bye" ? "on bye" : "out"}. <b>{fmt(top.gain)} pts</b> this week.</> : starts ? <>Starts for you, <b>{fmt(top.gain)} pts</b> this week.</> : "Bench stash for now."}</li>
            <li>{kd?.drop ? <>Drop <b>{kd.drop.name}</b>.</> : irMove ? <>Move <b>{irMove.name}</b> to IR first. No drop needed.</>
              : drop ? <>Drop <b>{drop.name}</b>.</> : "You have an open roster spot."}</li>
          </ul>
          <a className="linkish pctx-cta" href={sleeperUrl()} target="_blank" rel="noreferrer"
            onClick={() => onToast(`Opening Sleeper. ${FAAB.enabled ? `Bid up to $${bidDollars(top.bid[1])} on` : "Claim"} ${top.fa.name}${drop && (kd?.drop || !irMove) ? `, drop ${drop.name}` : ""}.`)}>
            Claim in Sleeper
          </a>
        </div>
      ) : <p className="pctx-note">Nothing on the wire beats your bench this week.</p>}
    </section>
  );
}

/** Trade, in the docked panel: who you're dealing with. Record, where they sit against the league,
 *  what you've noted about them and how they tend to trade. */
export function PartnerContext({ partnerId, needs, tags, onNotes }: { partnerId: string; needs: TeamNeeds[]; tags: ManagerTag[]; onNotes: () => void }) {
  const n = needs.find((x) => x.team.id === partnerId);
  if (!n) return null;
  const t = n.team;
  const theirs = tags.filter((x) => x.teamId === t.id);
  const td = tendencies(t.id);
  return (
    <section className="ibx-ctx pctx pctx-partner" aria-label={`About ${t.name}`} tabIndex={-1}>
      <div className="ibx-ctx-head"><b>Trading with</b><button className="linkish" onClick={onNotes}>{theirs.length ? `Notes (${theirs.length})` : "Add a note"}</button></div>
      <div className="pctx-row pctx-team">
        <TeamAvatar t={t} size={32} />
        <span className="pctx-who"><b>{t.name}</b><small>{t.manager} · {t.record} · #{n.rank} power</small></span>
        <span className={`pctx-mode ${n.mode === "Contender" ? "good" : ""}`}>{n.mode}</span>
      </div>
      <div className="pctx-vs" aria-label="Starting lineup points against league average">
        {groupsFor().map((g) => {
          const d = n.groups[g].diff;
          return (
            <span key={g} className={`${g === n.need ? "need" : ""}${d >= 0.5 ? " up" : d <= -0.5 ? " down" : ""}`}>
              <small>{g}</small><b>{fmt(d)}</b>
            </span>
          );
        })}
      </div>
      <p className="pctx-line">Needs <b>{n.need}</b>{n.surplusPlayer && n.surplus !== n.need ? <>. Spare {n.surplus}: <b>{n.surplusPlayer.name}</b></> : null}.</p>
      {theirs.length > 0 && (
        <ul className="pctx-tags">
          {theirs.slice(0, 3).map((x) => <li key={x.id}>{x.text}</li>)}
          {theirs.length > 3 && <li className="more">+{theirs.length - 3} more</li>}
        </ul>
      )}
      {/* Non-breaking hyphens keep "1-for-1" on one line */}
      <p className="pctx-note">{td.summary.replace(/-/g, "\u2011")}</p>
    </section>
  );
}
