import { useState } from "react";
import { playerById, teamById, YOU, Pos, ManagerTag, DEADLINES, UPDATED, WEEK } from "../data";
import { Trade, TeamNeeds, fmt, offerRead, verdict } from "../engine";
import { AiLabel, Delta, Icon, Phase, PosBadge, Stamp } from "./ui";
import { TagCapture } from "./TagCapture";

export type NudgeKind = "need" | "offer" | "news" | "stale" | "lineup" | "waiver" | "slot";
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
        <button className="btn btn-sm btn-primary" onClick={() => onPitch(t)}>Prep pitch</button>
      </div>
    </div>
  );
}

const STAMP: Record<NudgeKind, string> = {
  need: "Per sources", offer: "Offer received", news: "News break", stale: "Still true?", lineup: "Lineup day", waiver: "Waivers", slot: "Pattern",
};

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
          <button className="chip-btn good" onClick={() => onResolve(f.id, `Nice. Logged the deal with ${them.manager}.`)}>He's in</button>
          <button className="chip-btn" onClick={() => setNo(true)}>He said no</button>
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
          <button className="chip-btn ghost" onClick={() => onResolve(f.id, "Okay. Sources will check back tomorrow.")}>No reply yet</button>
        </div>
      ) : (
        <div className="coach">
          <div className="row"><Stamp>Counteroffer coach</Stamp><Phase v="v1" /></div>
          {c ? (
            <>
              <p className="small"><b>{c.line}.</b> {verdict(c.trade).line}</p>
              <TradeIdea t={c.trade} onOpen={onOpen} onPitch={onPitch} />
              <AiLabel />
            </>
          ) : <p className="small muted">No single tweak makes this work for both of you while respecting {them.manager}'s tags. Try another partner.</p>}
          <div className="row"><button className="btn btn-sm btn-ghost" onClick={() => onResolve(f.id, "Closed out the follow-up.")}>Done</button></div>
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
        <div><span className="eyebrow">You send</span><ul>{o.give.map((id) => <li key={id}><PosBadge pos={playerById(id).pos} /><span>{playerById(id).name}</span></li>)}</ul></div>
        <div><span className="eyebrow">You get</span><ul>{o.get.map((id) => <li key={id}><PosBadge pos={playerById(id).pos} /><span>{playerById(id).name}</span></li>)}</ul></div>
      </div>
      <div className={`verdict ${read.tone}`}><b>{read.label}</b><span className="small">{read.line} {teamById(o.partnerId).manager} gains {fmt(o.themDelta)}.</span></div>
      {n.counter && (
        <div className="coach">
          <p className="small"><b>Ready counter:</b> {n.counter.line}. You {fmt(n.counter.trade.youDelta)}, {teamById(o.partnerId).manager} {fmt(n.counter.trade.themDelta)} a week.</p>
          <div className="row wrap">
            <button className="btn btn-sm" onClick={() => onOpen(n.counter!.trade)}>Open counter in builder</button>
            <button className="btn btn-sm btn-primary" onClick={() => onPitch(n.counter!.trade)}>Send counter</button>
          </div>
        </div>
      )}
      <AiLabel onData={() => onOpen(o)} dataLabel="Open the offer" />
    </>
  );
}

export function Wire({ you, nudges, followUps, briefing, coach, onOpen, onPitch, onGo, onDismiss, onTag, onResolve, onKeepTag, onClearTag, level }: {
  you: TeamNeeds;
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
  level: string;
}) {
  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Week {WEEK} · {DEADLINES.lock}</div>
          <h1 className="page-title">The Wire</h1>
          <p className="page-sub">What your league needs, who can help, and the deals worth sending today.</p>
        </div>
      </header>

      <section className="card snapshot" aria-label="Your team at a glance">
        <div className="snap"><span>{YOU.name}</span><b className="num">{YOU.record}</b><span>Record</span></div>
        <div className="snap"><span>Starters this week</span><b className="num">{you.lineup.total.toFixed(1)}</b><span>Projected points</span></div>
        <div className="snap"><span>League power rank</span><b className="num">#{you.rank}</b><span>of 10 by starting lineup</span></div>
        <div className="snap"><span>Thinnest spot</span><b><PosBadge pos={you.need} /></b><span>{fmt(you.groups[you.need].diff)} vs league avg</span></div>
      </section>

      <section className="card briefing" aria-label="Weekly briefing">
        <div className="row wrap" style={{ justifyContent: "space-between" }}>
          <div className="row"><h2 className="section-title">Weekly briefing</h2><Phase v="v1" /></div>
          <span className="tiny muted">{UPDATED}</span>
        </div>
        <button className="brief-row" onClick={() => onGo("roster")}>
          <span className="brief-k">Lineup fix</span><span className="grow">{briefing.lineup}</span><Icon name="chev" size={16} />
        </button>
        <button className="brief-row" onClick={() => briefing.trade ? onOpen(briefing.trade) : onGo("trade")}>
          <span className="brief-k">Top trade</span>
          <span className="grow">{briefing.trade ? <>Your {swap(briefing.trade.give)} for {teamById(briefing.trade.partnerId).manager}'s {swap(briefing.trade.get)}: you <Delta n={briefing.trade.youDelta} />, them <Delta n={briefing.trade.themDelta} /></> : "No clean win-win this week."}</span>
          <Icon name="chev" size={16} />
        </button>
        <button className="brief-row" onClick={() => onGo("waivers")}>
          <span className="brief-k">Waiver add</span><span className="grow">{briefing.waiver}</span><Icon name="chev" size={16} />
        </button>
      </section>

      {followUps.map((f) => <FollowUpCard key={f.id} f={f} coach={coach} onTag={onTag} onResolve={onResolve} onOpen={onOpen} onPitch={onPitch} />)}

      <section className="card card-pad capture-card">
        <div className="row wrap" style={{ justifyContent: "space-between" }}>
          <h2 className="section-title">Heard something in league chat?</h2>
          <span className="tiny muted">Type or dictate. Tags stay private.</span>
        </div>
        <TagCapture onSave={onTag} />
      </section>

      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <h2 className="section-title">Today's intel</h2>
        <span className="sample-note">{level === "light" ? "Light: top nudges only" : level === "hands" ? "Hands-on: every nudge" : "Standard nudges"} · <button className="linkish" onClick={() => onGo("settings")}>Change</button></span>
      </div>

      {nudges.length === 0 && <p className="empty-deal">You're caught up. Sources will nudge you when something changes.</p>}

      {nudges.map((n) => (
        <article key={n.id} className={`card nudge nudge-${n.kind}`}>
          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <div className="row wrap">
              <Stamp>{STAMP[n.kind]}</Stamp>
              {n.deadline && <span className="deadline"><Icon name="clock" size={12} />{n.deadline}</span>}
            </div>
            <span className="rail-time">{n.time}</span>
          </div>
          <h3>
            {["need", "news", "waiver", "lineup", "slot"].includes(n.kind) ? "Per sources, " : ""}
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
            <button className="btn btn-sm btn-ghost dismiss" onClick={() => onDismiss(n)} aria-label="Not useful, show fewer like this">Not useful</button>
          </div>
        </article>
      ))}
    </>
  );
}

export function needCopy(pos: Pos) {
  return pos === "TE" ? "a TE" : pos === "QB" ? "a QB" : `${pos === "RB" ? "an RB" : "a WR"}`;
}
