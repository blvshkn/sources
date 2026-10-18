import { useState } from "react";
import { playerById, teamById, YOU, TEAMS, Pos, ManagerTag, DEADLINES, UPDATED, WEEK, OPPONENT_ID } from "../data";
import { Trade, TeamNeeds, fmt, offerRead, verdict, lineupFor , specialLineup } from "../engine";
import { AiLabel, Delta, Icon, IconName, Phase, PosBadge, Stamp } from "./ui";
import { Jersey } from "./Jersey";

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

export function TradeIdea({ t, onOpen, onPitch }: { t: Trade; onOpen: (t: Trade) => void; onPitch: (t: Trade) => void }) {
  return (
    <div className="idea">
      <div className="grow" style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div className="idea-swap">
          <span>Your {swap(t.give)}</span>
          <span className="arrow">for</span>
          <span>their {swap(t.get)}</span>
        </div>
        <div className="idea-nums">
          <span>They gain <Delta n={t.themDelta} />/wk</span>
          <span>You gain <Delta n={t.youDelta} />/wk</span>
        </div>
      </div>
      <div className="row">
        <button className="btn btn-sm" onClick={() => onOpen(t)}>Open in builder</button>
        <button className="btn btn-sm btn-primary" onClick={() => onPitch(t)}>Write pitch</button>
      </div>
    </div>
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

/** Apple Sports style scoreboard: you vs this week's opponent, big numerals. */
export function Scoreboard({ you, partner }: { you: TeamNeeds; partner: string | null }) {
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  const mine = lineupFor(YOU.roster, true).total + specialLineup(YOU).total;
  const theirs = opp ? lineupFor(opp.roster, true).total + specialLineup(opp).total : null;
  const chance = theirs !== null ? Math.round(phi((mine - theirs) / 34) * 100) : null;
  return (
    <section className="card scoreboard" aria-label="This week">
      <div className="sb-top">
        <div className="sb-team"><span className="sb-badge you">{initials(YOU.name)}</span><span className="sb-name">{YOU.name}</span><span className="sb-rec">{YOU.record}</span></div>
        <div className="sb-mid">
          <span>Week {WEEK} projected</span>
          <span className="numeral-row"><span className="numeral">{mine.toFixed(1)}</span>{theirs !== null && <><span className="vs">vs</span><span className="numeral">{theirs.toFixed(1)}</span></>}</span>
        </div>
        {opp ? (
          <div className="sb-team"><span className="sb-badge them">{initials(opp.name)}</span><span className="sb-name">{opp.name}</span><span className="sb-rec">{opp.record}</span></div>
        ) : (
          <div className="sb-team"><span className="sb-badge them">#{you.rank}</span><span className="sb-name">Power rank</span><span className="sb-rec">of {TEAMS.length}</span></div>
        )}
      </div>
      {chance !== null && (
        <div className="sb-chance" aria-label={`Win chance from projections: ${chance} percent`}>
          <div className="sb-chance-bar"><span style={{ flex: chance }} /><span style={{ flex: 100 - chance }} /></div>
          <div className="sb-chance-lbl"><span>{chance}% win chance</span><span>{100 - chance}%</span></div>
        </div>
      )}
      <div className="sb-stats">
        <div className="sb-stat"><b>#{you.rank}</b><span>Power rank of {TEAMS.length}</span></div>
        <div className="sb-stat"><b><PosBadge pos={you.need} /><span className={you.groups[you.need].diff < 0 ? "delta down" : "delta up"}>{fmt(you.groups[you.need].diff)}</span></b><span>Thinnest spot</span></div>
        <div className="sb-stat"><b>{partner ?? "None yet"}</b><span>Best trade partner</span></div>
      </div>
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
        <div><span className="eyebrow">You send</span><ul>{o.give.map((id) => <li key={id}><Jersey p={playerById(id)} size={26} /><span>{playerById(id).name}</span></li>)}</ul></div>
        <div><span className="eyebrow">You get</span><ul>{o.get.map((id) => <li key={id}><Jersey p={playerById(id)} size={26} /><span>{playerById(id).name}</span></li>)}</ul></div>
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

export function Wire({ you, partner, nudges, followUps, briefing, coach, onOpen, onPitch, onGo, onDismiss, onTag, onResolve, onKeepTag, onClearTag, onCapture, level }: {
  you: TeamNeeds;
  partner: string | null;
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
          <div className="eyebrow">Week {WEEK} · {DEADLINES.lock}</div>
          <h1 className="page-title">The Wire</h1>
          <p className="page-sub">What your league needs and the deals worth sending today.</p>
        </div>
      </header>

      <Scoreboard you={you} partner={partner} />

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
            {["need", "news", "waiver", "lineup", "slot"].includes(n.kind) && <span className="ps">Per sources, </span>}
            {n.headline} {n.emph && <em>{n.emph}</em>}
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
            {n.kind === "need" && n.teamId && <button className="btn btn-sm btn-ghost" onClick={() => onGo("league", n.teamId)}>See {teamById(n.teamId).name}'s needs</button>}
            <button className="btn btn-sm btn-ghost dismiss" onClick={() => leave(n)} aria-label="Not useful, show fewer like this">Not useful</button>
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
