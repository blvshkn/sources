import { useEffect, useState } from "react";
import { LeagueSwitch } from "./LeagueSwitch";
import { WeekView, loadWeek, lastWeek } from "../weeks";
import { Live, useLive } from "../live";
import { LEAGUE, OPPONENT_ID, SpecialPlayer, gameLine, teamById, MyTag, TEAMS, YOU, ManagerTag, playerById, Player, onBye, SLOT_HISTORY, DEADLINES, WEEK, sleeperUrl } from "../data";
import { irReport, irLabel, lineupFor, specialLineup, specialPts, Lineup, Price, DEFAULT_PRICE, Trade, eff, isOut, sleeperDiff, suggestTags, weakSlots, whatItWouldTake, fmt } from "../engine";
import { AiLabel, Delta, Icon, IconName, Seg, Stamp, StatusPill, useSticky, PageTabs, LiveNum } from "./ui";
import { Avatar } from "./Avatar";
import { StartSit } from "./StartSit";
import { PlayerSheet } from "./PlayerSheet";

const TAG_LABEL: Record<MyTag, string> = {
  available: "Trade bait",
  shopping: "Shopping",
  untouchable: "Untouchable",
  amazing: "Overpay only",
};
// Standard normal CDF, for a win chance from two projections
const phi = (x: number) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp(-x * x / 2); const q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - q : q; };
const ringOf = (p: Player): "bad" | "warn" | undefined => (onBye(p.nfl) || p.status === "O" ? "bad" : p.status === "Q" ? "warn" : undefined);
/** "Questionable, Groin" becomes "Groin". */
export const injuryDetail = (p: Player) => (p.note ?? "").replace(/^(Questionable|Doubtful|Out|IR|PUP|Sus|NA|DNR|COV)\b,?\s*/i, "") || (p.status === "O" ? "Out" : "Game-time decision");
const statusWord = (p: Player) => (onBye(p.nfl) ? "Bye" : p.status === "O" ? "Out" : p.status === "Q" ? "Questionable" : null);

/** IR and taxi: players who don't count against your roster limit, plus anything that needs a move. */
function IrBlock() {
  const ir = irReport(YOU);
  const taxi = (YOU.taxi ?? []).map(playerById);
  if (!ir.slots && !ir.used.length && !taxi.length) return null;
  return (
    <>
      <div className="lu-list-head sub"><b>Injured reserve</b><span className="tiny muted">{ir.used.length} of {ir.slots} · off your {LEAGUE.rosterMax}-man limit</span></div>
      {ir.used.map((p) => {
        const stuck = !p.irEligible;
        const detail = injuryDetail(p);
        return (
          <div key={p.id} className={`lu-row ir-row${stuck ? " ir-stuck" : ""}`}>
            <span className="lu-slot">IR</span>
            <Avatar p={p} size={36} />
            <span className="lu-who">
              <span className="lu-name">{p.name}</span>
              <span className="lu-meta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b><span>{p.nfl}</span><b className={`lu-st ${stuck ? "warn" : "bad"}`}>{stuck ? "No longer qualifies" : `${irLabel(p)}${detail && detail !== "Out" ? `, ${detail}` : ""}`}</b></span>
            </span>
            {stuck ? <a className="btn btn-xs" href={sleeperUrl()} target="_blank" rel="noreferrer">Activate</a> : <span className="lu-pts dim">{(p.proj || 0).toFixed(1)}</span>}
          </div>
        );
      })}
      {Array.from({ length: ir.open }).map((_, i) => (
        <div key={`open-${i}`} className="lu-row ir-row ir-open">
          <span className="lu-slot">IR</span>
          <span className="ir-empty" aria-hidden="true" />
          <span className="lu-who">
            <span className="lu-name muted">Open spot</span>
            <span className="lu-meta wrap">{ir.moveIn[i] ? `${ir.moveIn[i].name} is IR-eligible. Moving him opens a bench spot.` : "No one on your roster is IR-eligible right now."}</span>
          </span>
          {ir.moveIn[i] ? <a className="btn btn-xs" href={sleeperUrl()} target="_blank" rel="noreferrer">Move</a> : <span />}
        </div>
      ))}
      {taxi.length > 0 && (
        <>
          <div className="lu-list-head sub"><b>Taxi squad</b><span className="tiny muted">{taxi.length} of {LEAGUE.taxiSlots}</span></div>
          {taxi.map((p) => <LineupRow key={p.id} p={p} slot="TX" bench />)}
        </>
      )}
    </>
  );
}

const SLOT_LABEL: Record<string, string> = { FLEX: "W/R/T", SF: "SFLX", BN: "BN", IR: "IR", TX: "TAXI" };

/** One lineup row, Sleeper style: slot pill, jersey, name, projection. Shows the change to make if Sleeper differs. */
type GameNow = { state: "pre_game" | "in_game" | "complete" | null; pts: number };
const gameNow = (live: Live | undefined, id: string, nfl: string): GameNow => ({ state: live?.games[nfl] ?? null, pts: live?.points[id] ?? 0 });

/** Points column: projection before kickoff, live points (with the projection beneath) during the game, final after. */
function PtsCell({ g, proj }: { g: GameNow; proj: number }) {
  if (g.state === "in_game") return <span className="lu-pts live" aria-label={`${g.pts.toFixed(1)} points so far, projected ${proj.toFixed(1)}`}><b>{g.pts.toFixed(1)}</b><small>proj {proj.toFixed(1)}</small></span>;
  if (g.state === "complete") return <span className="lu-pts final" aria-label={`Final, ${g.pts.toFixed(1)} points`}><b>{g.pts.toFixed(1)}</b><small>proj {proj.toFixed(1)}</small></span>;
  return <span className="lu-pts">{proj.toFixed(1)}</span>;
}
/** Replaces the kickoff time once the game starts. */
function GameTag({ g, fallback }: { g: GameNow; fallback: string | null }) {
  if (g.state === "in_game") return <span className="lu-live"><i aria-hidden="true" />Live</span>;
  if (g.state === "complete") return <span className="lu-final">Final</span>;
  return fallback ? <span className="lu-game">{fallback}</span> : null;
}

function LineupRow({ p, slot, bench, swap, onOpen, live }: { p: Player; slot: string; bench?: boolean; swap?: { from: Player; gain: number }; onOpen?: (p: Player, where: string) => void; live?: Live }) {
  const st = statusWord(p);
  const g = gameNow(live, p.id, p.nfl);
  const where = bench ? "On your bench" : `Starting at ${SLOT_LABEL[slot] ?? slot}`;
  return (
    <div className={`lu-row${bench ? " bench" : ""}${swap ? " has-swap" : ""}${onOpen ? " tap" : ""}`} role={onOpen ? "button" : undefined} tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen ? () => onOpen(p, where) : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(p, where); } } : undefined}>
      <span className={`lu-slot s-${slot}`}>{SLOT_LABEL[slot] ?? slot}</span>
      <Avatar p={p} size={44} />
      <span className="lu-who">
        <span className="lu-name">{p.name}{st && st !== "Bye" && <b className={`lu-tag ${ringOf(p)}`}>{p.status === "Q" ? "Q" : "OUT"}</b>}</span>
        <span className="lu-meta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b><span>{p.nfl}</span>{!onBye(p.nfl) && <GameTag g={g} fallback={gameLine(p) || null} />}</span>
        {p.status && !onBye(p.nfl) && (g.state === null || g.state === "pre_game") && <span className={`lu-inj ${ringOf(p)}`}>{injuryDetail(p)}</span>}
      </span>
      {onBye(p.nfl) ? <span className="lu-pts bye">BYE</span> : <PtsCell g={g} proj={eff(p, true)} />}
      {swap && (
        <span className="lu-swap">
          <Icon name="trade" size={14} />
          <span>Sleeper has <b>{swap.from.name}</b>{onBye(swap.from.nfl) ? " (bye)" : isOut(swap.from, true) ? " (out)" : ""} here. Swap for <b className="good">+{swap.gain.toFixed(1)}</b>.</span>
        </span>
      )}
    </div>
  );
}

/** Kicker or defense row. Same layout as a skill player. */
function SpecialRow({ p, slot, bench, swapFrom, live }: { p: SpecialPlayer; slot: string; bench?: boolean; swapFrom?: SpecialPlayer; live?: Live }) {
  const bye = p.wk === null;
  const g = gameNow(live, p.id, p.nfl);
  const out = p.status === "O";
  return (
    <div className={`lu-row${bench ? " bench" : ""}${swapFrom ? " has-swap" : ""}`}>
      <span className={`lu-slot s-${slot}`}>{slot}</span>
      <Avatar p={p} size={44} />
      <span className="lu-who">
        <span className="lu-name">{p.name}{out && <b className="lu-tag bad">OUT</b>}</span>
        <span className="lu-meta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b><span>{p.nfl}</span>{!bye && <GameTag g={g} fallback={gameLine(p) || null} />}</span>
      </span>
      {bye ? <span className="lu-pts bye">BYE</span> : <PtsCell g={g} proj={specialPts(p)} />}
      {swapFrom && (
        <span className="lu-swap">
          <Icon name="trade" size={14} />
          <span>Sleeper has <b>{swapFrom.name}</b>{swapFrom.wk === null ? " (bye)" : ""} here. Swap for <b className="good">+{(specialPts(p) - specialPts(swapFrom)).toFixed(1)}</b>.</span>
        </span>
      )}
    </div>
  );
}

/** Any other week: past weeks show what you started and the stat lines, future weeks show projections. */
function WeekPanel({ v }: { v: WeekView }) {
  if (v.empty) return <p className="small muted" style={{ padding: "4px 16px 18px" }}>{v.empty}</p>;
  const row = (p: WeekView["bench"][number], slot: string, bench?: boolean) => (
    <div key={`${slot}-${p.id}`} className={`lu-row${bench ? " bench" : ""}`}>
      <span className={`lu-slot s-${slot}`}>{SLOT_LABEL[slot] ?? slot}</span>
      <Avatar p={p} size={40} text={p.pos === "DEF" ? p.nfl : undefined} />
      <span className="lu-who">
        <span className="lu-name">{p.name}</span>
        <span className="lu-meta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b>{p.pos === "DEF" ? "Team defense" : p.nfl}</span>
        {p.line && p.pts !== null && <span className="lu-line">{p.line}</span>}
      </span>
      {p.pts === null ? <span className="lu-pts bye">BYE</span> : <span className={`lu-pts${v.kind === "past" ? " actual" : ""}`}>{p.pts.toFixed(1)}</span>}
    </div>
  );
  return (
    <>
      <div className="lu-week-sum">
        <span><i>{v.kind === "past" ? "You scored" : "Best lineup projects"}</i><b>{v.total.toFixed(1)}</b></span>
        {v.oppTotal !== undefined && <span className="r"><i>{v.oppName ?? "Opponent"}</i><b className="dim">{v.oppTotal.toFixed(1)}</b></span>}
        {v.oppTotal !== undefined && <span className={`lu-result ${v.total >= v.oppTotal ? "w" : "l"}`}>{v.total >= v.oppTotal ? "W" : "L"}</span>}
      </div>
      <div className="lu-list-head"><b>{v.kind === "past" ? "Started" : "Starters"}</b><span className="tiny muted">{v.kind === "past" ? "Pts" : "Proj"}</span></div>
      {v.starters.map((x, i) => x.p ? row(x.p, x.slot) : <div key={`e${i}`} className="lu-row"><span className={`lu-slot s-${x.slot}`}>{SLOT_LABEL[x.slot] ?? x.slot}</span><span className="ir-empty" aria-hidden="true" /><span className="lu-who"><span className="lu-name muted">Empty</span></span><span /></div>)}
      <div className="lu-list-head sub"><b>Bench</b><span className="tiny muted">{v.bench.length} players</span></div>
      {v.bench.map((p) => row(p, "BN", true))}
    </>
  );
}

function SlotReport({ lineup }: { lineup: Lineup }) {
  const max = Math.max(...SLOT_HISTORY.flatMap((h) => [...h.you, ...h.avg]));
  const weak = weakSlots();
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const rows = SLOT_HISTORY.map((h) => {
    const you = mean(h.you), lg = mean(h.avg), n = h.you.length, half = Math.max(1, Math.floor(n / 2));
    const now = lineup.slots.filter((x) => x.slot === h.slot && x.player).map((x) => x.player!) as Player[];
    return { h, you, lg, gap: you - lg, above: h.you.filter((v, i) => v >= h.avg[i]).length, n,
      best: Math.max(...h.you), worst: Math.min(...h.you), trend: mean(h.you.slice(-half)) - mean(h.you.slice(0, half)),
      now, nowProj: now.reduce((a, p) => a + eff(p, true), 0) };
  });
  const total = rows.reduce((a, r) => a + r.gap, 0);
  const ranked = [...rows].sort((a, b) => b.gap - a.gap);
  const weeks = SLOT_HISTORY[0]?.you.length ?? 0;
  return (
    <section className="card card-pad slot-report">
      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <h2 className="section-title">Slot report</h2>
        <span className="tiny muted">Weeks 1 to {weeks} · you vs league average</span>
      </div>
      {weak.length > 0 && (
        <p className="small"><Stamp>Per sources</Stamp> Your {weak[0].slot} slot came up short {weak[0].misses} of {weak[0].weeks} weeks ({fmt(weak[0].gap)} pts a week). Trade ideas target it.</p>
      )}
      <div className="slot-grid">
        {SLOT_HISTORY.map((h) => {
          const isWeak = weak.some((w) => w.slot === h.slot);
          return (
            <div key={h.slot} className={`slot-col${isWeak ? " weak" : ""}`}>
              <div className="slot-bars" role="img" aria-label={`${h.slot}: ${h.you.filter((v, i) => v >= h.avg[i]).length} of 6 weeks at or above average`}>
                {h.you.map((v, i) => (
                  <span key={i} className="sb">
                    <span className={`sb-you${v < h.avg[i] ? " under" : ""}`} style={{ height: `${(v / max) * 100}%` }} />
                    <span className="sb-avg" style={{ bottom: `${(h.avg[i] / max) * 100}%` }} />
                  </span>
                ))}
              </div>
              <span className="slot-name">{h.slot}</span>
            </div>
          );
        })}
      </div>
      <div className="legend"><span className="row"><span className="lg-sw you" />You</span><span className="row"><span className="lg-sw under" />Below avg</span><span className="row"><span className="lg-line" />League avg</span></div>

      {rows.length > 0 && <dl className="sr-sum">
        <div><dt>Vs league</dt><dd className={total >= 0 ? "up" : "down"}>{fmt(Math.round(total * 10) / 10)}</dd></div>
        <div><dt>Strongest</dt><dd>{ranked[0].h.slot}<small className="up">{fmt(Math.round(ranked[0].gap * 10) / 10)}</small></dd></div>
        <div><dt>Weakest</dt><dd>{ranked[ranked.length - 1].h.slot}<small className={ranked[ranked.length - 1].gap >= 0 ? "up" : "down"}>{fmt(Math.round(ranked[ranked.length - 1].gap * 10) / 10)}</small></dd></div>
      </dl>}

      <div className="sr-list">
        <div className="sr-list-head"><span>Slot</span><span>You</span><span>League</span><span>Beat avg</span></div>
        {rows.map((r) => {
          const isOpen = openSlot === r.h.slot;
          return (
            <div key={r.h.slot} className={`sr-row${isOpen ? " open" : ""}`}>
              <button className="sr-main" onClick={() => setOpenSlot(isOpen ? null : r.h.slot)} aria-expanded={isOpen}>
                <span className={`sr-slot${r.gap < 0 ? " down" : ""}`}>{r.h.slot}<small className={r.gap >= 0 ? "up" : "down"}>{fmt(Math.round(r.gap * 10) / 10)}</small></span>
                <span className="sr-num">{r.you.toFixed(1)}</span>
                <span className="sr-num muted">{r.lg.toFixed(1)}</span>
                <span className="sr-beat">{r.above}/{r.n}<i className={r.trend >= 0.5 ? "up" : r.trend <= -0.5 ? "down" : ""} aria-label={r.trend >= 0.5 ? "trending up" : r.trend <= -0.5 ? "trending down" : "steady"}>{r.trend >= 0.5 ? "↑" : r.trend <= -0.5 ? "↓" : "→"}</i></span>
                <Icon name="chev" size={14} />
              </button>
              {isOpen && (
                <div className="sr-detail">
                  <div className="sr-weeks">
                    {r.h.you.map((v, i) => (
                      <span key={i} className={v >= r.h.avg[i] ? "up" : "down"}><i>W{i + 1}</i><b>{v.toFixed(1)}</b><small>avg {r.h.avg[i].toFixed(1)}</small></span>
                    ))}
                  </div>
                  <p className="small muted">Best week {r.best.toFixed(1)}, worst {r.worst.toFixed(1)}. {r.trend >= 0.5 ? `Up ${r.trend.toFixed(1)} a week lately.` : r.trend <= -0.5 ? `Down ${Math.abs(r.trend).toFixed(1)} a week lately.` : "Holding steady."}</p>
                  {r.now.length > 0 && <div className="sr-now">
                    <span className="eyebrow">Starting this week</span>
                    {r.now.map((p) => <span key={p.id} className="sr-now-p"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b><span>{p.name}</span><span className="sr-num">{eff(p, true).toFixed(1)}</span></span>)}
                    <span className={`sr-now-vs ${r.nowProj >= r.lg ? "up" : "down"}`}>{r.nowProj.toFixed(1)} projected vs {r.lg.toFixed(1)} league average</span>
                  </div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** You vs this week's opponent: points scored once games start (projection as a footnote), win chance, Live tag. */
export function MatchupStrip({ onOpen }: { onOpen?: () => void }) {
  const live = useLive();
  const started = Object.values(live.games).some((x) => x === "in_game" || x === "complete");
  const nowLive = Object.values(live.games).some((x) => x === "in_game");
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  const myNow = live.teamPts[YOU.id], oppNow = opp ? live.teamPts[opp.id] : undefined;
  const inPlay = started && myNow !== undefined && (!opp || oppNow !== undefined);
  const oppTotal = opp ? lineupFor(opp.roster, true).total + specialLineup(opp).total : null;
  const myTotal = lineupFor(YOU.roster, true).total + specialLineup(YOU).total;
  const chance = oppTotal !== null ? Math.round(phi((myTotal - oppTotal) / 34) * 100) : 0;
  const body = (
    <div className="lu-mx" aria-label={`Your best lineup projects ${myTotal.toFixed(1)} points${opp ? `, ${opp.manager} projects ${oppTotal!.toFixed(1)}` : ""}`}>
      <div className="lu-mx-side you">
        <span className="lu-mx-who"><i /><span>{YOU.name}</span></span>
        {inPlay ? <>
          <LiveNum className="lu-mx-pts" v={myNow!} />
          <span className="lu-mx-proj">proj {myTotal.toFixed(1)}</span>
        </> : <>
          <span className="lu-mx-pts">{myTotal.toFixed(1)}</span>
          {oppTotal !== null && <span className={`margin-pill ${myTotal - oppTotal >= 0 ? "up" : "down"}`}>{myTotal - oppTotal >= 0 ? "+" : "−"}{Math.abs(myTotal - oppTotal).toFixed(1)}</span>}
          <small>Your best lineup</small>
        </>}
      </div>
      {opp && <>
        <div className="lu-mx-mid" aria-hidden="true">
          {inPlay && nowLive && <span className="lu-live"><i />Live</span>}
          <b>{chance}%</b><small>to win</small>
          <span className="lu-mx-bar"><i style={{ width: `${chance}%` }} /></span>
        </div>
        <div className="lu-mx-side them">
          <span className="lu-mx-who"><span>{opp.name}</span><i /></span>
          {inPlay ? <>
            <LiveNum className="lu-mx-pts" v={oppNow!} />
            <span className="lu-mx-proj">proj {oppTotal!.toFixed(1)}</span>
          </> : <>
            <span className="lu-mx-pts">{oppTotal!.toFixed(1)}</span>
            <small>{opp.manager}</small>
          </>}
        </div>
      </>}
    </div>
  );
  return onOpen ? <button className="lu-mx-open" onClick={onOpen} aria-label="Open this week's matchup">{body}</button> : body;
}

export function Roster({ lineup, myTags, setTag, prices, setPrice, tags, level, onPitch }: {
  lineup: Lineup;
  myTags: Record<string, MyTag>;
  setTag: (id: string, t: MyTag | "") => void;
  prices: Record<string, Price>;
  setPrice: (id: string, p: Price) => void;
  tags: ManagerTag[];
  level: string;
  onPitch: (t: Trade) => void;
}) {
  const s = lineup.slots.filter((x) => x.player) as { slot: string; player: Player }[];
  const by = (slot: string) => s.filter((x) => x.slot === slot);
  const flex = by("FLEX")[0];
  const bestBench = lineup.bench.filter((p) => p.pos !== "QB" && !isOut(p, true))[0];
  const closeCall = flex && bestBench && eff(flex.player, true) - eff(bestBench, true) < 1.5;
  const injured = s.filter((x) => x.player.status);
  const benchOut = lineup.bench.filter((p) => isOut(p, true));
  const locked = YOU.roster.filter((id) => myTags[id] === "amazing");
  const diff = sleeperDiff(lineup);
  const [sheet, setSheet] = useState<{ p: Player; where: string } | null>(null);
  const [cmp, setCmp] = useState<string | undefined>(undefined);
  const live = useLive();
  const started = Object.values(live.games).some((x) => x === "in_game" || x === "complete");
  const [view, setView] = useSticky<"lineup" | "compare" | "tags" | "price" | "slots">("roster.view", "lineup");
  const openPlayer = (p: Player, where: string) => setSheet({ p, where });
  const suggestions = level === "light" ? [] : suggestTags(lineup, myTags, tags);
  const kdef = specialLineup(YOU);
  const [week, setWeek] = useState(WEEK);
  const [wv, setWv] = useState<WeekView | null>(null);
  const [wErr, setWErr] = useState<string | null>(null);
  useEffect(() => {
    if (week === WEEK) { setWv(null); return; }
    let live = true;
    setWv(null); setWErr(null);
    loadWeek(week).then((v) => live && setWv(v)).catch(() => live && setWErr("Couldn't load that week from Sleeper. Try again in a minute."));
    return () => { live = false; };
  }, [week]);
  // A K/DEF swap is needed when Sleeper starts someone at that slot who isn't our pick
  const specialSwap = (p: SpecialPlayer) => {
    const setIds = LEAGUE.sleeperSpecial ?? [];
    if (!setIds.length || setIds.includes(p.id)) return undefined;
    const from = setIds.map((id) => LEAGUE.specials?.[id]).find((x) => x && x.pos === p.pos);
    return from && specialPts(p) - specialPts(from) >= 0.5 ? from : undefined;
  };
  const swapFor = (id: string) => { const d = diff.find((x) => x.start.id === id); return d ? { from: d.benched, gain: d.gain } : undefined; };
  const ir = irReport(YOU);
  const checks: { key: string; tone: "warn" | "bad" | "info"; icon: IconName; title: string; text: string }[] = [
    ...ir.mustActivate.map((p) => ({ key: `ira-${p.id}`, tone: "bad" as const, icon: "alert" as IconName, title: `Activate ${p.name} from IR`, text: "He no longer qualifies. Sleeper blocks adds and trades until he's moved." })),
    ...(ir.open > 0 && ir.moveIn[0] ? [{ key: "irm", tone: "info" as const, icon: "plug" as IconName, title: `Move ${ir.moveIn[0].name} to IR`, text: `Open IR spot. Frees a bench spot without a drop.` }] : []),
    ...injured.map((x) => ({ key: `inj-${x.player.id}`, tone: (x.player.status === "O" ? "bad" : "warn") as "bad" | "warn", icon: "alert" as IconName, title: `${x.player.name} is ${x.player.status === "O" ? "out" : "questionable"}`, text: `${injuryDetail(x.player)}. ${x.player.status === "O" ? "Swap him before lock." : "Check the inactives 90 minutes before kickoff."}` })),
    ...(closeCall ? [{ key: "flex", tone: "info" as const, icon: "trade" as IconName, title: "Close call at flex", text: `${flex.player.name} ${eff(flex.player, true).toFixed(1)} vs ${bestBench.name} ${eff(bestBench, true).toFixed(1)}. Under 1.5 pts apart, basically a coin flip.` }] : []),
    ...(benchOut.length ? [{ key: "bench", tone: "info" as const, icon: "roster" as IconName, title: "Thin bench this week", text: benchOut.map((p) => `${p.name} (${onBye(p.nfl) ? "bye" : "out"})`).join(", ") + "." }] : []),
  ];

  return (
    <>
      <header className="lu-hero">
        <div className="lu-hero-l">
          <LeagueSwitch title="Lineup" />
        </div>
        <MatchupStrip />
      </header>

      <PageTabs value={view} onChange={setView} options={[{ v: "lineup", label: "Lineup", icon: "helmet" }, { v: "compare", label: "Compare", icon: "switch" }, { v: "tags", label: "Tags", icon: "roster" }, { v: "price", label: "Asking price", icon: "lock" }, { v: "slots", label: "Slot report", icon: "values" }]} />

      {view === "lineup" && <div className="lu-grid">
        <div className="lu-col">
          {(
            <section className="card lu-list" aria-label="Starters and bench">
              <div className="lu-weeknav">
                <button className="btn btn-icon btn-sm" aria-label="Previous week" disabled={week <= 1} onClick={() => setWeek(week - 1)}><Icon name="chev" size={18} /></button>
                <span className="lu-weeknav-lbl"><b>Week {week}</b><span className="tiny muted">{week === WEEK ? "This week" : week < WEEK ? "Final" : "Projected"}</span></span>
                <button className="btn btn-icon btn-sm" aria-label="Next week" disabled={week >= lastWeek()} onClick={() => setWeek(week + 1)}><Icon name="chev" size={18} /></button>
              </div>
              {week !== WEEK ? (wErr ? <p className="small muted" style={{ padding: "4px 16px 18px" }}>{wErr}</p> : wv ? <WeekPanel v={wv} /> : <div className="lu-skel" aria-label={`Loading Week ${week}`}>{Array.from({ length: 6 }).map((_, i) => <span key={i} />)}</div>) : <>
              <div className={`ss${diff.length ? "" : " ok"}`} aria-label="Start and sit">
                <div className="ss-head">
                  <b>Start / Sit</b>
                  {diff.length > 0
                    ? <span className="ss-gain">{fmt(diff.reduce((a, d) => a + d.gain, 0))} pts</span>
                    : <span className="ss-ok"><Icon name="check" size={14} />Lineup set</span>}
                </div>
                {diff.length > 0 ? <>
                  {diff.map((d) => (
                    <div key={d.start.id} className="ss-move">
                      <div className="ss-p start"><span className="ss-tag">Start</span><Avatar p={d.start} size={32} /><span className="ss-n"><b>{d.start.name}</b><small>{d.start.pos} · {d.start.nfl}</small></span><span className="ss-pts">{eff(d.start, true).toFixed(1)}</span></div>
                      <div className="ss-p sit"><span className="ss-tag">Sit</span><Avatar p={d.benched} size={32} /><span className="ss-n"><b>{d.benched.name}</b><small>{d.benched.pos} · {d.benched.nfl}{onBye(d.benched.nfl) ? " · Bye" : ""}</small></span><span className="ss-pts">{eff(d.benched, true).toFixed(1)}</span></div>
                    </div>
                  ))}
                  <div className="ss-foot"><span>Make the {diff.length > 1 ? "swaps" : "swap"} in Sleeper. {DEADLINES.lock}.</span><a className="btn btn-sm" href={sleeperUrl()} target="_blank" rel="noreferrer">Open Sleeper</a></div>
                </> : <p className="ss-none">Your Sleeper lineup matches the optimal one.</p>}
              </div>
              <div className="lu-list-head"><span><b>Starters</b><span className="tiny muted lu-hint">Optimal lineup this week{diff.length ? ". Highlighted rows need a swap in Sleeper." : ". Matches Sleeper."}</span></span><span className="tiny muted">{started ? "Pts" : "Proj"}</span></div>
              {s.map((x) => <LineupRow key={x.player.id} p={x.player} slot={x.slot} swap={swapFor(x.player.id)} onOpen={openPlayer} live={live} />)}
              {kdef.slots.map((x, i) => x.player
                ? <SpecialRow key={x.player.id} p={x.player} slot={x.slot} swapFrom={specialSwap(x.player)} live={live} />
                : <div key={`empty-${x.slot}-${i}`} className="lu-row"><span className={`lu-slot s-${x.slot}`}>{x.slot}</span><span className="ir-empty" aria-hidden="true" /><span className="lu-who"><span className="lu-name muted">Empty</span><span className="lu-meta">Pick up a {x.slot === "K" ? "kicker" : "defense"} in Sleeper before lock.</span></span><span /></div>)}
              <div className="lu-list-head sub"><b>Bench</b><span className="tiny muted">{lineup.bench.length + kdef.bench.length} players</span></div>
              {lineup.bench.map((p) => <LineupRow key={p.id} p={p} slot="BN" bench onOpen={openPlayer} live={live} />)}
              {kdef.bench.map((p) => <SpecialRow key={p.id} p={p} slot="BN" bench live={live} />)}
              <IrBlock />
              </>}
            </section>
          )}
        </div>
        {checks.length > 0 && (
          <div className="lu-col">
            <section className="card lu-checks" aria-label="Before kickoff">
              <div className="lu-checks-head"><b>Before kickoff</b><span className="tiny muted">{DEADLINES.lock}</span></div>
              {checks.map((c) => (
                <div key={c.key} className="lu-check">
                  <span className={`lu-check-ic ${c.tone}`}><Icon name={c.icon} size={16} /></span>
                  <span className="lu-check-txt"><b>{c.title}</b><span>{c.text}</span></span>
                </div>
              ))}
              <div className="lu-checks-foot"><AiLabel /></div>
            </section>
          </div>
        )}
      </div>}

      {view === "compare" && <StartSit key={cmp ?? "default"} a={cmp ?? diff[0]?.start.id ?? flex?.player.id} b={cmp ? (cmp === (diff[0]?.start.id ?? flex?.player.id) ? (diff[0]?.benched.id ?? bestBench?.id) : (diff[0]?.start.id ?? flex?.player.id)) : (diff[0]?.benched.id ?? bestBench?.id)} />}
      {sheet && <PlayerSheet p={sheet.p} where={sheet.where} onClose={() => setSheet(null)}
        onCompare={() => { setCmp(sheet.p.id); setView("compare"); window.setTimeout(() => document.querySelector(".page-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); }} />}

      {view === "tags" && <div className="roster-grid">
        <section className="card" style={{ overflow: "hidden" }} aria-label="Your roster and tags">
          <div className="roster-head"><b>Roster tags</b><span className="tiny muted">Private to you</span></div>
          {suggestions.length > 0 && (
            <div className="suggest">
              <div className="row wrap" style={{ justifyContent: "space-between" }}><Stamp>Per sources</Stamp><AiLabel /></div>
              {suggestions.map((sg) => (
                <div key={sg.id} className="suggest-row">
                  <span className="small grow" style={{ minWidth: 0 }}>Tag <b>{playerById(sg.id).name}</b> as {TAG_LABEL[sg.tag].toLowerCase()}. <span className="muted">{sg.why}</span></span>
                  <button className="btn btn-xs" onClick={() => setTag(sg.id, sg.tag)}>Apply</button>
                </div>
              ))}
            </div>
          )}
          {YOU.roster.map((id) => {
            const p = playerById(id);
            const starting = s.find((x) => x.player.id === id);
            return (
              <div key={id} className="prow roster-row">
                <Avatar p={p} size={36} />
                <div style={{ minWidth: 0 }}>
                  <div className="pname">{p.name}</div>
                  <div className="pmeta">{p.pos} · {p.nfl}{!starting && " · Bench"} <StatusPill p={p} /></div>
                </div>
                <label htmlFor={`tag-${id}`} className="sr-only">Tag for {p.name}</label>
                <select id={`tag-${id}`} className="tag-select" value={myTags[id] ?? ""} onChange={(e) => setTag(id, e.target.value as MyTag | "")}>
                  <option value="">No tag</option>
                  {(Object.keys(TAG_LABEL) as MyTag[]).map((k) => <option key={k} value={k}>{TAG_LABEL[k]}</option>)}
                </select>
              </div>
            );
          })}
        </section>
      </div>}

      {view === "price" && <section className="card wt" aria-labelledby="wt-title">
        <header className="wt-head">
          <h2 className="section-title" id="wt-title">What would it take?</h2>
          <p>Set an asking price for your overpay-only guys. Sources finds the cheapest offer from each team that meets it.</p>
        </header>
        {locked.length === 0 && <p className="wt-empty">No one tagged "Overpay only" yet. <button className="linkish" onClick={() => setView("tags")}>Tag a player</button> to set an asking price.</p>}
        {locked.map((pid) => {
          const p = playerById(pid);
          const price = prices[pid] ?? DEFAULT_PRICE;
          const offers = TEAMS.filter((t) => !t.you).map((t) => ({ t, o: whatItWouldTake(YOU, t, pid, tags, price) }));
          const real = offers.filter((x) => x.o).sort((a, b) => a.o!.youDelta - b.o!.youDelta);
          const none = offers.filter((x) => !x.o);
          const pts = price.mode === "pts";
          const [min, max, step] = pts ? [0.5, 6, 0.5] : [5, 60, 5];
          const fill = ((price.amount - min) / (max - min)) * 100;
          return (
            <div key={pid} className="wt-player">
              <div className="wt-who">
                <Avatar p={p} size={40} />
                <span className="wt-name"><b>{p.name}</b><small>{p.pos} · {p.nfl}</small></span>
                <span className={`wt-count${real.length ? " on" : ""}`}><b>{real.length}</b> of {TEAMS.length - 1} teams</span>
              </div>

              <div className="wt-price">
                <div className="wt-price-top">
                  <label htmlFor={`bar-${pid}`}>Your price</label>
                  <Seg label="Price type" value={price.mode} onChange={(m) => setPrice(pid, { mode: m, amount: m === "pts" ? 3 : 25 })}
                    options={[{ v: "pts", label: "Points" }, { v: "pct", label: "% value" }]} />
                </div>
                <output className="wt-readout" htmlFor={`bar-${pid}`}>
                  {pts ? <>+{price.amount.toFixed(1)}<small> pts a week</small></> : <>+{price.amount}%<small> over value</small></>}
                </output>
                <input id={`bar-${pid}`} className="wt-range" type="range" min={min} max={max} step={step} value={price.amount}
                  style={{ background: `linear-gradient(90deg, rgb(var(--tab-rgb)) ${fill}%, var(--surface-3) ${fill}%)` }}
                  onChange={(e) => setPrice(pid, { mode: price.mode, amount: Number(e.target.value) })} />
                <div className="wt-scale" aria-hidden="true"><span>{pts ? "+0.5" : "+5%"}</span><span>{pts ? "+6" : "+60%"}</span></div>
                <p className="wt-note">{pts ? `Only moves if the deal adds at least ${price.amount.toFixed(1)} pts a week to your lineup.` : `Only moves if the return beats his value by ${price.amount}% without lowering your lineup.`}</p>
              </div>

              {real.length > 0 ? (
                <ul className="wt-offers">
                  {real.map(({ t, o }) => (
                    <li key={t.id} className="wt-offer">
                      <span className="wt-from">{t.manager} sends</span>
                      <ul className="wt-gets">
                        {o!.get.map((id) => { const g = playerById(id); return (
                          <li key={id}><Avatar p={g} size={32} /><span><b>{g.name}</b><small>{g.pos} · {g.nfl}</small></span></li>
                        ); })}
                      </ul>
                      <dl className="ti-stats wt-stats">
                        <div className="ti-stat"><dt>You gain</dt><dd><Delta n={o!.youDelta} /><small>/wk</small></dd></div>
                        <div className="ti-stat"><dt>They gain</dt><dd><Delta n={o!.themDelta} /><small>/wk</small></dd></div>
                      </dl>
                      <button className="btn btn-primary btn-sm ti-btn" onClick={() => onPitch(o!)}><Icon name="pen" size={15} />Write pitch to {t.manager}</button>
                    </li>
                  ))}
                </ul>
              ) : <p className="wt-empty">No one can meet that price. Lower it to see offers.</p>}

              {none.length > 0 && (
                <details className="wt-none">
                  <summary>{none.length} {none.length === 1 ? "team" : "teams"} can't get there<Icon name="chev" size={14} /></summary>
                  <p>{none.map((x) => x.t.name).join(", ")}</p>
                </details>
              )}
            </div>
          );
        })}
      </section>}

      {view === "slots" && <SlotReport lineup={lineup} />}
    </>
  );
}
