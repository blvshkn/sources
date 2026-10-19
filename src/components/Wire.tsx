import { useContext, useState } from "react";
import { LeagueSwitch } from "./LeagueSwitch";
import { IdeaFeedbackCtx } from "./IdeaFeedback";
import { playerById, teamById, YOU, TEAMS, Pos, ManagerTag, DEADLINES, WEEK, OPPONENT_ID, Player, onBye } from "../data";
import { Trade, TeamNeeds, fmt, offerRead, verdict, lineupFor, eff, weakSlots } from "../engine";
import { AiLabel, Delta, Icon, IconName, Phase, Stamp, useSticky, PageTabs, LiveNum } from "./ui";
import { Avatar } from "./Avatar";
import { TeamAvatar } from "./TeamPicker";
import { useLive, onPace, teamOutlook, winChance } from "../live";
import { RosterNews } from "./News";
import { MatchupStrip, heatOf, HeatMark, FinalPts, markLive } from "./Roster";

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

/** Manager avatar from Sleeper, or initials when they haven't set one. */
function TeamBadge({ t, side }: { t: { name: string; avatar?: string }; side: "you" | "them" }) {
  const [bad, setBad] = useState(false);
  return t.avatar && !bad
    ? <img className={`sb-badge ${side} sb-img`} src={`https://sleepercdn.com/avatars/thumbs/${t.avatar}`} alt="" onError={() => setBad(true)} />
    : <span className={`sb-badge ${side}`}>{initials(t.name)}</span>;
}

/** Apple Sports style scoreboard: you vs this week's opponent, big numerals. */
export function Scoreboard({ you, partner, onPartner, onMatchup, extras = true }: { you: TeamNeeds; partner: string | null; onPartner?: () => void; onMatchup?: () => void; extras?: boolean }) {
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  // Expected finishes from the lineups actually set in Sleeper (K/DEF included); win chance from what's left to play
  const liveNow = useLive();
  const myO = teamOutlook(liveNow, YOU), oppO = opp ? teamOutlook(liveNow, opp) : null;
  const mine = myO.expected;
  const theirs = oppO ? oppO.expected : null;
  const chance = oppO ? Math.round(winChance(myO, oppO)) : null;
  const pt = partner ? TEAMS.find((t) => t.manager === partner || t.name === partner) : undefined;
  const need = you.groups[you.need].diff;
  // Once games start, the big numbers are points scored and the projection drops to a footnote
  const live = useLive();
  const started = Object.values(live.games).some((x) => x === "in_game" || x === "complete");
  const nowLive = Object.values(live.games).some((x) => x === "in_game");
  const myNow = live.teamPts[YOU.id], oppNow = opp ? live.teamPts[opp.id] : undefined;
  const inPlay = started && myNow !== undefined && (!opp || oppNow !== undefined);
  const Row = ({ t, pts, now, side }: { t: typeof YOU; pts: number; now?: number; side: "you" | "them" }) => (
    <span className={`sb2-row ${side}`}>
      <TeamBadge t={t} side={side} />
      <span className="sb2-who"><b>{t.name}</b><small>{side === "you" ? "You" : t.manager} · {t.record}</small></span>
      {inPlay && now !== undefined
        ? <span className="sb2-pts sb2-now"><LiveNum v={now} /><small>proj {pts.toFixed(1)}</small></span>
        : <span className="sb2-pts">{pts.toFixed(1)}</span>}
    </span>
  );
  return (
    <section className="card sb2" aria-label="This week">
      <button className="sb2-rows sb2-open" onClick={onMatchup} disabled={!onMatchup} aria-label={`Open this week's matchup${inPlay ? `. You ${myNow!.toFixed(1)}${oppNow !== undefined ? `, them ${oppNow.toFixed(1)}` : ""}` : ""}${chance !== null ? `. ${chance} percent to win` : ""}`}>
        <span className="sb2-head">
          <span>Week {WEEK} matchup</span>
          {inPlay && nowLive ? <span className="lu-live"><i />Live</span> : <span>{inPlay ? "Scored" : "Projected"}</span>}
        </span>
        <Row t={YOU} pts={mine} now={myNow} side="you" />
        {opp && theirs !== null && <>
          <span className="sb2-div" aria-hidden="true"><span>vs</span></span>
          <Row t={opp} pts={theirs} now={oppNow} side="them" />
        </>}
        {chance !== null && (
          <span className="sb2-chance" aria-hidden="true">
            <span className="sb2-bar"><span style={{ width: `${chance}%` }} /></span>
            <span className="sb2-chance-lbl">
              <span><b>{chance}%</b> to win</span>
              <span>{chance >= 55 ? "Favored" : chance <= 45 ? "Behind" : "Toss-up"}</span>
            </span>
          </span>
        )}
        {opp && <span className="sb2-more">See the full matchup<Icon name="chev" size={14} /></span>}
      </button>
      {extras && <>
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
      </>}
    </section>
  );
}

/** Where your team is thin and who can fix it: power rank, weakest slots, best trade partner. Each row opens the right screen. */
function Improve({ you, partner, partnerId, onGo }: { you: TeamNeeds; partner: string | null; partnerId: string | null; onGo: (t: string, teamId?: string) => void }) {
  const need = you.groups[you.need].diff;
  const pt = partnerId ? teamById(partnerId) : undefined;
  const short = weakSlots().slice(0, 2);
  return (
    <section className="card wk imp" aria-label="Where to improve">
      <div className="wk-head"><h2 className="section-title">Where to improve</h2></div>
      <button className="wk-row" onClick={() => onGo("league")}>
        <span className="imp-k">Power rank</span>
        <span className="wk-name">#{you.rank} of {TEAMS.length}<small>See the standings and every team's values</small></span>
        <Icon name="chev" size={16} />
      </button>
      <button className="wk-row" onClick={() => onGo("roster:slots")}>
        <span className="imp-k">Weakest spot</span>
        <span className="wk-name"><span>{you.need} <em className={need < 0 ? "down" : "up"}>{fmt(need)}</em></span><small>{short.length ? short.map((w) => `${w.slot} short ${w.misses} of ${w.weeks} weeks`).join(" · ") : "Compared with the league's starters"}</small></span>
        <Icon name="chev" size={16} />
      </button>
      {partner && partnerId ? (
        <button className="wk-row" onClick={() => onGo("trade", partnerId)}>
          <span className="imp-k">Trade partner</span>
          <span className="wk-name imp-who">{pt && <TeamAvatar t={pt} size={28} />}<span>{partner}<small>Has what you need at {you.need}. Build a deal</small></span></span>
          <Icon name="chev" size={16} />
        </button>
      ) : <p className="small muted">No clear trade partner yet.</p>}
    </section>
  );
}

/** A player's points in a card row: projection before kickoff, then live and final points colored against it,
 *  with the flame once he's past his projection. */
function WkPts({ p, live }: { p: Player; live: ReturnType<typeof useLive> }) {
  const known = live.points[p.id] !== undefined, g = known ? live.games[p.nfl] ?? null : null, proj = eff(p, true), pts = live.points[p.id] ?? 0;
  if (g === "in_game") {
    markLive(p.id);
    const pace = onPace(pts, proj, live.left?.[p.nfl]), heat = heatOf(pts, proj, pace);
    return <span className={`wk-pts live${heat ? ` heat-${heat}` : ""}`}><b>{heat && <HeatMark heat={heat} />}{pts.toFixed(1)}</b><small className={pace !== null ? `lu-pace ${pace >= proj ? "up" : "down"}` : undefined}>{pace !== null ? pace.toFixed(1) : `proj ${proj.toFixed(1)}`}</small></span>;
  }
  if (g === "complete") return <FinalPts id={p.id} pts={pts} proj={proj} cls="wk-pts" />;
  return <span className="wk-pts muted">{proj.toFixed(1)}</span>;
}

const vsOf = (p: Player) => (!p.opp ? "" : /^(vs|@)\s/.test(p.opp) ? p.opp : `v ${p.opp}`);

/** The opponent's three biggest projections, with live points once their games start. */
export function Threats({ onGo }: { onGo: (t: string) => void }) {
  const live = useLive();
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  if (!opp) return null;
  const threats = (lineupFor(opp.roster, true).slots.map((x) => x.player).filter(Boolean) as Player[]).sort((a, b) => eff(b, true) - eff(a, true)).slice(0, 3);
  if (!threats.length) return null;
  const Pts = ({ p }: { p: Player }) => <WkPts p={p} live={live} />;
  return (
    <section className="card wk" aria-label="Opponent threats">
      <div className="wk-head"><h2 className="section-title">Their threats</h2><span className="tiny muted">{opp.manager}'s top projections</span></div>
      {threats.map((p) => (
        <button key={p.id} className="wk-row" onClick={() => onGo("matchup")}>
          <Avatar p={p} size={40} />
          <span className="wk-name">{p.name}<small><b className={`lu-pos p-${p.pos}`}>{p.pos}</b> · {p.nfl} {vsOf(p)}</small></span>
          <Pts p={p} />
        </button>
      ))}
    </section>
  );
}

/** More for the This week tab: when your starters play, who's banged up, the opponent's threats, and the dates that matter. */
function WeekMore({ onGo }: { onGo: (t: string) => void }) {
  const live = useLive();
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  const mine = lineupFor(YOU.roster, true).slots.map((x) => x.player).filter(Boolean) as Player[];
  const theirs = opp ? (lineupFor(opp.roster, true).slots.map((x) => x.player).filter(Boolean) as Player[]) : [];
  const dayOf = (p: Player) => (onBye(p.nfl) ? "Bye" : p.gameDate ? new Date(`${p.gameDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" }) : "This week");
  const order = ["Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "This week", "Bye"];
  const days = order.map((d) => ({ d, ps: mine.filter((p) => dayOf(p) === d) })).filter((x) => x.ps.length);
  const hurt = (ps: Player[]) => ps.filter((p) => p.status && !onBye(p.nfl));
  const detail = (p: Player) => (p.note ?? "").replace(/^(Questionable|Doubtful|Out|IR|PUP|Sus|NA|DNR|COV)\b,?\s*/i, "") || (p.status === "O" ? "Out" : "Game-time decision");
  const injured = [...hurt(YOU.roster.map(playerById)).map((p) => ({ p, you: true })), ...hurt(theirs).map((p) => ({ p, you: false }))];
  const dates = [DEADLINES.lock, DEADLINES.waivers, DEADLINES.trade].filter(Boolean);
  const Pts = ({ p }: { p: Player }) => <WkPts p={p} live={live} />;
  return (
    <>
      <section className="card wk" aria-label="When your starters play">
        <div className="wk-head"><h2 className="section-title">Game day</h2><span className="tiny muted">Your starters</span></div>
        {days.map(({ d, ps }) => (
          <div key={d} className="wk-day">
            <span className="wk-day-k">{d}<small>{ps.length}</small></span>
            {ps.map((p) => (
              <button key={p.id} className="wk-row" onClick={() => onGo("roster")}>
                <Avatar p={p} size={40} />
                <span className="wk-name">{p.name}<small><b className={`lu-pos p-${p.pos}`}>{p.pos}</b> · {p.nfl} {vsOf(p)}</small></span>
                <Pts p={p} />
              </button>
            ))}
          </div>
        ))}
      </section>

      <section className="card wk" aria-label="Injury watch">
        <div className="wk-head"><h2 className="section-title">Injury watch</h2><span className="tiny muted">You and {opp?.manager ?? "your opponent"}</span></div>
        {injured.length === 0 ? <p className="small muted">Nobody in this matchup carries an injury tag.</p> : injured.map(({ p, you }) => (
          <button key={p.id} className="wk-row" onClick={() => onGo(you ? "roster" : "matchup")}>
            <Avatar p={p} size={40} />
            <span className="wk-name"><span className="wk-nm">{p.name}<span className={`wk-tag s-${p.status}`}>{p.status}</span></span><small>{detail(p)}</small></span>
            <span className={`wk-who${you ? " you" : ""}`}>{you ? "You" : "Them"}</span>
          </button>
        ))}
      </section>


      {dates.length > 0 && <section className="card wk" aria-label="Key dates">
        <div className="wk-head"><h2 className="section-title">Key dates</h2></div>
        {dates.map((d) => <div key={d} className="wk-date"><Icon name="clock" size={16} /><span>{d}</span></div>)}
      </section>}
    </>
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
  const [view, setView] = useSticky<"matchup" | "week" | "intel">("wire.view", "matchup", ["matchup", "week", "intel"]);
  const visible = showAll ? nudges : nudges.slice(0, 2);
  const leave = (n: Nudge) => {
    setLeaving((c) => [...c, n.id]);
    window.setTimeout(() => { onDismiss(n); setLeaving((c) => c.filter((x) => x !== n.id)); }, 200);
  };
  return (
    <>
      <header className="page-head">
        <div>
          <LeagueSwitch title="The Wire" meta={<>{DEADLINES.lock}</>} />
        </div>
      </header>

      <PageTabs value={view} onChange={setView} options={[{ v: "matchup", label: "Overview", icon: "app" }, { v: "week", label: "This week", icon: "clock" }, { v: "intel", label: nudges.length + followUps.length ? `Intel (${nudges.length + followUps.length})` : "Intel", icon: "spark" }]} />

      {view === "matchup" && <Scoreboard you={you} partner={partner} extras={false} onMatchup={() => onGo("matchup")} />}

      {view === "matchup" && <section className="card briefing" aria-label="Weekly briefing">
        <div className="row wrap" style={{ justifyContent: "space-between" }}>
          <div className="row"><h2 className="section-title">Quick moves</h2><Phase v="v1" /></div>
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
      </section>}
      {view === "matchup" && <Improve you={you} partner={partner} partnerId={partnerId} onGo={onGo} />}
      {view === "matchup" && <Threats onGo={onGo} />}
      {view === "week" && <div className="wk-strip"><MatchupStrip onOpen={() => onGo("matchup")} /></div>}
      {view === "week" && <WeekMore onGo={onGo} />}

      {view === "intel" && <>
      <RosterNews />
      {followUps.map((f) => <FollowUpCard key={f.id} f={f} coach={coach} onTag={onTag} onResolve={onResolve} onOpen={onOpen} onPitch={onPitch} />)}

      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <h2 className="section-title">Today's intel</h2>
        <span className="sample-note">{level === "light" ? "Light: top nudges only" : level === "hands" ? "Hands-on: every nudge" : "Standard nudges"} · <button className="linkish" onClick={() => onGo("settings:nudges")}>Change</button></span>
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
      </>}
    </>
  );
}

export function needCopy(pos: Pos) {
  return pos === "TE" ? "a TE" : pos === "QB" ? "a QB" : `${pos === "RB" ? "an RB" : "a WR"}`;
}
