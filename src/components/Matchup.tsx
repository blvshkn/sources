import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { WeekStepper } from "./WeekStepper";
import { Slot, pendingMatchupWeek, clearMatchupWeek } from "../weekMatch";
import { LEAGUE, OPPONENT_ID, Player, SpecialPlayer, WEEK, YOU, onBye, playerById, sleeperUrl, teamById } from "../data";
import { eff, fits, fmt, round1, specialPts, startedSpecials, StartedSpecial } from "../engine";
import { Icon } from "./ui";
import { useLive, expect, sideScore, scoreMatch, startersOf } from "../live";
import { finalPct, resultOf, scoreTone, flipTone } from "../liveMath";
import { PtsCell, gameNow, playCls } from "./Roster";
import { FaceOff, toPlay } from "./FaceOff";
import { PlatformLogo } from "./PlatformLogo";
import { deny, denyOn } from "../deny";
import { SwapPicker, SpecialWho, WeekWho, Who, lockOf, lockRules, spPts, useSwapMenu, weekBye } from "./SwapPicker";
import { bestNow, slotted, swapInto, useNowLineup, useWeekWhatIf } from "../lineupWhatIf";

const proj = (id: string | null) => (id ? eff(playerById(id), true) : 0);

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
  const theirs = useMemo(() => (opp ? slotted(opp, opp.starters) : []), [opp]);
  // Your lineup is the shared what-if (lineupWhatIf): Sleeper's until you swap, here or on the Lineup page
  const { base, mine, mineK, changed, setMine, setMineK, reset } = useNowLineup();
  const sleeperMine = base.mine, sleeperK = base.k;
  // Which row's swap menu is open: skill slots by index, then K/DEF slots after them. Taps keep the scroll still.
  const { open, setOpen, menuRef: swapEl } = useSwapMenu<number>();
  const live = useLive();
  const pts = (id: string | null) => expect(live, id);

  if (!opp) return (
    <><BackBtn onBack={onBack} />{stepper}<section className="card card-pad"><p className="small muted">No matchup this week.</p></section></>
  );

  // Totals include the K/DEF started in Sleeper (best projected only for a slot left empty). Each side's score is
  // Sleeper's team score for that roster, the one the Wire card shows (live.sideScore); a what-if lineup is ours
  // to add up. Win % turns into the result once every starter on both sides is done.
  const myK: StartedSpecial[] = sleeperK.map((x, i) => ({ slot: x.slot, player: mineK[i] ?? null, suggested: x.suggested && mineK[i]?.id === x.player?.id }));
  const oppK = startedSpecials(opp);
  const myKs = mineK, oppKs = oppK.map((x) => x.player), baseKs = sleeperK.map((x) => x.player);
  const meS = sideScore(live, YOU, mine.map((s) => s.id), myKs, !changed);
  const oppS = sideScore(live, opp, theirs.length ? theirs.map((s) => s.id) : startersOf(opp), oppKs);
  const baseS = sideScore(live, YOU, sleeperMine.map((s) => s.id), baseKs);
  const ms = scoreMatch(meS, oppS, live.past), res = ms.result;
  const myTotal = round1(meS.proj), oppTotal = round1(oppS.proj), baseTotal = round1(baseS.proj);
  const chance = ms.chance ?? 50;
  const ids = [...mine.map((s) => s.id), ...theirs.map((s) => s.id)];
  const started = ids.some((id) => id && live.points[id] !== undefined && live.games[playerById(id).nfl] && live.games[playerById(id).nfl] !== "pre_game");
  const nowLive = !res && ids.some((id) => id && live.games[playerById(id).nfl] === "in_game");
  const myCount = meS.count, oppCount = oppS.count;
  // Score tones (liveMath.scoreTone): ahead now or the winner stays bright, the other side dims; pregame both bright
  const myTone = scoreTone(meS.scored, oppS.scored, res ? "final" : started ? "live" : "pre");
  const spCls = (p: SpecialPlayer | null) => (p ? playCls(gameNow(live, p.id, p.nfl), p.wk === null) : "");
  const rowCls = (p: Player | null) => (p ? playCls(gameNow(live, p.id, p.nfl), onBye(p.nfl)) : "");
  const bench = YOU.roster.filter((id) => !mine.some((s) => s.id === id)).map(playerById);
  // K and DEF on the roster that aren't in a K/DEF slot right now: the only ones a K or DEF row can swap in
  const benchK = (YOU.special ?? []).map((id) => LEAGUE.specials?.[id]).filter((p): p is SpecialPlayer => !!p && !mineK.some((x) => x?.id === p.id));
  const edges = mine.map((s, i) => round1(pts(s.id) - pts(theirs[i]?.id ?? null)));
  const kEdges = myK.map((x, i) => round1(spPts(live, x.player) - spPts(live, oppK[i]?.player ?? null)));
  const winning = [...edges, ...kEdges].filter((e) => e > 0).length;
  const bigWin = edges.reduce((bi, e, i) => (e > edges[bi] ? i : bi), 0);
  const bigLoss = edges.reduce((bi, e, i) => (e < edges[bi] ? i : bi), 0);

  // A starter whose game kicked off, or any starter once the week is over, can't be swapped: the row shakes and says why.
  // Over means Sleeper's state moved past it, or every starter on both sides is done (the result is final), byes included.
  // The same rules, game states and words for every slot: skill players, kickers and defenses.
  const pastWeek = !!live.past || !!res;
  const { starterLock, candidateLock } = lockRules(live, pastWeek);
  // "Use best lineup": the best skill lineup that leaves locked players where they are, against the shown one, skill
  // players to skill players (K/DEF out of both). The same helper as Lineup's "Use optimal lineup".
  const best = bestNow(live, mine, (id) => pastWeek || !!lockOf(live, playerById(id)));
  const bestGain = best.gain;
  const allLocked = pastWeek || (mine.every((s) => !!starterLock(s.id ? playerById(s.id) : null)) && mineK.every((p) => !!starterLock(p)));

  const swap = (slotIdx: number, id: string, from: Element) => { setMine((cur) => swapInto(cur, slotIdx, id)); setOpen(null, from); };
  const swapK = (slotIdx: number, p: SpecialPlayer, from: Element) => {
    setMineK((cur) => cur.map((x, i) => (i === slotIdx ? p : x)));
    setOpen(null, from);
  };
  const useBest = (e: { currentTarget: Element }) => { setMine(best.slots); setOpen(null, e.currentTarget); };
  // A tap on one of your starters: locked shakes and says why; otherwise it opens or closes that slot's swap menu
  const tapStarter = (idx: number, lock: string | null) => (e: { currentTarget: Element }) => {
    if (lock) { if (open !== null) setOpen(null, e.currentTarget); deny(e.currentTarget, lock); }
    else setOpen(open === idx ? null : idx, e.currentTarget);
  };

  return (
    <>
      <BackBtn onBack={onBack} />
      {stepper}
      <section className="card mu" aria-label={`Week ${WEEK} matchup${res ? `, final. ${res.long}` : ""}`}>
        <FaceOff week={WEEK} state={res ? "final" : nowLive ? "live" : started ? "scored" : "pre"} chance={chance} res={res} flat
          label={`${changed ? "Your what-if" : "You"} ${(started ? round1(meS.scored) : myTotal).toFixed(1)}, ${opp.name} ${(started ? round1(oppS.scored) : oppTotal).toFixed(1)}. ${res ? `Final, ${res.short}` : `${chance} percent to win`}${started && !res ? `. ${toPlay(myCount) || "0 to play"} for you, ${toPlay(oppCount) || "0 to play"} for them` : ""}`}
          you={{ t: YOU, pts: started ? round1(meS.scored) : myTotal, live: started, dim: myTone === "trail", count: myCount,
            note: res ? undefined : started ? `${changed ? "what-if " : ""}${myTotal.toFixed(1)}` : changed ? "what-if" : undefined }}
          them={{ t: opp, pts: started ? round1(oppS.scored) : oppTotal, live: started, dim: flipTone(myTone) === "trail", count: oppCount,
            note: started && !res ? oppTotal.toFixed(1) : undefined }} />
        <p className="mu-sum">
          {res && <>{res.long}, <span className={`sc-res ${res.tone}`}>{res.short.charAt(0).toLowerCase()}{res.short.slice(1)}</span>. </>}
          You {res ? "won" : "win"} <b>{winning} of {mine.length + myK.length}</b> spots.
          {edges[bigWin] > 0 && <> Biggest edge: <b>{mine[bigWin].slot} {fmt(edges[bigWin])}</b>.</>}
          {edges[bigLoss] < 0 && <> Weakest spot: <b>{mine[bigLoss].slot} {fmt(edges[bigLoss])}</b>.</>}
        </p>

        {changed && (
          <div className="mu-whatif">
            <span><b>What-if lineup</b>{fmt(round1(myTotal - baseTotal))} pts vs your Sleeper lineup. Make the swap in Sleeper to lock it in.</span>
            <div className="mu-wbtn">
              <button className="btn btn-sm" onClick={(e: { currentTarget: Element }) => { reset(); setOpen(null, e.currentTarget); }}>Reset</button>
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
          const lock = starterLock(me);
          return (
            <div key={i} className={`mu-row${open === i ? " open" : ""}`}>
              <span className="mu-slot">{s.slot}</span>
              <button className={`mu-mine${rowCls(me)}${lock ? " is-locked" : ""}`} aria-disabled={lock ? true : undefined}
                onClick={tapStarter(i, lock)}
                aria-expanded={lock ? undefined : open === i} aria-label={lock ? `${me?.name ?? "Empty"} at ${s.slot}, locked` : `Swap ${me?.name ?? "empty"} at ${s.slot}`}>
                <Who p={me} side="you" />
                {me ? <PtsCell id={me.id} g={gameNow(live, me.id, me.nfl)} proj={proj(me.id)} cls="lu-pts mu-pts" /> : <span className="mu-pts">0.0</span>}
                {lock && <span className="mu-lockic" aria-hidden="true"><Icon name="lock" size={12} /></span>}
              </button>
              <span className={`mu-edge ${e > 0 ? "up" : e < 0 ? "down" : ""}`}>{e === 0 ? "even" : fmt(e)}</span>
              <span className={`mu-theirs${rowCls(them)}`}><Who p={them} side="them" />{them ? <PtsCell id={them.id} g={gameNow(live, them.id, them.nfl)} proj={proj(them.id)} cls="lu-pts mu-pts" them /> : <span className="mu-pts">0.0</span>}</span>
              {open === i && (
                <SwapPicker menuRef={swapEl} title={`Swap in at ${s.slot}`} empty={`No bench player can play ${s.slot}.`}
                  options={options.map((p) => {
                    // A bench player whose game already started can't come in: dimmed, marked Locked, and a tap says why
                    const d = eff(p, true) - pts(s.id);
                    return { key: p.id, who: <Who p={p} side="you" />, name: p.name, pts: eff(p, true), delta: round1(d), up: d >= 0, lock: candidateLock(p), onPick: (from: Element) => swap(i, p.id, from) };
                  })} />
              )}
            </div>
          );
        })}
        {myK.map((x, i) => {
          // Kickers and defenses follow the starters' rules: locked from kickoff, swappable before it for another K
          // or DEF on your roster, through the same menu
          const them = oppK[i] ?? null, e = kEdges[i], idx = mine.length + i, me = x.player;
          const lock = starterLock(me);
          const options = benchK.filter((p) => p.pos === x.slot).sort((a, b) => spPts(live, b) - spPts(live, a));
          return (
            <div key={`k-${i}`} className={`mu-row${open === idx ? " open" : ""}`}>
              <span className="mu-slot">{x.slot}</span>
              <button className={`mu-mine${spCls(me)}${lock ? " is-locked" : ""}`} aria-disabled={lock ? true : undefined} onClick={tapStarter(idx, lock)}
                aria-expanded={lock ? undefined : open === idx} aria-label={lock ? `${me?.name ?? "Empty"} at ${x.slot}, locked` : `Swap ${me?.name ?? "empty"} at ${x.slot}`}>
                <SpecialWho p={x.player} suggested={x.suggested} side="you" />{me ? <PtsCell id={me.id} g={gameNow(live, me.id, me.nfl)} proj={specialPts(me)} cls="lu-pts mu-pts" /> : <span className="mu-pts">0.0</span>}
                {lock && <span className="mu-lockic" aria-hidden="true"><Icon name="lock" size={12} /></span>}
              </button>
              <span className={`mu-edge ${e > 0 ? "up" : e < 0 ? "down" : ""}`}>{e === 0 ? "even" : fmt(e)}</span>
              <span className={`mu-theirs${spCls(them?.player ?? null)}`}><SpecialWho p={them?.player ?? null} suggested={them?.suggested} side="them" />{them?.player ? <PtsCell id={them.player.id} g={gameNow(live, them.player.id, them.player.nfl)} proj={specialPts(them.player)} cls="lu-pts mu-pts" them /> : <span className="mu-pts">0.0</span>}</span>
              {open === idx && (
                <SwapPicker menuRef={swapEl} title={`Swap in at ${x.slot}`} empty={`No other ${x.slot === "DEF" ? "defense" : "kicker"} on your roster.`}
                  options={options.map((p) => {
                    const d = round1(spPts(live, p) - spPts(live, me));
                    return { key: p.id, who: <SpecialWho p={p} side="you" />, name: p.name, pts: spPts(live, p), delta: d, up: d >= 0, lock: candidateLock(p), onPick: (from: Element) => swapK(i, p, from) };
                  })} />
              )}
            </div>
          );
        })}
        <div className="mu-foot">
          <span>{allLocked ? (pastWeek ? `Week ${WEEK} is final. Lineups are locked.` : "Every starter's game has kicked off. Lineups are locked.") : "Tap any of your players to try a swap."}</span>
          {bestGain > 0 && !allLocked && <button className="btn btn-sm" onClick={useBest}>Use best lineup {fmt(bestGain)}</button>}
        </div>
      </section>
    </>
  );
}

/** Points for one side of a row in another week. Out here so a re-render doesn't mount it again. */
function Num({ x, past }: { x: Slot; past: boolean }) {
  return x.p?.pts === null ? <span className="lu-pts mu-pts bye">BYE</span> : <span className={`lu-pts mu-pts${past ? " actual" : ""}`}>{(x.p?.pts ?? 0).toFixed(1)}</span>;
}

function WeekMatchup({ week, onBack, stepper }: { week: number; onBack?: () => void; stepper: ReactNode }) {
  // A week ahead takes the shared what-if (lineupWhatIf), so a swap tried on Lineup shows here and the other way round
  const { m, raw, err, wi } = useWeekWhatIf(week);
  const future = m?.kind === "future";
  const { open, setOpen, menuRef } = useSwapMenu<number>();
  useEffect(() => setOpen(null), [week]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // A past week is final (winner bright, loser dimmed); a week ahead is projections only, so both stay bright
  const wkTone = scoreTone(m.me.total, opp.total, past ? "final" : "pre");
  return (
    <>
      {back}{stepper}
      <section className="card mu" aria-label={`Week ${week} matchup`}>
        <FaceOff week={week} state={past ? "final" : "pre"} chance={chance} res={res} flat
          label={`${wi.changed && !past ? "Your what-if" : "You"} ${m.me.total.toFixed(1)}, ${opp.team.name} ${opp.total.toFixed(1)}. ${res ? `Final, ${res.short}` : `Projected, ${chance} percent to win`}`}
          you={{ t: YOU, pts: m.me.total, dim: wkTone === "trail", note: !past && wi.changed ? "what-if" : undefined }}
          them={{ t: opp.team, pts: opp.total, dim: flipTone(wkTone) === "trail" }} />
        <p className="mu-sum">{res ? <>{res.long}, <span className={`sc-res ${res.tone}`}>{res.short.charAt(0).toLowerCase()}{res.short.slice(1)}</span>. You won <b>{winning} of {n}</b> spots.</>
          : <>Projected to win <b>{winning} of {n}</b> spots. Both sides use Sleeper's Week {week} projections.</>}</p>
        {wi.changed && (
          <div className="mu-whatif">
            <span><b>What-if lineup</b>{fmt(round1(m.me.total - (raw?.me.total ?? 0)))} pts vs your best projected lineup. Set it in Sleeper before Week {week} locks.</span>
            <div className="mu-wbtn">
              <button className="btn btn-sm" onClick={(e: { currentTarget: Element }) => { wi.reset(); setOpen(null, e.currentTarget); }}>Reset</button>
              <a className="btn btn-sm btn-primary" href={sleeperUrl()} target="_blank" rel="noreferrer"><PlatformLogo size={16} />Open Sleeper</a>
            </div>
          </div>
        )}
        <div className="mu-th"><span>Slot</span><span>You, then {opp.team.manager}</span><span className="mu-th-you">You</span><span className="mu-th-them">{opp.team.manager}</span></div>
        {Array.from({ length: n }, (_, i) => {
          const a = at(m.me.starters, i), b = at(opp.starters, i), e = edges[i];
          const options = future && i < wi.starters.length ? wi.bench.filter((p) => wi.fitsAt(i, p.pos)) : [];
          return (
            <div key={i} className={`mu-row${open === i ? " open" : ""}`}>
              <span className="mu-slot">{a.slot || b.slot}</span>
              {past ? <button className="mu-mine is-locked mu-past" aria-disabled="true" aria-label={`${a.p?.name ?? "Empty"} at ${a.slot || b.slot}, locked`} onClick={denyOn(`Week ${week} is over. Lineups can't change.`)}><WeekWho p={a.p} side="you" week={week} suggested={a.suggested} /><Num x={a} past={past} /><span className="mu-lockic" aria-hidden="true"><Icon name="lock" size={12} /></span></button>
                : future && i < wi.starters.length ? <button className="mu-mine" aria-expanded={open === i} aria-label={`Swap ${a.p?.name ?? "empty"} at ${a.slot}`}
                  onClick={(ev: { currentTarget: Element }) => setOpen(open === i ? null : i, ev.currentTarget)}><WeekWho p={a.p} side="you" week={week} suggested={a.suggested} /><Num x={a} past={past} /></button>
                : <span className="mu-mine"><WeekWho p={a.p} side="you" week={week} suggested={a.suggested} /><Num x={a} past={past} /></span>}
              <span className={`mu-edge ${e > 0 ? "up" : e < 0 ? "down" : ""}`}>{e === 0 ? "even" : fmt(e)}</span>
              <span className="mu-theirs"><WeekWho p={b.p} side="them" week={week} suggested={b.suggested} /><Num x={b} past={past} /></span>
              {open === i && (
                <SwapPicker menuRef={menuRef} title={`Swap in at ${a.slot}`} empty={`No bench player can play ${a.slot}.`}
                  options={options.map((p) => {
                    const d = (p.pts ?? 0) - pts(a);
                    return { key: p.id, who: <WeekWho p={p} side="you" week={week} />, name: p.name, pts: p.pts ?? 0, delta: round1(d), up: d >= 0, lock: null, ...weekBye(p, week),
                      onPick: (from: Element) => { wi.swap(i, p.id); setOpen(null, from); } };
                  })} />
              )}
            </div>
          );
        })}
        <div className="mu-foot"><span>{past ? `Week ${week} final, from Sleeper.` : wi.changed ? `Your what-if against ${opp.team.manager}'s best projected starters for Week ${week}.` : `Lineups set to each side's best projected starters for Week ${week}. Tap yours to try a swap.`}</span></div>
      </section>
    </>
  );
}
