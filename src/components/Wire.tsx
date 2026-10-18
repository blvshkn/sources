import { useContext, useState } from "react";
import { IdeaFeedbackCtx } from "./IdeaFeedback";
import { Ring } from "./Ring";
import { playerById, teamById, YOU, TEAMS, Pos, ManagerTag, DEADLINES, UPDATED, WEEK, OPPONENT_ID } from "../data";
import { Trade, TeamNeeds, fmt, offerRead, verdict, lineupFor , specialLineup } from "../engine";
import { AiLabel, Delta, Icon, IconName, Phase, Stamp } from "./ui";
import { Avatar } from "./Avatar";
import { TeamAvatar } from "./TeamPicker";

export type NudgeKind = "ir" | "need" | "offer" | "news" | "stale" | "lineup" | "waiver" | "slot";
export interface Nudge {
  id: string;
  kind: NudgeKind;
  teamId?: string;
  headline: string;
  emph?: string;
  why: string;
  trades: Trade[];
  time: string;
  deadline?: string;
  offer?: Trade;
  counter?: { trade: Trade; line: string } | null;
  impact?: { label: string; text: string }[];
  tagId?: string;
  go?: { label: string; tab: string };
}

export interface FollowUp { id: string; trade: Trade; via: string; when: string }
export interface Briefing { lineup: string; trade: Trade | null; waiver: string }

const swap = (ids: string[]) => ids.map((id) => playerById(id).name).join(" + ");

function IdeaSide({ label, ids, tone }: { label: string; ids: string[]; tone: "send" | "get" }) {
  return (
    <section className={`tx-side ${tone}`} aria-label={label}>
      <header><span>{label}</span><small>{ids.length} {ids.length === 1 ? "player" : "players"}</small></header>
      <ul>
        {ids.map((id) => {
          const p = playerById(id);
          return (
            <li key={id}>
              <Avatar p={p} size={40} />
              <span className="tx-pl"><b>{p.name}</b><small>{p.pos} · {p.nfl}</small></span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function TradeIdea({ t, onOpen, onPitch }: { t: Trade; onOpen: (t: Trade) => void; onPitch: (t: Trade) => void }) {
  // "Their lineup +x/wk" repeats the number shown above, so it's left out
  const reasons = (t.accept?.reasons ?? []).filter((r) => !/lineup/i.test(r)).map((r) => r.charAt(0).toUpperCase() + r.slice(1));
  const tone = t.accept?.label === "Likely yes" ? "good" : "warn";
  const feedback = useContext(IdeaFeedbackCtx);
  return (
    <article className={`ti${t.accept?.label === "Likely yes" ? " likely" : ""}`}>
      <div className="tx">
        <IdeaSide label="You send" ids={t.give} tone="send" />
        <span className="tx-swap" aria-hidden="true"><Icon name="trade" size={16} /></span>
        <IdeaSide label="You get" ids={t.get} tone="get" />
      </div>
      <dl className="ti-stats">
        {t.accept && (
          <div className={`ti-stat odds ${tone}`}>
            <dt>{t.accept.label}</dt>
            <dd>{Math.round(t.accept.p * 100)}<small>%</small></dd>
            <span className="ti-meter" aria-hidden="true"><i style={{ width: `${Math.round(t.accept.p * 100)}%` }} /></span>
          </div>
        )}
        <div className="ti-stat"><dt>You gain</dt><dd><Delta n={t.youDelta} /><small>/wk</small></dd></div>
        <div className="ti-stat"><dt>They gain</dt><dd><Delta n={t.themDelta} /><small>/wk</small></dd></div>
      </dl>
      {reasons.length > 0 && <p className="ti-why">{reasons.join(". ")}.</p>}
      <div className="ti-actions">
        <button className="btn btn-sm ti-btn" onClick={() => onOpen(t)}>Open in builder</button>
        <button className="btn btn-primary btn-sm ti-btn" onClick={() => onPitch(t)}><Icon name="pen" size={15} />Write pitch</button>
      </div>
      {feedback && <button className="ti-nope" onClick={() => feedback(t)}>Won't work? Tell Sources why</button>}
    </article>
  );
}

const KIND: Record<NudgeKind, { label: string; icon: IconName }> = {
  ir: { label: "Injured reserve", icon: "alert" },
  need: { label: "Trade idea", icon: "trade" }, offer: { label: "Offer received", icon: "send" }, news: { label: "News", icon: "alert" },
  stale: { label: "Check in", icon: "clock" }, lineup: { label: "Lineup", icon: "roster" }, waiver: { label: "Waivers", icon: "waivers" }, slot: { label: "Pattern", icon: "spark" },
};
const initials = (s: string) => s.replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
// Standard normal CDF (Abramowitz-Stegun), for a win chance from the two projections
const phi = (x: number) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp(-x * x / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; };

/** Manager avatar from Sleeper, or initials when they haven't set one. */
function TeamBadge({ t, side }: { t: { name: string; avatar?: string }; side: "you" | "them" }) {
  const [bad, setBad] = useState(false);
  return t.avatar && !bad
    ? <img className={`sb-badge ${side} sb-img`} src={`https://sleepercdn.com/avatars/thumbs/${t.avatar}`} alt="" onError={() => setBad(true)} />
    : <span className={`sb-badge ${side}`}>{initials(t.name)}</span>;
}

/** Apple Sports style scoreboard: you vs this week's opponent, big numerals. */
export function Scoreboard({ you, partner, onPartner, onMatchup }: { you: TeamNeeds; partner: string | null; onPartner?: () => void; onMatchup?: () => void }) {
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  const mine = lineupFor(YOU.roster, true).total + specialLineup(YOU).total;
  const theirs = opp ? lineupFor(opp.roster, true).total + specialLineup(opp).total : null;
  const chance = theirs !== null ? Math.round(phi((mine - theirs) / 34) * 100) : null;
  const pt = partner ? TEAMS.find((t) => t.manager === partner || t.name === partner) : undefined;
  const need = you.groups[you.need].diff;
  const Row = ({ t, pts, side }: { t: typeof YOU; pts: number; side: "you" | "them" }) => (
    <span className={`sb2-row ${side}`}>
      <TeamBadge t={t} side={side} />
      <span className="sb2-who"><b>{t.name}</b><small>{side === "you" ? "You" : t.manager} · {t.record}</small></span>
      <span className="sb2-pts">{pts.toFixed(1)}</span>
    </span>
  );
  return (
    <section className="card sb2" aria-label="This week">
      <header className="sb2-head">
        <span>Week {WEEK} matchup</span>
        <span>Projected</span>
      </header>
      <button className="sb2-rows sb2-open" onClick={onMatchup} disabled={!onMatchup} aria-label="Open this week's matchup">
        <Row t={YOU} pts={mine} side="you" />
        {opp && theirs !== null && <>
          <span className="sb2-div" aria-hidden="true"><span>vs</span></span>
          <Row t={opp} pts={theirs} side="them" />
        </>}
        {opp && <span className="sb2-more">See the full matchup<Icon name="chev" size={14} /></span>}
      </button>
      {chance !== null && theirs !== null && (
        <div className="sb2-odds">
          <Ring pct={chance} label={`${chance}%`} sub="to win" size={84} />
          <div className="sb2-odds-t">
            <b className={chance >= 55 ? "good" : chance <= 45 ? "bad" : ""}>{chance >= 55 ? "Favored" : chance <= 45 ? "Underdog" : "Toss-up"}</b>
            <span className={`margin-pill ${mine - theirs >= 0 ? "up" : "down"}`}>{mine - theirs >= 0 ? "+" : "−"}{Math.abs(mine - theirs).toFixed(1)} pts</span>
            <small>Projected margin vs {opp?.manager}</small>
          </div>
        </div>
      )}
      <dl className="ti-stats sb2-stats">
        <div className="ti-stat"><dt>Power rank</dt><dd>#{you.rank}<small>of {TEAMS.length}</small></dd></div>
        <div className="ti-stat"><dt>Weakest spot</dt><dd>{you.need}<span className={`sb2-need ${need < 0 ? "down" : "up"}`}>{fmt(need)}</span></dd></div>
      </dl>
      {partner && onPartner ? (
        <button className="sb2-partner" onClick={onPartner} aria-label={`Build a trade with ${partner}`}>
          {pt && <TeamAvatar t={pt} size={36} />}
          <span className="sb2-who"><small>Best trade partner</small><b>{partner}</b></span>
          <span className="sb2-go">Build a deal<Icon name="chev" size={16} /></span>
        </button>
      ) : (
        <p className="sb2-none">No clear trade partner yet.</p>
      )}
    </section>
  );
}

function FollowUpCard({ f, coach, onTag, onResolve, onOpen, onPitch }: {
  f: FollowUp;
  coach: (t: Trade) => { trade: Trade; line: string } | null;
  onTag: (t: Omit<ManagerTag, "id">) => void;
  onResolve: (id: string, msg: string) => void;
  onOpen: (t: Trade) => void;
  onPitch: (t: Trade) => void;
}) {
  const them = teamById(f.trade.partnerId);
  const [no, setNo] = useState(false);
  const c = no ? coach(f.trade) : null;
  return (
    <article className="card nudge followup">
      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <Stamp>Follow up</Stamp>
        <span className="rail-time">Sent {f.when} by {f.via}</span>
      </div>
      <h3>Did {them.manager} reply?</h3>
      <p className="muted small">You offered {swap(f.trade.give)} for {swap(f.trade.get)}. One tap turns the answer into a tag so the next idea is smarter.</p>
      {!no ? (
        <div className="chips-row">
          <button className="chip-btn good" onClick={() => onResolve(f.id, `Deal logged with ${them.manager}.`)}>They're in</button>
          <button className="chip-btn" onClick={() => setNo(true)}>They said no</button>
          {f.trade.give.map((id) => (
            <button key={id} className="chip-btn" onClick={() => { onTag({ teamId: them.id, kind: "notInterested", playerId: id, text: `Not interested in ${playerById(id).name}`, weeksOld: 0 }); onResolve(f.id, `Tagged: ${them.manager} isn't interested in ${playerById(id).name}.`); }}>
              Not interested in {playerById(id).name.split(" ").slice(-1)[0]}
            </button>
          ))}
          {f.trade.get.map((id) => (
            <button key={id} className="chip-btn" onClick={() => { onTag({ teamId: them.id, kind: "refuses", playerId: id, text: `Won't move ${playerById(id).name}`, weeksOld: 0 }); onResolve(f.id, `Tagged: ${them.manager} won't move ${playerById(id).name}.`); }}>
              Won't move {playerById(id).name.split(" ").slice(-1)[0]}
            </button>
          ))}
          <button className="chip-btn ghost" onClick={() => onResolve(f.id, "Got it. Sources will ask again tomorrow.")}>No reply yet</button>
        </div>
      ) : (
        <div className="coach">
          <div className="row"><Stamp>Suggested counter</Stamp><Phase v="v1" /></div>
          {c ? (
            <>
              <p className="small"><b>{c.line}.</b> {verdict(c.trade).line}</p>
              <TradeIdea t={c.trade} onOpen={onOpen} onPitch={onPitch} />
              <AiLabel />
            </>
          ) : <p className="small muted">No single tweak makes this work for both of you while respecting {them.manager}'s tags. Try another partner.</p>}
          <div className="row"><button className="btn btn-sm btn-ghost" onClick={() => onResolve(f.id, "Follow-up closed.")}>Done</button></div>
        </div>
      )}
    </article>
  );
}

function OfferBlock({ n, onOpen, onPitch }: { n: Nudge; onOpen: (t: Trade) => void; onPitch: (t: Trade) => void }) {
  const o = n.offer!;
  const read = offerRead(o);
  return (
    <>
      <div className="deal-lists">
        <div><span className="eyebrow">You send</span><ul>{o.give.map((id) => <li key={id}><Avatar p={playerById(id)} size={26} /><span>{playerById(id).name}</span></li>)}</ul></div>
        <div><span className="eyebrow">You get</span><ul>{o.get.map((id) => <li key={id}><Avatar p={playerById(id)} size={26} /><span>{playerById(id).name}</span></li>)}</ul></div>
      </div>
      <div className={`verdict ${read.tone}`}><b>{read.label}</b><span className="small">{read.line} {teamById(o.partnerId).manager} gains {fmt(o.themDelta)}.</span></div>
      {n.counter && (
        <div className="coach">
          <p className="small"><b>Ready counter:</b> {n.counter.line}. You {fmt(n.counter.trade.youDelta)}, {teamById(o.partnerId).manager} {fmt(n.counter.trade.themDelta)} a week.</p>
          <div className="row wrap">
            <button className="btn btn-sm" onClick={() => onOpen(n.counter!.trade)}>Open in builder</button>
            <button className="btn btn-sm btn-primary" onClick={() => onPitch(n.counter!.trade)}>Send counter</button>
          </div>
        </div>
      )}
      <AiLabel onData={() => onOpen(o)} dataLabel="Open the offer" />
    </>
  );
}

export function Wire({ you, partner, partnerId, nudges, followUps, briefing, coach, onOpen, onPitch, onGo, onDismiss, onTag, onResolve, onKeepTag, onClearTag, onCapture, level }: {
  you: TeamNeeds;
  partner: string | null;
  partnerId: string | null;
  nudges: Nudge[];
  followUps: FollowUp[];
  briefing: Briefing;
  coach: (t: Trade) => { trade: Trade; line: string } | null;
  onOpen: (t: Trade) => void;
  onPitch: (t: Trade) => void;
  onGo: (tab: string, teamId?: string) => void;
  onDismiss: (n: Nudge) => void;
  onTag: (t: Omit<ManagerTag, "id">) => void;
  onResolve: (id: string, msg: string) => void;
  onKeepTag: (id: string) => void;
  onClearTag: (id: string) => void;
  onCapture: () => void;
  level: string;
}) {
  const [leaving, setLeaving] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? nudges : nudges.slice(0, 2);
  const leave = (n: Nudge) => {
    setLeaving((c) => [...c, n.id]);
    window.setTimeout(() => { onDismiss(n); setLeaving((c) => c.filter((x) => x !== n.id)); }, 200);
  };
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title"><span className="page-ic" aria-hidden="true"><Icon name="wire" size={20} /></span>The Wire</h1>
          <p className="page-meta">Week {WEEK} · {DEADLINES.lock}</p>
        </div>
      </header>

      <Scoreboard you={you} partner={partner} onPartner={partnerId ? () => onGo("trade", partnerId) : undefined} onMatchup={() => onGo("matchup")} />

      <section className="card briefing" aria-label="Weekly briefing">
        <div className="row wrap" style={{ justifyContent: "space-between" }}>
          <div className="row"><h2 className="section-title">This week</h2><Phase v="v1" /></div>
          <span className="tiny muted">{UPDATED}</span>
        </div>
        <button className="brief-row" onClick={() => onGo("roster")}>
          <span className="brief-k">Lineup fix</span><span className="grow">{briefing.lineup}</span><Icon name="chev" size={16} />
        </button>
        <button className="brief-row" onClick={() => briefing.trade ? onOpen(briefing.trade) : onGo("trade")}>
          <span className="brief-k">Top trade</span>
          <span className="grow">{briefing.trade ? <>Your {swap(briefing.trade.give)} for {teamById(briefing.trade.partnerId).manager}'s {swap(briefing.trade.get)}: you <Delta n={briefing.trade.youDelta} />, them <Delta n={briefing.trade.themDelta} /></> : "No trade helps both sides this week."}</span>
          <Icon name="chev" size={16} />
        </button>
        <button className="brief-row" onClick={() => onGo("waivers")}>
          <span className="brief-k">Waiver add</span><span className="grow">{briefing.waiver}</span><Icon name="chev" size={16} />
        </button>
      </section>

      {followUps.map((f) => <FollowUpCard key={f.id} f={f} coach={coach} onTag={onTag} onResolve={onResolve} onOpen={onOpen} onPitch={onPitch} />)}

      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <h2 className="section-title">Today's intel</h2>
        <span className="sample-note">{level === "light" ? "Light: top nudges only" : level === "hands" ? "Hands-on: every nudge" : "Standard nudges"} · <button className="linkish" onClick={() => onGo("settings")}>Change</button></span>
      </div>

      {nudges.length === 0 && <p className="empty-deal">You're caught up. Sources will nudge you when something changes.</p>}

      {visible.map((n) => (
        <article key={n.id} className={`card nudge nudge-${n.kind}${leaving.includes(n.id) ? " leaving" : ""}`}>
          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <div className="row wrap">
              <span className="nudge-kind"><Icon name={KIND[n.kind].icon} size={15} />{KIND[n.kind].label}</span>
              {n.deadline && <span className="deadline"><Icon name="clock" size={12} />{n.deadline}</span>}
            </div>
            <span className="rail-time">{n.time}</span>
          </div>
          <h3>
            
            {n.headline.charAt(0).toUpperCase() + n.headline.slice(1)} {n.emph && <em>{n.emph}</em>}
          </h3>
          <p className="muted small">{n.why}</p>
          {n.impact && (
            <div className="impact">
              {n.impact.map((i) => <div key={i.label} className="impact-row"><span className="brief-k">{i.label}</span><span className="small">{i.text}</span></div>)}
            </div>
          )}
          {n.kind === "offer" && n.offer && <OfferBlock n={n} onOpen={onOpen} onPitch={onPitch} />}
          {n.trades.map((t) => <TradeIdea key={t.key} t={t} onOpen={onOpen} onPitch={onPitch} />)}
          <div className="row wrap nudge-actions">
            {n.kind === "stale" && n.tagId && (
              <>
                <button className="btn btn-sm" onClick={() => onKeepTag(n.tagId!)}>Still true</button>
                <button className="btn btn-sm" onClick={() => onClearTag(n.tagId!)}>Not anymore</button>
              </>
            )}
            {n.go && <button className="btn btn-sm" onClick={() => onGo(n.go!.tab, n.teamId)}>{n.go.label}</button>}
            {n.kind === "need" && n.teamId && <button className="nudge-link" onClick={() => onGo("league", n.teamId)}><span>See {teamById(n.teamId).manager}'s needs</span><Icon name="chev" size={14} /></button>}
            <button className="nudge-link dismiss" onClick={() => leave(n)} aria-label="Not useful, show fewer like this">Not useful</button>
          </div>
        </article>
      ))}
      {nudges.length > 2 && (
        <button className="btn more-intel" onClick={() => setShowAll((x) => !x)} aria-expanded={showAll}>
          {showAll ? "Show less" : `More intel (${nudges.length - 2})`}
        </button>
      )}
      <p className="small muted" style={{ textAlign: "center" }}>Heard something in league chat? <button className="linkish" onClick={onCapture}>Log it on League Needs</button></p>
    </>
  );
}

export function needCopy(pos: Pos) {
  return pos === "TE" ? "a TE" : pos === "QB" ? "a QB" : `${pos === "RB" ? "an RB" : "a WR"}`;
}
