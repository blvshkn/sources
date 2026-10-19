import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { LeagueSwitch } from "./LeagueSwitch";
import { WeekView, loadWeek } from "../weeks";
import { WeekStepper } from "./WeekStepper";
import { Live, useLive, onPace, teamOutlook, winChance, playCount, PlayCount as Counts } from "../live";
import { LEAGUE, OPPONENT_ID, Team, SpecialPlayer, gameLine, teamById, MyTag, TEAMS, YOU, ManagerTag, playerById, Player, onBye, SLOT_HISTORY, DEADLINES, WEEK, sleeperUrl } from "../data";
import { irReport, irLabel, specialLineup, specialPts, Lineup, Price, DEFAULT_PRICE, Trade, eff, isOut, sleeperDiff, suggestTags, weakSlots, whatItWouldTake, fmt } from "../engine";
import { AiLabel, Delta, Icon, IconName, Seg, Stamp, StatusPill, useSticky, PageTabs, LiveNum } from "./ui";
import { Avatar } from "./Avatar";
import { TeamAvatar } from "./TeamPicker";
import { StartSit } from "./StartSit";
import { PlayerSheet } from "./PlayerSheet";
import { PlatformLogo } from "./PlatformLogo";

const TAG_LABEL: Record<MyTag, string> = {
  available: "Trade bait",
  shopping: "Shopping",
  untouchable: "Untouchable",
  amazing: "Overpay only",
};
// Standard normal CDF, for a win chance from two projections
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
type GameNow = { state: "pre_game" | "in_game" | "complete" | null; pts: number; left?: number };
/** A player's game right now. If his points haven't come in yet, treat it as not started so we show the projection, not a fake zero. */
export const gameNow = (live: Live | undefined, id: string, nfl: string): GameNow => {
  const pts = live?.points[id];
  return { state: pts === undefined ? null : live?.games[nfl] ?? null, pts: pts ?? 0, left: live?.left?.[nfl] };
};

/** Points column: projection before kickoff, live points (with the projection beneath) during the game, final after. */
/** Live only, the way Sleeper reads it: on fire once he's past his projection, heating up when he's on pace to pass
 *  it, cold when he's on pace to finish more than 15 percent short. Pace needs the game clock; without it, no read.
 *  Once the game is final there's no effect, just what he scored against what he was projected. */
export const heatOf = (pts: number, proj: number, pace: number | null): "fire" | "heating" | "cold" | null =>
  pts >= proj && proj > 0 ? "fire" : pace === null || proj <= 0 ? null : pace >= proj ? "heating" : pace < proj * 0.85 ? "cold" : null;

/** Small marks drawn in the logo's line family: rising heat lines and an ice crystal. */
export const HeatMark = ({ heat }: { heat: "fire" | "heating" | "cold" }) => heat === "fire" ? <Flame /> : heat === "heating" ? (
  <svg className="heatwave" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="#FFB547" strokeWidth="2" strokeLinecap="round">
    <path d="M7 20c-1.5-2 1.5-4 0-6s1.5-4 0-6" /><path d="M12 20c-1.5-2 1.5-4 0-6s1.5-4 0-6" /><path d="M17 20c-1.5-2 1.5-4 0-6s1.5-4 0-6" />
  </svg>
) : (
  <svg className="ice" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="#9AD8FF" strokeWidth="1.8" strokeLinecap="round">
    <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" /><path d="M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />
  </svg>
);

/** A small flame, drawn in the logo's line family, that flickers while a player is heating up. */
export const Flame = () => (
  <svg className="flame" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <defs><linearGradient id="flame-g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#FF5A36" /><stop offset="0.6" stopColor="#FF9A3D" /><stop offset="1" stopColor="#FFD166" /></linearGradient></defs>
    <path className="flame-outer" d="M12 22c-4.1 0-7-2.8-7-6.6 0-3.1 1.9-5.2 3.6-7 .4 1.7 1.3 2.8 2.4 3.3C11 7.6 12.6 4.6 15.4 2c-.3 3.4 1 5.6 2.4 7.6 1.1 1.6 1.7 3.4 1.2 5.8C18.4 19.5 15.5 22 12 22z" fill="url(#flame-g)" />
    <path className="flame-inner" d="M12 20.5c-1.9 0-3.2-1.3-3.2-3 0-1.6 1.1-2.7 2.1-3.6.2 1 .7 1.6 1.4 1.8.1-1.6.9-3 2.1-4.1-.1 1.6.6 2.7 1.1 3.6.5.8.6 1.6.4 2.6-.3 1.6-1.9 2.7-3.9 2.7z" fill="#FFE8A3" />
  </svg>
);

/** Players whose game was live while you had the app open, and finals that have already stamped. */
const wasLive = new Set<string>(), stamped = new Set<string>();
export const markLive = (id: string) => wasLive.add(id);

/** A final score set in stone: the number sits engraved on a small slab. If you watched the game go final, it stamps
 *  down once; finals that were already final when you opened the app just sit there, and tab switches never replay it. */
export function FinalPts({ id, pts, proj, cls }: { id: string; pts: number; proj: number; cls: string }) {
  const stamp = useRef(wasLive.has(id) && !stamped.has(id));
  if (stamp.current) stamped.add(id);
  return (
    <span className={`${cls} final cemented${stamp.current ? " stamp" : ""}`} aria-label={`Final, ${pts.toFixed(1)} points, projected ${proj.toFixed(1)}`}>
      <b>{pts.toFixed(1)}</b><small>{proj.toFixed(1)}</small>
    </span>
  );
}

/** `them`: an opponent's player, where beating his projection is bad for you, so the pace color flips. */
export function PtsCell({ id, g, proj, cls = "lu-pts", them = false }: { id: string; g: GameNow; proj: number; cls?: string; them?: boolean }) {
  if (g.state === "in_game") {
    markLive(id);
    const pace = onPace(g.pts, proj, g.left), heat = heatOf(g.pts, proj, pace);
    const note = heat === "fire" ? ", past his projection" : heat === "heating" ? ", on pace to beat his projection" : heat === "cold" ? ", on pace to fall short" : "";
    return (
      <span className={`${cls} live${heat ? ` heat-${heat}` : ""}`} aria-label={`${g.pts.toFixed(1)} points so far${pace !== null ? `, on pace for ${pace.toFixed(1)}` : ""}, projected ${proj.toFixed(1)}${note}`}>
        <b>{heat && <HeatMark heat={heat} />}{g.pts.toFixed(1)}</b>
        {pace !== null ? <small className={`lu-pace ${(pace >= proj) !== them ? "up" : "down"}`}>{pace.toFixed(1)}</small> : <small>proj {proj.toFixed(1)}</small>}
      </span>
    );
  }
  if (g.state === "complete") return <FinalPts id={id} pts={g.pts} proj={proj} cls={cls} />;
  return <span className={cls}>{proj.toFixed(1)}</span>;
}
/** Row state for scanning on game day: finished rows fade back, live rows get an accent edge. */
export const playCls = (g: GameNow, bye?: boolean) => (bye || g.state === "complete" ? " is-done" : g.state === "in_game" ? " is-live" : "");

/** "2 live · 4 to play · 3 done" for a set of starters. */
export function PlayCount({ c, compact }: { c: Counts; compact?: boolean }) {
  if (compact) return (
    <span className="pc pc-compact" aria-label={`${c.left} to play, ${c.live} playing now`}>
      <span className={c.live ? "pc-live" : "pc-left"}>{c.live > 0 && <i aria-hidden="true" />}{c.left + c.live} left{c.live > 0 ? `, ${c.live} live` : ""}</span>
    </span>
  );
  return (
    <span className={`pc${compact ? " pc-compact" : ""}`} aria-label={`${c.left} to play, ${c.live} playing now, ${c.done} done`}>
      {c.live > 0 && <span className="pc-live"><i aria-hidden="true" />{c.live} live</span>}
      <span className="pc-left"><b>{c.left}</b> to play</span>
      {!compact && <span className="pc-done">{c.done} done</span>}
    </span>
  );
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
    <div className={`lu-row${bench ? " bench" : ""}${swap ? " has-swap" : ""}${onOpen ? " tap" : ""}${playCls(g, onBye(p.nfl))}`} role={onOpen ? "button" : undefined} tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen ? () => onOpen(p, where) : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(p, where); } } : undefined}>
      <span className={`lu-slot s-${slot}`}>{SLOT_LABEL[slot] ?? slot}</span>
      <Avatar p={p} size={44} />
      <span className="lu-who">
        <span className="lu-name">{p.name}{st && st !== "Bye" && <b className={`lu-tag ${ringOf(p)}`}>{p.status === "Q" ? "Q" : "OUT"}</b>}</span>
        <span className="lu-meta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b><span>{p.nfl}</span>{!onBye(p.nfl) && <GameTag g={g} fallback={gameLine(p) || null} />}</span>
        {p.status && !onBye(p.nfl) && (g.state === null || g.state === "pre_game") && <span className={`lu-inj ${ringOf(p)}`}>{injuryDetail(p)}</span>}
      </span>
      {onBye(p.nfl) ? <span className="lu-pts bye">BYE</span> : <PtsCell id={p.id} g={g} proj={eff(p, true)} />}
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
    <div className={`lu-row${bench ? " bench" : ""}${swapFrom ? " has-swap" : ""}${playCls(g, bye)}`}>
      <span className={`lu-slot s-${slot}`}>{slot}</span>
      <Avatar p={p} size={44} />
      <span className="lu-who">
        <span className="lu-name">{p.name}{out && <b className="lu-tag bad">OUT</b>}</span>
        <span className="lu-meta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b><span>{p.nfl}</span>{!bye && <GameTag g={g} fallback={gameLine(p) || null} />}</span>
      </span>
      {bye ? <span className="lu-pts bye">BYE</span> : <PtsCell id={p.id} g={g} proj={specialPts(p)} />}
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

/** Slot report in brief, beside the lineup: where you come up short and how often. */
function SlotGlance({ onOpen }: { onOpen: () => void }) {
  const weak = weakSlots().slice(0, 3);
  return (
    <section className="card wk lu-glance" aria-label="Slot report in brief">
      <div className="wk-head"><h2 className="section-title">Slot report</h2><span className="tiny muted">You vs league average</span></div>
      {weak.length ? weak.map((w) => (
        <div key={w.slot} className="wk-row lu-glance-row">
          <b className="lu-glance-slot">{w.slot}</b>
          <span className="wk-name">Short {w.misses} of {w.weeks} weeks<small>Trade ideas target it</small></span>
          <span className="lu-glance-gap down">{fmt(w.gap)}</span>
        </div>
      )) : <p className="small muted">Every slot is at or above the league average.</p>}
      <button className="btn btn-sm lu-glance-btn" onClick={onOpen}>Open slot report<Icon name="chev" size={14} /></button>
    </section>
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
      best: Math.max(...h.you), worst: Math.min(...h.you), trend: (() => { const g = h.you.map((v, i) => v - h.avg[i]); return mean(g.slice(-half)) - mean(g.slice(0, half)); })(),
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
                  <span key={i} className="sb" style={{ ["--i" as string]: i }}>
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
      <div className="legend"><span className="row"><span className="lg-sw you" />At or above avg</span><span className="row"><span className="lg-sw under" />Below avg</span><span className="row"><span className="lg-line" />League avg</span></div>

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
                <span className={`sr-beat ${r.above * 2 >= r.n ? "up" : "down"}`}>{r.above}/{r.n}</span>
                <Icon name="chev" size={14} />
              </button>
              {isOpen && (
                <div className="sr-detail">
                  <div className="sr-weeks">
                    {r.h.you.map((v, i) => (
                      <span key={i} className={v >= r.h.avg[i] ? "up" : "down"}><i>W{i + 1}</i><b>{v.toFixed(1)}</b><small>avg {r.h.avg[i].toFixed(1)}</small></span>
                    ))}
                  </div>
                  <p className="small muted">Best week {r.best.toFixed(1)}, worst {r.worst.toFixed(1)}.{" "}
                    {Math.abs(r.trend) < 0.5
                      ? "Holding steady against the league."
                      : <span className={r.trend > 0 ? "up" : "down"}>{r.trend > 0 ? "↑" : "↓"} {r.gap < 0
                          ? (r.trend > 0 ? `Closing the gap by ${r.trend.toFixed(1)} a week lately.` : `Falling ${Math.abs(r.trend).toFixed(1)} further behind a week lately.`)
                          : (r.trend > 0 ? `Lead growing by ${r.trend.toFixed(1)} a week lately.` : `Lead shrinking by ${Math.abs(r.trend).toFixed(1)} a week lately.`)}</span>}</p>
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
export function MatchupStrip({ onOpen, mineOnly = false }: { onOpen?: () => void; mineOnly?: boolean }) {
  const live = useLive();
  const started = Object.values(live.games).some((x) => x === "in_game" || x === "complete");
  const nowLive = Object.values(live.games).some((x) => x === "in_game");
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  const myNow = live.teamPts[YOU.id], oppNow = opp ? live.teamPts[opp.id] : undefined;
  const inPlay = started && myNow !== undefined && (!opp || oppNow !== undefined);
  // Sleeper's set lineups, K/DEF included; expected finishes and win chance move with the games
  const myO = teamOutlook(live, YOU), oppO = opp ? teamOutlook(live, opp) : null;
  const myTotal = myO.expected, oppTotal = oppO ? oppO.expected : null;
  const chance = oppO ? Math.round(winChance(myO, oppO)) : 0;
  if (mineOnly) {
    // Your week at a glance, like Sleeper's team card: who you are, where you stand, score and where it's headed
    const wins = (t: Team) => Number(t.record.split("-")[0]) || 0;
    const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
    const rank = [...TEAMS].sort((x, y) => wins(y) - wins(x) || y.pf - x.pf).findIndex((t) => t.id === YOU.id) + 1;
    const pfRank = [...TEAMS].sort((x, y) => y.pf - x.pf).findIndex((t) => t.id === YOU.id) + 1;
    return (
      <section className="mw" aria-label={`${YOU.name}, ${YOU.record}. ${inPlay ? `${myNow!.toFixed(1)} points, on pace for ${myTotal.toFixed(1)}` : `Projected ${myTotal.toFixed(1)}`}${opp ? `, ${chance} percent to win` : ""}`}>
        <div className="mw-top">
          <TeamAvatar t={YOU} size={44} />
          <span className="mw-id"><b>{YOU.name}</b><small>{YOU.record} · {ord(rank)} · PF {ord(pfRank)}</small></span>
          <span className="mw-score">
            {inPlay ? <LiveNum className="mw-pts" v={myNow!} /> : <span className="mw-pts">{myTotal.toFixed(1)}</span>}
            <small>{inPlay ? `proj ${myTotal.toFixed(1)}` : "projected"}</small>
          </span>
        </div>
        {opp && (
          <div className={`mw-win ${chance >= 55 ? "up" : chance <= 45 ? "down" : "even"}`} aria-hidden="true">
            {inPlay && nowLive && <span className="lu-live"><i />Live</span>}
            <b>{chance}%</b><span className="mw-lbl">to win</span>
            <span className="mw-bar"><i style={{ width: `${chance}%` }} /></span>
          </div>
        )}
      </section>
    );
  }
  const body = (
    <div className={`lu-mx${mineOnly ? " mine-only" : ""}`} aria-label={`${inPlay ? `You have ${myNow!.toFixed(1)} points, on pace for ${myTotal.toFixed(1)}` : `Your best lineup projects ${myTotal.toFixed(1)} points`}${opp ? `. ${chance} percent to win` : ""}`}>
      <div className="lu-mx-side you">
        <span className="lu-mx-who"><i /><span>{YOU.name}</span></span>
        {inPlay ? <>
          <LiveNum className="lu-mx-pts" v={myNow!} />
          <span className="lu-mx-proj">proj {myTotal.toFixed(1)}</span>
        </> : <>
          <span className="lu-mx-pts">{myTotal.toFixed(1)}</span>
          {oppTotal !== null && !mineOnly && <span className={`margin-pill ${myTotal - oppTotal >= 0.05 ? "up" : myTotal - oppTotal <= -0.05 ? "down" : "flat"}`}>{Math.abs(myTotal - oppTotal) < 0.05 ? "even" : fmt(myTotal - oppTotal)}</span>}
          <small>Your best lineup</small>
        </>}
      </div>
      {opp && <>
        <div className="lu-mx-mid" aria-hidden="true">
          {inPlay && nowLive && <span className="lu-live"><i />Live</span>}
          <b>{chance}%</b><small>to win</small>
          <span className="lu-mx-bar"><i style={{ width: `${chance}%` }} /></span>
        </div>
        {!mineOnly && <div className="lu-mx-side them">
          <span className="lu-mx-who"><span>{opp.name}</span><i /></span>
          {inPlay ? <>
            <LiveNum className="lu-mx-pts" v={oppNow!} />
            <span className="lu-mx-proj">proj {oppTotal!.toFixed(1)}</span>
          </> : <>
            <span className="lu-mx-pts">{oppTotal!.toFixed(1)}</span>
            <small>{opp.manager}</small>
          </>}
        </div>}
      </>}
    </div>
  );
  return onOpen ? <button className="lu-mx-open" onClick={onOpen} aria-label="Open this week's matchup">{body}</button> : body;
}

export interface Check { key: string; tone: "warn" | "bad" | "info"; icon: IconName; text: string; player?: Player }

/** What needs a look before lock: IR moves, hurt starters, a coin flip at flex, an empty or thin bench, an empty K or DEF.
 *  The inbox shows these; nothing else draws them. */
export function gameDayChecks(lineup: Lineup): Check[] {
  const s = lineup.slots.filter((x) => x.player) as { slot: string; player: Player }[];
  const flex = s.find((x) => x.slot === "FLEX");
  const bestBench = lineup.bench.filter((p) => p.pos !== "QB" && !isOut(p, true))[0];
  const closeCall = flex && bestBench && eff(flex.player, true) - eff(bestBench, true) < 1.5;
  const benchOut = lineup.bench.filter((p) => isOut(p, true));
  const ir = irReport(YOU);
  const emptySpecial = specialLineup(YOU).slots.filter((x) => !x.player);
  return [
    ...ir.mustActivate.map((p) => ({ key: `ira-${p.id}`, tone: "bad" as const, icon: "alert" as IconName, text: `Activate ${p.name} from IR. Sleeper blocks adds and trades until he's moved.`, player: p })),
    ...(ir.open > 0 && ir.moveIn[0] ? [{ key: "irm", tone: "info" as const, icon: "plug" as IconName, text: `Move ${ir.moveIn[0].name} to IR. It frees a bench spot without a drop.` }] : []),
    ...s.filter((x) => x.player.status).map((x) => ({ key: `inj-${x.player.id}`, tone: (x.player.status === "O" ? "bad" : "warn") as "bad" | "warn", icon: "alert" as IconName, player: x.player,
      text: x.player.status === "O" ? `${x.player.name} is out (${injuryDetail(x.player)}). Swap him before lock.` : `${x.player.name} is questionable (${injuryDetail(x.player)}). Check the inactives 90 minutes before kickoff.` })),
    ...emptySpecial.map((x) => ({ key: `empty-${x.slot}`, tone: "bad" as const, icon: "helmet" as IconName, text: `Your ${x.slot} slot is empty. Pick up a ${x.slot === "K" ? "kicker" : "defense"} in Sleeper before lock.` })),
    ...(closeCall ? [{ key: "flex", tone: "info" as const, icon: "trade" as IconName, text: `Close call at flex: ${flex.player.name} ${eff(flex.player, true).toFixed(1)} vs ${bestBench.name} ${eff(bestBench, true).toFixed(1)}. Basically a coin flip.` }] : []),
    ...(benchOut.length ? [{ key: "bench", tone: "info" as const, icon: "roster" as IconName,
      text: `Thin bench this week. ${benchOut.map((p) => `${p.name} (${onBye(p.nfl) ? "bye" : "out"})`).join(" and ")} can't cover a starter.` }] : []),
  ];
}

export function Roster({ lineup, myTags, setTag, prices, setPrice, tags, level, onPitch, side }: {
  side?: ReactNode;
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
  const locked = YOU.roster.filter((id) => myTags[id] === "amazing");
  const diff = sleeperDiff(lineup);
  const [sheet, setSheet] = useState<{ p: Player; where: string } | null>(null);
  const [cmp, setCmp] = useState<string | undefined>(undefined);
  const live = useLive();
  const started = Object.values(live.games).some((x) => x === "in_game" || x === "complete");
  const [view, setView] = useSticky<"lineup" | "compare" | "tags" | "price" | "slots">("roster.view", "lineup", ["lineup", "compare", "tags", "price", "slots"]);
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

  return (
    <>
      <header className="lu-hero">
        <div className="lu-hero-l">
          <LeagueSwitch title="Lineup" />
        </div>
        <MatchupStrip mineOnly />
      </header>

      <PageTabs value={view} onChange={setView} options={[{ v: "lineup", label: "Lineup", icon: "helmet" }, { v: "compare", label: "Compare", icon: "switch" }, { v: "tags", label: "Tags", icon: "roster" }, { v: "price", label: "Asking price", icon: "lock" }, { v: "slots", label: "Slot report", icon: "values" }]} />

      {view === "lineup" && <div className="lu-grid">
        <div className="lu-col">
          {(
            <section className="card lu-list" aria-label="Starters and bench">
              <WeekStepper week={week} onChange={setWeek} />
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
                  <div className="ss-foot"><span>Make the {diff.length > 1 ? "swaps" : "swap"} in Sleeper. {DEADLINES.lock}.</span><a className="btn btn-sm" href={sleeperUrl()} target="_blank" rel="noreferrer"><PlatformLogo size={16} />Open Sleeper</a></div>
                </> : <p className="ss-none">Your Sleeper lineup matches the optimal one.</p>}
              </div>
              <div className="lu-list-head"><span><b>Starters</b><span className="tiny muted lu-hint">Optimal lineup this week{diff.length ? ". Highlighted rows need a swap in Sleeper." : ". Matches Sleeper."}</span></span><span className="tiny muted">{started ? "Pts" : "Proj"}</span></div>
              {started && <div className="lu-play"><PlayCount c={playCount(live, [...s.map((x) => x.player.nfl), ...kdef.slots.map((x) => x.player?.nfl)])} /></div>}
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
        {side && <div className="lu-col lu-side">
          {side}
          <SlotGlance onOpen={() => setView("slots")} />
        </div>}
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
                        <div className="ti-stat"><dt>Your lineup</dt><dd><Delta n={o!.youDelta} /><small>/wk</small></dd></div>
                        <div className="ti-stat"><dt>Their lineup</dt><dd><Delta n={o!.themDelta} /><small>/wk</small></dd></div>
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
