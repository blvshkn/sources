import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { denyOn } from "../deny";
import type { ReactNode } from "react";
import { useLoadedIn } from "../loadedIn";
import { LeagueSwitch } from "./LeagueSwitch";
import { playerById, teamById, YOU, TEAMS, ManagerTag, DEADLINES, WEEK, OPPONENT_ID, Player, PLAYERS, onBye } from "../data";
import { Trade, TeamNeeds, fmt, offerRead, verdict, eff, weakSlots } from "../engine";
import { Arrived } from "./Arrived";
import { AiLabel, Delta, Icon, IconName, Phase, Stamp, useSticky, PageTabs } from "./ui";
import { Avatar } from "./Avatar";
import { PlayerSheet } from "./lazy";
import { TeamAvatar } from "./TeamPicker";
import { NumTip, Tooltip } from "./Tooltip";
import { Trophy } from "./Trophy";
import { useLive, onPace, startersOf } from "../live";
import { WeekPlayer } from "../weeks";
import { useLineupWeek, useWeekMatch } from "../weekMatch";
import { gameInAt, lockLine, oppAt, useKickoffs } from "../kickoff";
import { RosterNews } from "./News";
import { MatchupSheet } from "./MatchupSheet";
import { heatOf, HeatMark, FinalPts, markLive, injuryDetail, injuryTag, PROJ_TIP, soFarTip, paceTip } from "./Roster";
import { SentLine, dealStatus } from "./SentOffers";
import { useNewSince } from "../newSince";
import type { SentDeal, SentOffer } from "../sentOffers";
import { TradeIdea } from "./TradeIdea";
import { Scoreboard } from "./Scoreboard";
// The two cards the landing shows live in their own modules; Overview's importers still find them here
export { TradeIdea, Scoreboard };
export { needCopy } from "../needCopy";

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
  /** The player this nudge suggests adding, so "Not right now" can skip him this week. */
  pass?: { id: string; name: string };
}

export interface FollowUp { id: string; trade: Trade; via: string; when: string }
export interface Briefing { /** Null once the week is final: no lineup advice then. */ lineup: string | null; trade: Trade | null; waiver: string; /** Who the waiver line suggests, for its Not interested control. */ waiverPass?: { id: string; name: string };
  /** What a covered row says instead of a move (lineup already optimal, no two-way trade, nobody on the wire), so the
   *  card stays useful and points somewhere (Zach: Quick moves felt naked with one row) */
  ok?: { lineup?: string; trade?: string; waiver?: string };
  /** A question to start Ask with */
  ask?: string }

const swap = (ids: string[]) => ids.map((id) => playerById(id).name).join(" + ");

const KIND: Record<NudgeKind, { label: string; icon: IconName }> = {
  ir: { label: "Injured reserve", icon: "alert" },
  need: { label: "Trade idea", icon: "trade" }, offer: { label: "Offer received", icon: "send" }, news: { label: "News", icon: "alert" },
  stale: { label: "Check in", icon: "clock" }, lineup: { label: "Lineup", icon: "roster" }, waiver: { label: "Waivers", icon: "waivers" }, slot: { label: "Pattern", icon: "spark" },
};

/** Where your team is thin and who can fix it: power rank, weakest slots, best trade partner. Each row opens the right screen. */
function Improve({ you, partner, partnerId, onGo }: { you: TeamNeeds; partner: string | null; partnerId: string | null; onGo: (t: string, teamId?: string) => void }) {
  const need = you.groups[you.need].diff;
  const pt = partnerId ? teamById(partnerId) : undefined;
  const short = weakSlots().slice(0, 2);
  return (
    <section className="card wk imp" aria-label="Where to improve">
      <div className="wk-head"><h2 className="section-title">Where to improve</h2></div>
      <button className="wk-row" onClick={() => onGo("league")}>
        <span className="imp-k"><Tooltip content="Starting lineup strength against the other teams. 1 is strongest."><span>Power rank</span></Tooltip></span>
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
          <span className="wk-name imp-who"><span className="imp-nm">{pt && <TeamAvatar t={pt} size={22} />}<span>{partner}</span>{pt && <Trophy teamId={pt.id} />}</span><small>Has what you need at {you.need}. Build a deal</small></span>
          <Icon name="chev" size={16} />
        </button>
      ) : <p className="small muted">No clear trade partner yet.</p>}
    </section>
  );
}

/** A player's points in a card row: projection before kickoff, then live and final points colored against it,
 *  with the flame once he's past his projection. */
function WkPts({ p, live, them = false }: { p: Player; live: ReturnType<typeof useLive>; them?: boolean }) {
  const known = live.points[p.id] !== undefined, g = known ? live.games[p.nfl] ?? null : null, proj = eff(p, true), pts = live.points[p.id] ?? 0;
  if (g === "in_game") {
    markLive(p.id);
    const pace = onPace(pts, proj, live.left?.[p.nfl]), heat = heatOf(pts, proj, pace);
    return <span className={`wk-pts live${heat ? ` heat-${heat}` : ""}`}><b data-pts={pts.toFixed(1)}>{heat && <HeatMark heat={heat} />}<NumTip {...soFarTip(proj)}><span>{pts.toFixed(1)}</span></NumTip></b>{pace !== null
      ? <NumTip {...paceTip(pace)}><small className={`lu-pace ${(pace >= proj) !== them ? "up" : "down"}`}>pace {pace.toFixed(1)}</small></NumTip>
      : <small>proj {proj.toFixed(1)}</small>}</span>;
  }
  if (g === "complete") return <FinalPts id={p.id} pts={pts} proj={proj} cls="wk-pts" />;
  // Not started: the number is his projection, labelled like the live (pace) and final (proj) rows, so every row reads the same
  return <span className="wk-pts muted"><NumTip {...PROJ_TIP}><b>{proj.toFixed(1)}</b></NumTip><small>proj</small></span>;
}

const vsOf = (p: Player) => (!p.opp ? "" : /^(vs|@)\s/.test(p.opp) ? p.opp : `v ${p.opp}`);

/** Injury pill after a threat's name, the same one the lineup shows. Only for players with a status. */
const InjTag = ({ id }: { id: string }) => {
  const p = PLAYERS[id];
  if (!p?.status) return null;
  return <b className={`lu-tag ${p.status === "Q" ? "warn" : "bad"}`}>{injuryTag(p)}</b>;
};

/** Three threat rows, a skeleton, or a message over three hidden rows, so the card is one height in every state. */
function ThreatBody({ rows, msg }: { rows: ReactNode[] | null; msg?: { title: string; body: string } }) {
  const ghost = (i: number) => (
    <span key={`g${i}`} className="wk-row thr-ghost" aria-hidden="true">
      <span className="thr-av" /><span className="wk-name"><span className="thr-n"><span className="thr-bar" />{"\u00a0"}</span><small><span className="thr-bar short" />{"\u00a0"}</small></span><span className="wk-pts"><span className="thr-bar num" /></span>
    </span>
  );
  // Rows (or the message) that land after the ghosts were on screen fade in over them; a cached week is just there
  const fadeIn = useLoadedIn(!rows && !msg);
  return (
    <div className={`thr-body${msg ? " has-msg" : ""}${!rows && !msg ? " is-skel" : ""}${fadeIn ? " thr-in" : ""}`} aria-busy={!rows && !msg}>
      {[0, 1, 2].map((i) => (rows && rows[i]) ? <Fragment key={i}>{rows[i]}</Fragment> : ghost(i))}
      {msg && <div className="thr-msg" role="status"><b>{msg.title}</b><span>{msg.body}</span></div>}
    </div>
  );
}

/** The opponent's three biggest projections, with live points once their games start. On the Lineup page it follows
 *  the week stepper: past weeks show who hurt you most, future weeks that week's opponent and projections. */
export function Threats(_props: { onGo?: (t: string) => void }) {
  const live = useLive();
  const week = useLineupWeek();
  useKickoffs(week);
  // Tapping a threat opens that player, with the reason he made the list, instead of leaving the page
  const [open, setOpen] = useState<{ p: Player; rank: number } | null>(null);
  const [mu, setMu] = useState(false);
  if (week !== WEEK) return <WeekThreats week={week} />;
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  const go = () => setMu(true);
  const threats = opp ? startersOf(opp).map(playerById).sort((a, b) => eff(b, true) - eff(a, true)).slice(0, 3) : [];
  return (
    <section className="card wk thr" aria-label="Opponent threats">
      <div className="wk-head"><h2 className="section-title">Their threats</h2><span className="tiny muted thr-sub">{opp ? `${opp.manager}'s top projections` : `Week ${WEEK}`}</span></div>
      <ThreatBody msg={opp ? undefined : { title: "Bye week", body: `You don't play anyone in Week ${WEEK}.` }} rows={threats.map((p) => (
        <button key={p.id} className="wk-row" onClick={() => setOpen({ p, rank: threats.indexOf(p) })}>
          <Avatar p={p} size={40} />
          <span className="wk-name"><span className="thr-n">{p.name}<InjTag id={p.id} /></span><small><b className={`lu-pos p-${p.pos}`}>{p.pos}</b> · {p.nfl} {onBye(p.nfl) ? "Bye" : oppAt(p.nfl, vsOf(p))}</small></span>
          <WkPts p={p} live={live} them />
        </button>
      ))} />
      {open && opp && <PlayerSheet p={open.p} where={`${opp.manager}'s ${open.p.pos}`} note={threatNote(open.p, open.rank, opp.manager)} onClose={() => setOpen(null)} />}
      {mu && <MatchupSheet week={WEEK} onClose={() => setMu(false)} />}
      <button type="button" className="wk-more" onClick={opp ? go : denyOn(`You're on bye in Week ${WEEK}, so there's no matchup to open.`)} aria-disabled={!opp || undefined}><span>See the full matchup</span><Icon name="chev" size={14} /></button>
    </section>
  );
}

/** Their threats for a week other than this one: that week's opponent, ranked by that week's projection (Sleeper's,
 *  the same numbers as your starters) or, for a week already played, by what they scored. */
function WeekThreats({ week }: { week: number }) {
  const { m, err } = useWeekMatch(week);
  useKickoffs(week);
  const [open, setOpen] = useState<Player | null>(null);
  const [mu, setMu] = useState(false);
  const past = week < WEEK, opp = m?.opp ?? null;
  const top = opp ? (opp.starters.map((x) => x.p).filter((p) => p && p.pts !== null) as WeekPlayer[]).sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0)).slice(0, 3) : [];
  const go = () => setMu(true);
  const sub = opp ? `${opp.team.manager}'s ${past ? "top scorers" : "top projections"}` : `Week ${week}`;
  const msg = err ? { title: "Couldn't load", body: err } : m && !opp ? m.empty : undefined;
  return (
    <section className="card wk thr" aria-label={`Opponent threats, Week ${week}`}>
      <div className="wk-head"><h2 className="section-title">Their threats</h2><span className="tiny muted thr-sub">{sub}</span></div>
      <ThreatBody msg={msg} rows={m ? top.map((p) => {
        const game = gameInAt(p, week), full = PLAYERS[p.id];
        const inner = <>
          <Avatar p={p} size={40} text={p.pos === "DEF" ? p.nfl : undefined} />
          <span className="wk-name"><span className="thr-n">{p.name}{!past && <InjTag id={p.id} />}</span><small><b className={`lu-pos p-${p.pos}`}>{p.pos}</b> · {p.nfl} {game ?? "Bye"}</small></span>
          <span className={`wk-pts${past ? "" : " muted"}`}>{(p.pts ?? 0).toFixed(1)}</span>
        </>;
        return full ? <button key={p.id} className="wk-row" onClick={() => setOpen(full)}>{inner}</button> : <span key={p.id} className="wk-row">{inner}</span>;
      }) : null} />
      {open && opp && <PlayerSheet p={open} where={`${opp.team.manager}'s ${open.pos}, Week ${week}`} onClose={() => setOpen(null)} />}
      {mu && <MatchupSheet week={week} onClose={() => setMu(false)} />}
      <button type="button" className="wk-more" onClick={opp ? go : denyOn(m ? `You're on bye in Week ${week}, so there's no matchup to open.` : `Week ${week} is still loading. Try again in a moment.`)} aria-disabled={!opp || undefined}><span>See the full matchup</span><Icon name="chev" size={14} /></button>
    </section>
  );
}

/** One or two sentences on why a player is on the threats list: where he ranks in their lineup and how he compares to yours. */
function threatNote(p: Player, rank: number, manager: string) {
  const proj = eff(p, true);
  const place = ["the most", "the second most", "the third most"][rank] ?? "among the most";
  const mine = startersOf(YOU).map(playerById).filter((x) => x.pos === p.pos).sort((a, b) => eff(b, true) - eff(a, true))[0];
  const vs = vsOf(p);
  const first = `He projects ${proj.toFixed(1)} this week, ${place} in ${manager}'s lineup${vs ? `, playing ${vs.replace(/^v /, "vs ")}` : ""}.`;
  if (!mine) return first;
  const gap = proj - eff(mine, true);
  const second = Math.abs(gap) < 0.5 ? `That's about even with your ${p.pos}, ${mine.name}.` : gap > 0 ? `That's ${gap.toFixed(1)} more than your ${p.pos}, ${mine.name}.` : `Your ${p.pos}, ${mine.name}, still projects ${(-gap).toFixed(1)} more.`;
  return `${first} ${second}`;
}

/** Command center's game week: when your starters play on the left, and the opponent's threats, who's banged up and
 *  the dates that matter on the right. On a phone it's one column, threats first. */
function WeekMore({ threats, onGo }: { threats: ReactNode; onGo: (t: string) => void }) {
  const live = useLive();
  useKickoffs();
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  // The lineups set in Sleeper (best projected only when Sleeper has none)
  const mine = startersOf(YOU).map(playerById);
  const theirs = opp ? startersOf(opp).map(playerById) : [];
  const dayOf = (p: Player) => (onBye(p.nfl) ? "Bye" : p.gameDate ? new Date(`${p.gameDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" }) : "This week");
  const order = ["Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "This week", "Bye"];
  const days = order.map((d) => ({ d, ps: mine.filter((p) => dayOf(p) === d) })).filter((x) => x.ps.length);
  const hurt = (ps: Player[]) => ps.filter((p) => p.status && !onBye(p.nfl));
  const detail = injuryDetail;
  const injured = [...hurt(YOU.roster.map(playerById)).map((p) => ({ p, you: true })), ...hurt(theirs).map((p) => ({ p, you: false }))];
  const dates = [lockLine(), DEADLINES.waivers, DEADLINES.trade].filter(Boolean);
  // Key dates goes under whichever column is shorter (Zach, Oct 22), so the two sides end close to even instead of
  // leaving an empty block under Game day. One column (phones): it stays last.
  const colsRef = useRef<HTMLDivElement>(null);
  const [datesLeft, setDatesLeft] = useState(false);
  useLayoutEffect(() => {
    const cols = colsRef.current; if (!cols) return;
    const place = () => {
      const main = cols.querySelector<HTMLElement>(".cc-main"), side = cols.querySelector<HTMLElement>(".cc-side");
      const kd = cols.querySelector<HTMLElement>(".cc-dates");
      if (!main || !side || !kd || getComputedStyle(cols).display !== "grid") { setDatesLeft(false); return; }
      const gap = parseFloat(getComputedStyle(main).rowGap) || 0, k = kd.offsetHeight + gap;
      const inLeft = main.contains(kd);
      const mainH = main.offsetHeight - (inLeft ? k : 0), sideH = side.offsetHeight - (inLeft ? 0 : k);
      setDatesLeft(mainH < sideH);
    };
    place();
    const ro = new ResizeObserver(place); ro.observe(cols);
    cols.querySelectorAll(".cc-col").forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, []);
  const keyDates = dates.length > 0 && <section className="card wk cc-dates" aria-label="Key dates">
        <div className="wk-head"><h2 className="section-title">Key dates</h2></div>
        {dates.map((d) => <div key={d} className="wk-date"><Icon name="clock" size={16} /><span>{d}</span></div>)}
      </section>;
  return (
    <div className="cc-cols" ref={colsRef}>
      <div className="cc-col cc-main">
      <section className="card wk cc-days" aria-label="When your starters play">
        <div className="wk-head"><h2 className="section-title">Game day</h2><span className="tiny muted">Your starters</span></div>
        {days.map(({ d, ps }) => (
          <div key={d} className="wk-day">
            <span className="wk-day-k">{d}<small>{ps.length}</small></span>
            {ps.map((p) => (
              <button key={p.id} className="wk-row" onClick={() => onGo("roster")}>
                <Avatar p={p} size={40} />
                <span className="wk-name">{p.name}<small><b className={`lu-pos p-${p.pos}`}>{p.pos}</b> · {p.nfl} {oppAt(p.nfl, vsOf(p))}</small></span>
                <WkPts p={p} live={live} />
              </button>
            ))}
          </div>
        ))}
      </section>
      {datesLeft && keyDates}
      </div>

      <div className="cc-col cc-side">
      {threats}
      <section className="card wk" aria-label="Injury watch">
        <div className="wk-head"><h2 className="section-title">Injury watch</h2><span className="tiny muted">You and {opp?.manager ?? "your opponent"}</span></div>
        {injured.length === 0 ? <p className="small muted">Nobody in this matchup carries an injury tag.</p> : injured.map(({ p, you }) => (
          <button key={p.id} className="wk-row" onClick={() => onGo(you ? "roster" : "matchup")}>
            <Avatar p={p} size={40} />
            <span className="wk-name"><span className="wk-nm">{p.name}<span className={`wk-tag s-${p.status}`}>{injuryTag(p)}</span></span><small>{detail(p)}</small></span>
            <span className={`wk-who${you ? " you" : ""}`}>{you ? "You" : "Them"}</span>
          </button>
        ))}
      </section>

      {!datesLeft && keyDates}
      </div>
    </div>
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
          <button className="chip-btn ghost" onClick={() => onResolve(f.id, "Got it. Source will ask again tomorrow.")}>No reply yet</button>
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
      <div className={`verdict ${read.tone}`}><b>{read.label}</b><span className="small">{teamById(o.partnerId).manager} gains {fmt(o.themDelta)}.</span></div>
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

export function Wire({ you, partner, partnerId, nudges, followUps, briefing, coach, onOpen, onPitch, onGo, onDismiss, onTag, onResolve, onKeepTag, onClearTag, onCapture, level, onSnooze, sent, onOpenSent, onAsk }: {
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
  /** "Not right now" on a suggested player (the briefing's waiver add, a waiver nudge): skip him this week only */
  onSnooze?: (p: { id: string; name: string }) => void;
  /** Your newest offer still out (or just accepted), as one line in Quick moves that opens it */
  sent?: SentDeal | null; onOpenSent?: (o: SentOffer) => void;
  /** Opens Ask with this question already asked */
  onAsk?: (q: string) => void;
}) {
  useKickoffs();
  const [leaving, setLeaving] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  // Two tabs: Command center (key "matchup", kept so saved state still lands there) and Intel. The old This week tab
  // ("week") folded into Command center; a saved "week" isn't allowed any more, so it falls back to Command center.
  const [view, setView] = useSticky<"matchup" | "intel">("wire.view", "matchup", ["matchup", "intel"]);
  // "See the full matchup" on the face-off opens it over Overview (sheet or modal) instead of leaving the page
  const [matchupOpen, setMatchupOpen] = useState(false);
  const visible = showAll ? nudges : nudges.slice(0, 2);
  // New since you looked: a new top trade idea, or your offer going through, slides in and keeps a dot until opened
  const t = briefing.trade;
  const newTrade = useNewSince("radar-trade", t ? `${t.partnerId}:${t.give.join()}>${t.get.join()}` : null);
  const newSent = useNewSince("radar-sent", sent && dealStatus(sent) === "accepted" ? sent.head.deal : null);
  const leave = (n: Nudge) => {
    setLeaving((c) => [...c, n.id]);
    window.setTimeout(() => { onDismiss(n); setLeaving((c) => c.filter((x) => x !== n.id)); }, 200);
  };
  return (
    <>
      <header className="page-head">
        <div>
          <LeagueSwitch title="Overview" meta={<>{lockLine()}</>} />
        </div>
      </header>

      <PageTabs value={view} onChange={setView} options={[{ v: "matchup", label: "Command center", icon: "headset" }, { v: "intel", label: "Intel", icon: "hatGlasses" }]} />

      {view === "matchup" && <Scoreboard you={you} partner={partner} extras={false} onMatchup={() => setMatchupOpen(true)} />}
      {matchupOpen && <MatchupSheet onClose={() => setMatchupOpen(false)} />}

      {/* Command center: the face-off, then your moves (Quick moves and Where to improve), then the game week:
          their threats, when your starters play, injuries and key dates. The face-off is the one matchup card here;
          This week's own matchup strip repeated it and is gone. */}
      {view === "matchup" && <div className="cc-pair">
      {/* Every row shows. A row with a move to make reads as before; a covered row says so with a check and still
          points somewhere useful: Lineup, Trade, Waivers, then a question for Ask (Zach) */}
      <section className="card briefing" aria-label="On your radar">
        <div className="row wrap" style={{ justifyContent: "space-between" }}>
          <div className="row"><h2 className="section-title">On your radar</h2><Phase v="v1" /></div>
        </div>
        {briefing.lineup !== null ? <button className="brief-row" onClick={() => onGo("roster")}>
          <span className="brief-k">Lineup fix</span><span className="grow">{briefing.lineup}</span><Icon name="chev" size={16} />
        </button> : null}
        <Arrived k="ok-lineup" on={briefing.lineup === null && !!briefing.ok?.lineup}>{(play) => <button className={`brief-row is-ok${play ? " ck-pop" : ""}`} onClick={() => onGo("roster")}>
          <span className="brief-k"><Icon name="check" size={14} />Lineup</span><span className="grow">{briefing.ok!.lineup}</span><Icon name="chev" size={16} />
        </button>}</Arrived>
        {briefing.trade ? <button className={`brief-row${newTrade.slide ? " nm-fresh" : ""}`} onClick={() => { newTrade.open(); if (briefing.trade) onOpen(briefing.trade); }}>
          <span className="brief-k">Top trade</span>
          <span className="grow"><>Your {swap(briefing.trade.give)} for {teamById(briefing.trade.partnerId).manager}'s {swap(briefing.trade.get)}: you <Delta n={briefing.trade.youDelta} />, them <Delta n={briefing.trade.themDelta} /></></span>
          {newTrade.dot && <i className="nm-dot" role="img" aria-label="New" />}
          <Icon name="chev" size={16} />
        </button> : null}
        <Arrived k="ok-trade" on={!briefing.trade && !!briefing.ok?.trade}>{(play) => <button className={`brief-row is-ok${play ? " ck-pop" : ""}`} onClick={() => onGo("trade")}>
          <span className="brief-k"><Icon name="check" size={14} />Trades</span><span className="grow">{briefing.ok!.trade}</span><Icon name="chev" size={16} />
        </button>}</Arrived>
        {sent && onOpenSent && <SentLine d={sent} onOpen={onOpenSent} fresh={newSent} />}
        {briefing.waiverPass ? <div className="ps-brief">
          <button className="brief-row" onClick={() => onGo("waivers")}>
            <span className="brief-k">Waiver add</span><span className="grow">{briefing.waiver}</span><Icon name="chev" size={16} />
          </button>
          {onSnooze && (
            <Tooltip content="Skips him this week. He can come back next week.">
              <button className="brief-snooze" aria-label={`Not right now: skip ${briefing.waiverPass.name} this week`} onClick={() => onSnooze(briefing.waiverPass!)}>Not right now</button>
            </Tooltip>
          )}
        </div> : null}
        <Arrived k="ok-waiver" on={!briefing.waiverPass && !!briefing.ok?.waiver}>{(play) => <button className={`brief-row is-ok${play ? " ck-pop" : ""}`} onClick={() => onGo("waivers")}>
          <span className="brief-k"><Icon name="check" size={14} />Waivers</span><span className="grow">{briefing.ok!.waiver}</span><Icon name="chev" size={16} />
        </button>}</Arrived>
        {briefing.ask && onAsk && <button className="brief-row brief-ask" onClick={() => onAsk(briefing.ask!)}>
          <span className="brief-k"><Icon name="spark" size={14} />Ask</span><span className="grow">"{briefing.ask}"</span><Icon name="chev" size={16} />
        </button>}
      </section>
      <Improve you={you} partner={partner} partnerId={partnerId} onGo={onGo} />
      </div>}
      {view === "matchup" && <section className="cc-week" aria-labelledby="cc-week-h">
        <div className="row wrap cc-sec">
          <h2 className="section-title" id="cc-week-h">This week</h2>
          <span className="sample-note">Week {WEEK}{OPPONENT_ID ? ` vs ${teamById(OPPONENT_ID).manager}` : ", bye"}</span>
        </div>
        <WeekMore threats={<Threats onGo={onGo} />} onGo={(t) => (t === "matchup" ? setMatchupOpen(true) : onGo(t))} />
      </section>}

      {view === "intel" && <>
      <RosterNews />
      {followUps.map((f) => <FollowUpCard key={f.id} f={f} coach={coach} onTag={onTag} onResolve={onResolve} onOpen={onOpen} onPitch={onPitch} />)}

      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <h2 className="section-title">Today's intel</h2>
        <span className="sample-note">{level === "light" ? "Light: top nudges only" : level === "hands" ? "Hands-on: every nudge" : "Standard nudges"} · <button className="linkish" onClick={() => onGo("settings:nudges")}>Change</button></span>
      </div>

      {nudges.length === 0 && <p className="empty-deal">You're caught up. Source will nudge you when something changes.</p>}

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
            {n.pass && onSnooze && <button className="snooze-btn ps-nudge-pass" onClick={() => onSnooze(n.pass!)} aria-label={`Not right now: skip ${n.pass.name} this week`}>Not right now</button>}
            <button className="nudge-link dismiss" onClick={() => leave(n)} aria-label="Not useful, show fewer like this">Not useful</button>
          </div>
        </article>
      ))}
      {nudges.length > 2 && (
        <button /* dismiss-exempt: inline show-more list toggle, not an overlay */ className="btn more-intel" onClick={() => setShowAll((x) => !x)} aria-expanded={showAll}>
          {showAll ? "Show less" : `More intel (${nudges.length - 2})`}
        </button>
      )}
      <p className="small muted" style={{ textAlign: "center" }}>Heard something in league chat? <button className="linkish" onClick={onCapture}>Log it on League Needs</button></p>
      </>}
    </>
  );
}
