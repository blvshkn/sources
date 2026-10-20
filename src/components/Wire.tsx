import { Fragment, useContext, useState } from "react";
import { denyOn } from "../deny";
import { scoreTone, flipTone } from "../liveMath";
import type { ReactNode } from "react";
import { LeagueSwitch } from "./LeagueSwitch";
import { IdeaFeedbackCtx } from "./IdeaFeedback";
import { playerById, teamById, YOU, TEAMS, Pos, ManagerTag, DEADLINES, WEEK, OPPONENT_ID, Player, PLAYERS, onBye } from "../data";
import { Trade, TeamNeeds, fmt, offerRead, verdict, eff, weakSlots } from "../engine";
import { AiLabel, Delta, Icon, IconName, Phase, Stamp, useSticky, PageTabs } from "./ui";
import { Avatar } from "./Avatar";
import { PlayerSheet } from "./lazy";
import { TeamAvatar } from "./TeamPicker";
import { Tooltip } from "./Tooltip";
import { Trophy } from "./Trophy";
import { useLive, onPace, startersOf, matchNow } from "../live";
import { WeekPlayer } from "../weeks";
import { useLineupWeek, useWeekMatch } from "../weekMatch";
import { gameInAt, lockLine, oppAt, useKickoffs } from "../kickoff";
import { RosterNews } from "./News";
import { MatchupSheet } from "./MatchupSheet";
import { FaceOff } from "./FaceOff";
import { MatchupStrip, heatOf, HeatMark, FinalPts, markLive, injuryDetail, injuryTag } from "./Roster";
import { SentLine } from "./SentOffers";
import type { SentDeal, SentOffer } from "../sentOffers";

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
  /** The player this nudge suggests adding, so "Not interested" can take him out of every suggestion. */
  pass?: { id: string; name: string };
}

export interface FollowUp { id: string; trade: Trade; via: string; when: string }
export interface Briefing { lineup: string; trade: Trade | null; waiver: string; /** Who the waiver line suggests, for its Not interested control. */ waiverPass?: { id: string; name: string } }

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
  // Their odds are their call, not good or bad for you, so they read in neutral ink
  const tone = "neutral";
  const feedback = useContext(IdeaFeedbackCtx);
  return (
    <article className="ti">
      <div className="tx">
        <IdeaSide label="You send" ids={t.give} tone="send" />
        <span className="tx-swap" aria-hidden="true"><Icon name="trade" size={16} /></span>
        <IdeaSide label="You get" ids={t.get} tone="get" />
      </div>
      <dl className="ti-stats">
        {t.accept && (
          <div className={`ti-stat odds ${tone}`}>
            <dt><Tooltip focusable content={<>Chance they accept, from their needs, notes and trade history. {t.accept.label === "Likely yes" ? "Likely yes is 65% and up." : t.accept.label === "Worth a shot" ? "Worth a shot is 50 to 64%." : "Long shot is under 50%."}</>}><span className="tt-term">{t.accept.label}</span></Tooltip></dt>
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
/** This week's matchup card: the shared face-off (FaceOff.tsx). The whole card opens the full matchup. */
export function Scoreboard({ you, partner, onPartner, onMatchup, extras = true }: { you: TeamNeeds; partner: string | null; onPartner?: () => void; onMatchup?: () => void; extras?: boolean }) {
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  // Expected finishes from the lineups actually set in Sleeper (K/DEF included); win chance from what's left to play
  // One score per team, the same one the full matchup and the Lineup strip read (live.matchNow): Sleeper's team
  // score, projected finish, and win % that turns into the result once every starter is done
  const live = useLive();
  const ms = matchNow(live);
  const mine = ms.me.proj;
  const theirs = ms.opp ? ms.opp.proj : null;
  const chance = ms.chance;
  const pt = partner ? TEAMS.find((t) => t.manager === partner || t.name === partner) : undefined;
  const need = you.groups[you.need].diff;
  // Once games start, the big numbers are points scored and the projection drops to a footnote
  const started = Object.values(live.games).some((x) => x === "in_game" || x === "complete");
  const nowLive = Object.values(live.games).some((x) => x === "in_game");
  const myNow = started ? ms.me.scored : undefined, oppNow = started && ms.opp ? ms.opp.scored : undefined;
  const inPlay = started && myNow !== undefined && (!opp || oppNow !== undefined);
  const res = ms.result;
  // Score tones (liveMath.scoreTone): the side ahead now, or the winner once final, stays bright; pregame both do
  const myTone = scoreTone(myNow ?? mine, oppNow ?? theirs, res ? "final" : inPlay ? "live" : "pre");
  return (
    <section className="card sb2" aria-label="This week">
      <button className="sb2-rows sb2-open mc-press" onClick={onMatchup ?? denyOn(`No matchup in Week ${WEEK}, so there's nothing to open.`)} aria-disabled={!onMatchup || undefined} aria-label={`Open this week's matchup${res ? `. Final: ${res.long}` : `${inPlay ? `. You ${myNow!.toFixed(1)}${oppNow !== undefined ? `, them ${oppNow.toFixed(1)}` : ""}` : ""}${chance !== null ? `. ${chance} percent to win` : ""}`}`}>
        <FaceOff week={WEEK} state={res ? "final" : inPlay && nowLive ? "live" : inPlay ? "scored" : "pre"} chance={opp ? chance : null} res={opp ? res : null} msg="Bye week"
          you={{ t: YOU, pts: inPlay ? myNow! : mine, live: inPlay, note: inPlay && !res ? mine.toFixed(1) : undefined, dim: myTone === "trail" }}
          them={opp && theirs !== null ? { t: opp, pts: inPlay && oppNow !== undefined ? oppNow : theirs, live: inPlay, note: inPlay && !res ? theirs.toFixed(1) : undefined, dim: flipTone(myTone) === "trail" } : { t: null, pts: null, empty: "No matchup" }} />
      </button>
      {extras && <>
      <dl className="ti-stats sb2-stats">
        <div className="ti-stat"><dt><Tooltip focusable content="Starting lineup strength against the other teams. 1 is strongest."><span className="tt-term">Power rank</span></Tooltip></dt><dd>#{you.rank}<small>of {TEAMS.length}</small></dd></div>
        <div className="ti-stat"><dt>Weakest spot</dt><dd>{you.need}<span className={`sb2-need ${need < 0 ? "down" : "up"}`}>{fmt(need)}</span></dd></div>
      </dl>
      {partner && onPartner ? (
        <button className="sb2-partner" onClick={onPartner} aria-label={`Build a trade with ${partner}`}>
          {pt && <TeamAvatar t={pt} size={36} />}
          <span className="sb2-who"><small>Best trade partner</small><b>{partner}{pt && <Trophy teamId={pt.id} />}</b></span>
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
    return <span className={`wk-pts live${heat ? ` heat-${heat}` : ""}`}><b>{heat && <HeatMark heat={heat} />}{pts.toFixed(1)}</b><small className={pace !== null ? `lu-pace ${(pace >= proj) !== them ? "up" : "down"}` : undefined}>{pace !== null ? `pace ${pace.toFixed(1)}` : `proj ${proj.toFixed(1)}`}</small></span>;
  }
  if (g === "complete") return <FinalPts id={p.id} pts={pts} proj={proj} cls="wk-pts" />;
  // Not started: the number is his projection, labelled like the live (pace) and final (proj) rows, so every row reads the same
  return <span className="wk-pts muted"><b>{proj.toFixed(1)}</b><small>proj</small></span>;
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
  return (
    <div className={`thr-body${msg ? " has-msg" : ""}${!rows && !msg ? " is-skel" : ""}`} aria-busy={!rows && !msg}>
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

/** More for the This week tab: when your starters play, who's banged up, the opponent's threats, and the dates that matter. */
function WeekMore({ onGo }: { onGo: (t: string) => void }) {
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
                <span className="wk-name">{p.name}<small><b className={`lu-pos p-${p.pos}`}>{p.pos}</b> · {p.nfl} {oppAt(p.nfl, vsOf(p))}</small></span>
                <WkPts p={p} live={live} />
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
            <span className="wk-name"><span className="wk-nm">{p.name}<span className={`wk-tag s-${p.status}`}>{injuryTag(p)}</span></span><small>{detail(p)}</small></span>
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

export function Wire({ you, partner, partnerId, nudges, followUps, briefing, coach, onOpen, onPitch, onGo, onDismiss, onTag, onResolve, onKeepTag, onClearTag, onCapture, level, onPass, sent, onOpenSent }: {
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
  /** "Not interested" on a suggested player: one list shared by every suggestion. */
  onPass?: (p: { id: string; name: string }) => void;
  /** Your newest offer still out (or just accepted), as one line in Quick moves that opens it */
  sent?: SentDeal | null; onOpenSent?: (o: SentOffer) => void;
}) {
  useKickoffs();
  const [leaving, setLeaving] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useSticky<"matchup" | "week" | "intel">("wire.view", "matchup", ["matchup", "week", "intel"]);
  // "See the full matchup" on the Overview card opens it over the Wire (sheet or modal) instead of leaving the page
  const [matchupOpen, setMatchupOpen] = useState(false);
  const visible = showAll ? nudges : nudges.slice(0, 2);
  const leave = (n: Nudge) => {
    setLeaving((c) => [...c, n.id]);
    window.setTimeout(() => { onDismiss(n); setLeaving((c) => c.filter((x) => x !== n.id)); }, 200);
  };
  return (
    <>
      <header className="page-head">
        <div>
          <LeagueSwitch title="The Wire" meta={<>{lockLine()}</>} />
        </div>
      </header>

      <PageTabs value={view} onChange={setView} options={[{ v: "matchup", label: "Overview", icon: "app" }, { v: "week", label: "This week", icon: "clock" }, { v: "intel", label: nudges.length + followUps.length ? `Intel (${nudges.length + followUps.length})` : "Intel", icon: "spark" }]} />

      {view === "matchup" && <Scoreboard you={you} partner={partner} extras={false} onMatchup={() => setMatchupOpen(true)} />}
      {matchupOpen && <MatchupSheet onClose={() => setMatchupOpen(false)} />}

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
        {sent && onOpenSent && <SentLine d={sent} onOpen={onOpenSent} />}
        <div className="ps-brief">
          <button className="brief-row" onClick={() => onGo("waivers")}>
            <span className="brief-k">Waiver add</span><span className="grow">{briefing.waiver}</span><Icon name="chev" size={16} />
          </button>
          {briefing.waiverPass && onPass && (
            <Tooltip content="Not interested. Sources stops suggesting him">
              <button className="ps-x" aria-label={`Not interested in ${briefing.waiverPass.name}`} onClick={() => onPass(briefing.waiverPass!)}><Icon name="x" size={16} /></button>
            </Tooltip>
          )}
        </div>
      </section>}
      {view === "matchup" && <Improve you={you} partner={partner} partnerId={partnerId} onGo={onGo} />}
      {view === "matchup" && <Threats onGo={onGo} />}
      {view === "week" && <div className="wk-strip"><MatchupStrip onOpen={() => setMatchupOpen(true)} /></div>}
      {view === "week" && <WeekMore onGo={(t) => (t === "matchup" ? setMatchupOpen(true) : onGo(t))} />}

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
            {n.pass && onPass && <button className="nudge-link dismiss ps-nudge-pass" onClick={() => onPass(n.pass!)} aria-label={`Not interested in ${n.pass.name}`}>Not interested</button>}
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
