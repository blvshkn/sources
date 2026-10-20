import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { WeekStepper } from "./WeekStepper";
import { WeekPlayer } from "../weeks";
import { Slot, gameIn, pendingMatchupWeek, clearMatchupWeek, useWeekMatch } from "../weekMatch";
import { OPPONENT_ID, Player, SLEEPER_SET, SpecialPlayer, Team, WEEK, YOU, gameLine, onBye, playerById, sleeperUrl, teamById } from "../data";
import { eff, fits, fmt, lineupFor, round1, SlotName, specialPts, startedSpecials, StartedSpecial } from "../engine";
import { Avatar } from "./Avatar";
import { TeamAvatar } from "./TeamPicker";
import { Icon, StatusPill, LiveNum } from "./ui";
import { Live, useLive, expect, onPace, sideScore, scoreMatch, chanceTone, startersOf } from "../live";
import { finalPct, resultOf } from "../liveMath";
import { PtsCell, gameNow, playCls, PlayCount } from "./Roster";
import { PlatformLogo } from "./PlatformLogo";
import { Tooltip } from "./Tooltip";
import { Trophy } from "./Trophy";

const proj = (id: string | null) => (id ? eff(playerById(id), true) : 0);
/** Fill the league's slots in order from a list of starters, so both lineups line up slot for slot. */
function slotted(team: Team, starters: string[] | undefined): { slot: SlotName; id: string | null }[] {
  const base = lineupFor(team.roster, true);
  if (!starters?.length) return base.slots.map((s) => ({ slot: s.slot, id: s.player?.id ?? null }));
  const pool = starters.filter((id) => team.roster.includes(id));
  const used = new Set<string>();
  return base.slots.map((s) => {
    const id = pool.find((x) => !used.has(x) && fits(s.slot, playerById(x).pos)) ?? null;
    if (id) used.add(id);
    return { slot: s.slot, id };
  });
}

/** A K/DEF's expected finish right now: final points, live points or projection, the way the totals count it. */
const spPts = (live: Live, p: SpecialPlayer | null) => {
  if (!p) return 0;
  const now = live.points[p.id], st = live.games[p.nfl], pr = live.proj?.[p.id] ?? specialPts(p);
  if (now === undefined) return pr;
  return st === "complete" ? now : st === "in_game" ? onPace(now, pr, live.left?.[p.nfl]) ?? Math.max(now, pr) : pr;
};

/** A K/DEF in the matchup. One Sleeper left empty shows our best-projected pick, labeled Suggested. */
function SpecialWho({ s, side }: { s: StartedSpecial | null; side: "you" | "them" }) {
  const p = s?.player;
  if (!p) return <span className={`mu-p ${side} empty`}><span className="mu-n"><b>Empty</b></span></span>;
  return (
    <span className={`mu-p ${side}`}>
      <Avatar p={p} size={32} />
      <span className="mu-n"><b>{p.name}</b><small>{p.pos} · {p.nfl}{p.wk === null ? " · Bye" : p.opp ? ` · ${p.opp}` : ""}{s.suggested && <span className="muted"> · Suggested</span>}</small></span>
    </span>
  );
}

/** The full matchup for any week. This week is the live, interactive one (try swaps); other weeks are read-only:
 *  a past week's final, slot for slot, or a future week's projected lineups. "See the full matchup" picks the week. */
export function Matchup({ onBack }: { onBack: () => void }) {
  const [week, setWeek] = useMatchupWeek();
  return <MatchupWeek week={week} onBack={onBack} stepper={<WeekStepper week={week} onChange={setWeek} className="mu-weeks" />} />;
}

/** The week the full matchup opens on: the one passed in, else the one "See the full matchup" picked. Read once. */
export function useMatchupWeek(start?: number) {
  const st = useState(() => start ?? pendingMatchupWeek());
  useEffect(() => clearMatchupWeek(), []);
  return st;
}

/** One week of the full matchup. The #matchup page passes a back button and the stepper above it; the matchup
 *  sheet keeps its stepper in its own fixed header and passes neither. */
export function MatchupWeek({ week, onBack, stepper = null }: { week: number; onBack?: () => void; stepper?: ReactNode }) {
  return week === WEEK ? <MatchupNow onBack={onBack} stepper={stepper} /> : <WeekMatchup week={week} onBack={onBack} stepper={stepper} />;
}

const BackBtn = ({ onBack }: { onBack?: () => void }) => onBack ? <button className="st-back mu-back" onClick={onBack}><Icon name="chev" size={16} />Wire</button> : null;

function MatchupNow({ onBack, stepper }: { onBack?: () => void; stepper: ReactNode }) {
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  const sleeperMine = useMemo(() => {
    const set = Object.values(SLEEPER_SET).flat();
    return slotted(YOU, YOU.starters?.length ? YOU.starters : set.length ? set : undefined);
  }, []);
  const theirs = useMemo(() => (opp ? slotted(opp, opp.starters) : []), [opp]);
  const [mine, setMine] = useState(sleeperMine);
  const [open, setOpen] = useState<number | null>(null);
  const live = useLive();
  const pts = (id: string | null) => expect(live, id);

  if (!opp) return (
    <><BackBtn onBack={onBack} />{stepper}<section className="card card-pad"><p className="small muted">No matchup this week.</p></section></>
  );

  // Totals include the K/DEF started in Sleeper (best projected only for a slot left empty). Each side's score is
  // Sleeper's team score for that roster, the one the Wire card shows (live.sideScore); a what-if lineup is ours
  // to add up. Win % turns into the result once every starter on both sides is done.
  const myK = startedSpecials(YOU), oppK = startedSpecials(opp);
  const myKs = myK.map((x) => x.player), oppKs = oppK.map((x) => x.player);
  const changed = mine.some((s, i) => s.id !== sleeperMine[i].id);
  const meS = sideScore(live, YOU, mine.map((s) => s.id), myKs, !changed);
  const oppS = sideScore(live, opp, theirs.length ? theirs.map((s) => s.id) : startersOf(opp), oppKs);
  const baseS = sideScore(live, YOU, sleeperMine.map((s) => s.id), myKs);
  const ms = scoreMatch(meS, oppS, live.past), res = ms.result;
  const myTotal = round1(meS.proj), oppTotal = round1(oppS.proj), baseTotal = round1(baseS.proj);
  const chance = ms.chance ?? 50;
  const ids = [...mine.map((s) => s.id), ...theirs.map((s) => s.id)];
  const started = ids.some((id) => id && live.points[id] !== undefined && live.games[playerById(id).nfl] && live.games[playerById(id).nfl] !== "pre_game");
  const nowLive = !res && ids.some((id) => id && live.games[playerById(id).nfl] === "in_game");
  const myCount = meS.count, oppCount = oppS.count;
  const spCls = (p: SpecialPlayer | null) => (p ? playCls(gameNow(live, p.id, p.nfl), p.wk === null) : "");
  const rowCls = (p: Player | null) => (p ? playCls(gameNow(live, p.id, p.nfl), onBye(p.nfl)) : "");
  const bench = YOU.roster.filter((id) => !mine.some((s) => s.id === id)).map(playerById);
  const best = lineupFor(YOU.roster, true);
  const edges = mine.map((s, i) => round1(pts(s.id) - pts(theirs[i]?.id ?? null)));
  const kEdges = myK.map((x, i) => round1(spPts(live, x.player) - spPts(live, oppK[i]?.player ?? null)));
  const winning = [...edges, ...kEdges].filter((e) => e > 0).length;
  const bigWin = edges.reduce((bi, e, i) => (e > edges[bi] ? i : bi), 0);
  const bigLoss = edges.reduce((bi, e, i) => (e < edges[bi] ? i : bi), 0);

  const swap = (slotIdx: number, id: string) => {
    setMine((cur) => {
      const next = cur.map((s) => ({ ...s }));
      const other = next.findIndex((s) => s.id === id);
      const prev = next[slotIdx].id;
      next[slotIdx].id = id;
      if (other >= 0) next[other].id = prev && fits(next[other].slot, playerById(prev).pos) ? prev : null;
      return next;
    });
    setOpen(null);
  };
  const useBest = () => { setMine(best.slots.map((s) => ({ slot: s.slot, id: s.player?.id ?? null }))); setOpen(null); };

  const Who = ({ p, side }: { p: Player | null; side: "you" | "them" }) => p ? (
    <span className={`mu-p ${side}`}>
      <Avatar p={p} size={32} />
      <span className="mu-n"><b>{p.name}</b><small>{p.pos} · {p.nfl}{!onBye(p.nfl) && gameLine(p) ? ` · ${gameLine(p)}` : ""} <StatusPill p={p} /></small></span>
    </span>
  ) : <span className={`mu-p ${side} empty`}><span className="mu-n"><b>Empty</b></span></span>;

  return (
    <>
      <BackBtn onBack={onBack} />
      {stepper}
      <section className="card mu" aria-label={`Week ${WEEK} matchup${res ? `, final. ${res.long}` : ""}`}>
        <header className="mu-score">
          <div className="mu-side you"><span className="mu-who"><TeamAvatar t={YOU} size={22} />{changed ? "Your what-if" : "Your lineup"}</span>
            {started ? <><LiveNum v={round1(meS.scored)} className="mu-big" /><small className="mu-proj">{res ? "final" : `proj ${myTotal.toFixed(1)}`}</small><PlayCount c={myCount} compact /></> : <b>{myTotal.toFixed(1)}</b>}</div>
          <div className="mu-mid">{nowLive && <span className="lu-live"><i />Live</span>}
            {res ? <><Tooltip content="Every starter on both sides is done, so this is the result, not a projection."><b className={res.tone === "even" ? undefined : res.tone}>{chance}%</b></Tooltip><small>Final</small></>
              : <><Tooltip content="Win chance from both projected totals. It firms up as points get played."><b>{chance}%</b></Tooltip><small>to win</small></>}</div>
          <div className="mu-side them"><span className="mu-who">{opp.manager}<Trophy teamId={opp.id} /><TeamAvatar t={opp} size={22} /></span>
            {started ? <><LiveNum v={round1(oppS.scored)} className="mu-big" /><small className="mu-proj">{res ? "final" : `proj ${oppTotal.toFixed(1)}`}</small><PlayCount c={oppCount} compact /></> : <b>{oppTotal.toFixed(1)}</b>}</div>
        </header>
        <div className={`mu-bar ${chanceTone(ms)}${res ? " is-final" : ""}`} aria-hidden="true"><span style={{ width: `${chance}%` }} /></div>
        <p className="mu-sum">
          {res && <>{res.long}, {res.short.charAt(0).toLowerCase()}{res.short.slice(1)}. </>}
          You {res ? "won" : "win"} <b>{winning} of {mine.length + myK.length}</b> spots.
          {edges[bigWin] > 0 && <> Biggest edge: <b>{mine[bigWin].slot} {fmt(edges[bigWin])}</b>.</>}
          {edges[bigLoss] < 0 && <> Weakest spot: <b>{mine[bigLoss].slot} {fmt(edges[bigLoss])}</b>.</>}
        </p>

        {changed && (
          <div className="mu-whatif">
            <span><b>What-if lineup</b>{fmt(round1(myTotal - baseTotal))} pts vs your Sleeper lineup. Make the swap in Sleeper to lock it in.</span>
            <div className="mu-wbtn">
              <button className="btn btn-sm" onClick={() => { setMine(sleeperMine); setOpen(null); }}>Reset</button>
              <a className="btn btn-sm btn-primary" href={sleeperUrl()} target="_blank" rel="noreferrer"><PlatformLogo size={16} />Open Sleeper</a>
            </div>
          </div>
        )}

        <div className="mu-th"><span>Slot</span><span>You, then {opp.manager}</span><span className="mu-th-you">You</span><span className="mu-th-them">{opp.manager}</span></div>
        {mine.map((s, i) => {
          const me = s.id ? playerById(s.id) : null;
          const them = theirs[i]?.id ? playerById(theirs[i].id!) : null;
          const e = edges[i];
          const options = bench.filter((p) => fits(s.slot, p.pos)).sort((a, b) => eff(b, true) - eff(a, true));
          return (
            <div key={i} className={`mu-row${open === i ? " open" : ""}`}>
              <span className="mu-slot">{s.slot}</span>
              <button className={`mu-mine${rowCls(me)}`} onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} aria-label={`Swap ${me?.name ?? "empty"} at ${s.slot}`}>
                <Who p={me} side="you" />
                {me ? <PtsCell id={me.id} g={gameNow(live, me.id, me.nfl)} proj={proj(me.id)} cls="lu-pts mu-pts" /> : <span className="mu-pts">0.0</span>}
              </button>
              <span className={`mu-edge ${e > 0 ? "up" : e < 0 ? "down" : ""}`}>{e === 0 ? "even" : fmt(e)}</span>
              <span className={`mu-theirs${rowCls(them)}`}><Who p={them} side="them" />{them ? <PtsCell id={them.id} g={gameNow(live, them.id, them.nfl)} proj={proj(them.id)} cls="lu-pts mu-pts" them /> : <span className="mu-pts">0.0</span>}</span>
              {open === i && (
                <div className="mu-swap">
                  <small>Swap in at {s.slot}</small>
                  {options.length ? options.map((p) => (
                    <button key={p.id} className="mu-opt" onClick={() => swap(i, p.id)}>
                      <Who p={p} side="you" />
                      <span className="mu-pts">{eff(p, true).toFixed(1)}</span>
                      <span className={`mu-delta ${eff(p, true) - pts(s.id) >= 0 ? "up" : "down"}`}>{fmt(round1(eff(p, true) - pts(s.id)))}</span>
                    </button>
                  )) : <p className="small muted">No bench player can play {s.slot}.</p>}
                </div>
              )}
            </div>
          );
        })}
        {myK.map((x, i) => {
          const them = oppK[i] ?? null, e = kEdges[i];
          return (
            <div key={`k-${i}`} className="mu-row">
              <span className="mu-slot">{x.slot}</span>
              <span className={`mu-mine${spCls(x.player)}`}><SpecialWho s={x} side="you" />{x.player ? <PtsCell id={x.player.id} g={gameNow(live, x.player.id, x.player.nfl)} proj={specialPts(x.player)} cls="lu-pts mu-pts" /> : <span className="mu-pts">0.0</span>}</span>
              <span className={`mu-edge ${e > 0 ? "up" : e < 0 ? "down" : ""}`}>{e === 0 ? "even" : fmt(e)}</span>
              <span className={`mu-theirs${spCls(them?.player ?? null)}`}><SpecialWho s={them} side="them" />{them?.player ? <PtsCell id={them.player.id} g={gameNow(live, them.player.id, them.player.nfl)} proj={specialPts(them.player)} cls="lu-pts mu-pts" them /> : <span className="mu-pts">0.0</span>}</span>
            </div>
          );
        })}
        <div className="mu-foot">
          <span>Tap any of your players to try a swap.</span>
          {round1(best.total - myTotal) > 0 && <button className="btn btn-sm" onClick={useBest}>Use best lineup {fmt(round1(best.total - myTotal))}</button>}
        </div>
      </section>
    </>
  );
}

/** One side of a row in a week other than this one: name, position, team and that week's game. */
function WeekWho({ p, side, week, suggested }: { p: WeekPlayer | null; side: "you" | "them"; week: number; suggested?: boolean }) {
  if (!p) return <span className={`mu-p ${side} empty`}><span className="mu-n"><b>Empty</b></span></span>;
  const game = gameIn(p, week);
  return (
    <span className={`mu-p ${side}`}>
      <Avatar p={p} size={32} text={p.pos === "DEF" ? p.nfl : undefined} />
      <span className="mu-n"><b>{p.name}</b><small>{p.pos} · {p.nfl} · {game ?? "Bye"}{suggested && <span className="muted"> · Suggested</span>}</small></span>
    </span>
  );
}

function WeekMatchup({ week, onBack, stepper }: { week: number; onBack?: () => void; stepper: ReactNode }) {
  const { m, err } = useWeekMatch(week);
  const back = <BackBtn onBack={onBack} />;
  if (!m || !m.opp) return (
    <>{back}{stepper}
      <section className="card card-pad mu-week-msg" aria-busy={!m && !err}>
        {m ? <p className="small"><b>{m.empty?.title}</b> <span className="muted">{m.empty?.body}</span></p>
          : err ? <p className="small muted">{err}</p>
          : <div className="lu-skel" aria-label={`Loading Week ${week}`}>{Array.from({ length: 6 }).map((_, i) => <span key={i} />)}</div>}
      </section>
    </>
  );
  const past = m.kind === "past", opp = m.opp;
  const n = Math.max(m.me.starters.length, opp.starters.length);
  const at = (xs: Slot[], i: number) => xs[i] ?? { slot: "", p: null };
  const pts = (x: Slot) => x.p?.pts ?? 0;
  const edges = Array.from({ length: n }, (_, i) => round1(pts(at(m.me.starters, i)) - pts(at(opp.starters, i))));
  const winning = edges.filter((e) => e > 0).length;
  // A past week is final: win % from the scores (100, 0 or 50), the same as this week once it's done
  const chance = past ? finalPct(m.me.total, opp.total) : m.chance ?? 50;
  const res = past ? resultOf(m.me.total, opp.total) : null;
  const Num = ({ x }: { x: Slot }) => x.p?.pts === null ? <span className="lu-pts mu-pts bye">BYE</span> : <span className={`lu-pts mu-pts${past ? " actual" : ""}`}>{pts(x).toFixed(1)}</span>;
  return (
    <>
      {back}{stepper}
      <section className="card mu" aria-label={`Week ${week} matchup`}>
        <header className="mu-score">
          <div className="mu-side you"><span>{past ? "You scored" : "Your best lineup"}</span><b>{m.me.total.toFixed(1)}</b></div>
          <div className="mu-mid">{res
            ? <><b className={res.tone === "even" ? undefined : res.tone}>{chance}%</b><small>Final</small></>
            : <><Tooltip content="Win chance from both projected lineups for that week."><b>{chance}%</b></Tooltip><small>to win</small></>}</div>
          <div className="mu-side them"><span>{opp.team.manager}<Trophy teamId={opp.team.id} /></span><b>{opp.total.toFixed(1)}</b></div>
        </header>
        <div className={`mu-bar ${res ? `${res.tone} is-final` : chance >= 55 ? "up" : chance <= 45 ? "down" : "even"}`} aria-hidden="true"><span style={{ width: `${chance}%` }} /></div>
        <p className="mu-sum">{res ? <>{res.long}, {res.short.charAt(0).toLowerCase()}{res.short.slice(1)}. You won <b>{winning} of {n}</b> spots.</>
          : <>Projected to win <b>{winning} of {n}</b> spots. Both sides use Sleeper's Week {week} projections.</>}</p>
        <div className="mu-th"><span>Slot</span><span>You, then {opp.team.manager}</span><span className="mu-th-you">You</span><span className="mu-th-them">{opp.team.manager}</span></div>
        {Array.from({ length: n }, (_, i) => {
          const a = at(m.me.starters, i), b = at(opp.starters, i), e = edges[i];
          return (
            <div key={i} className="mu-row">
              <span className="mu-slot">{a.slot || b.slot}</span>
              <span className="mu-mine"><WeekWho p={a.p} side="you" week={week} suggested={a.suggested} /><Num x={a} /></span>
              <span className={`mu-edge ${e > 0 ? "up" : e < 0 ? "down" : ""}`}>{e === 0 ? "even" : fmt(e)}</span>
              <span className="mu-theirs"><WeekWho p={b.p} side="them" week={week} suggested={b.suggested} /><Num x={b} /></span>
            </div>
          );
        })}
        <div className="mu-foot"><span>{past ? `Week ${week} final, from Sleeper.` : `Lineups set to each side's best projected starters for Week ${week}.`}</span></div>
      </section>
    </>
  );
}
