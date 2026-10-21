import { Fragment, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { LeagueSwitch } from "./LeagueSwitch";
import { WeekView, WeekPlayer, loadWeek, peekWeek, order } from "../weeks";
import { LineupWeek, gameIn } from "../weekMatch";
import { kickWhen, lockLine, oppText, useKickoffs } from "../kickoff";
import { WeekStepper } from "./WeekStepper";
import { Live, useLive, onPace, matchNow, playCount, expect, PlayCount as Counts } from "../live";
import { playLabel, resultOf, scoreTone, flipTone } from "../liveMath";
import { LEAGUE, OPPONENT_ID, PLAYERS, SpecialPlayer, teamById, MyTag, TEAMS, YOU, ManagerTag, playerById, Player, onBye, SLOT_HISTORY, WEEK, sleeperUrl } from "../data";
import { irReport, irLabel, specialLineup, specialPts, startedSpecials, Lineup, Price, DEFAULT_PRICE, Trade, eff, fits, isOut, round1, sleeperDiff, suggestTags, weakSlots, whatItWouldTake, fmt } from "../engine";
import { AiLabel, Delta, Icon, IconName, Seg, Stamp, StatusPill, useSticky, PageTabs } from "./ui";
import { Avatar } from "./Avatar";
import { StartSit } from "./StartSit";
import { Select } from "./Select";
import { PlayerSheet } from "./lazy";
import { PlatformLogo } from "./PlatformLogo";
import { Tooltip } from "./Tooltip";
import { SwapAnchor, SwapPicker, SwapOption, SpecialWho, WeekWho, Who, byeWhy, outWhy, lockOf, lockRules, spPts, useSwapMenu, weekBye } from "./SwapPicker";
import { bestNow, bestUnderLocks, nowScore, swapInto, useNowLineup, useWeekWhatIf } from "../lineupWhatIf";
import { deny } from "../deny";
import { FaceOff, pressProps } from "./FaceOff";
import { MatchupSheet } from "./MatchupSheet";
import { DetailSheet } from "./DetailSheet";
import { OptimalLineup, type AiMarks } from "./OptimalLineup";
import { strokeFor } from "./iconStroke";

const TAG_LABEL: Record<MyTag, string> = {
  available: "Trade bait",
  shopping: "Shopping",
  untouchable: "Untouchable",
  amazing: "Overpay only",
};
// Standard normal CDF, for a win chance from two projections
const ringOf = (p: Player): "bad" | "warn" | undefined => (onBye(p.nfl) || p.status === "O" ? "bad" : p.status === "Q" ? "warn" : undefined);
/** "Questionable, Groin" becomes "Groin". */
const LONG_WORD: Record<string, string> = { IR: "Injured reserve", PUP: "PUP list", Sus: "Suspended", NA: "Not active", DNR: "Did not report", COV: "COVID list" };
export const injuryDetail = (p: Player) => (p.note ?? "").replace(/^(Questionable|Doubtful|Out|IR|PUP|Sus|NA|DNR|COV)\b,?\s*/i, "") || LONG_WORD[p.injury ?? ""] || (p.status === "O" ? "Out" : "Game-time decision");
/** The pill Sleeper shows next to the name: Q, D, OUT, IR, PUP, SUS. */
const SLEEPER_TAG: Record<string, string> = { Questionable: "Q", Doubtful: "D", Out: "OUT", IR: "IR", PUP: "PUP", Sus: "SUS", NA: "NA", DNR: "DNR", COV: "COV" };
export const injuryTag = (p: { status?: string; injury?: string }) => SLEEPER_TAG[p.injury ?? ""] ?? (p.status === "Q" ? "Q" : "OUT");
const statusWord = (p: Player) => (onBye(p.nfl) ? "Bye" : p.status === "O" ? "Out" : p.status === "Q" ? "Questionable" : null);

/** IR and taxi: players who don't count against your roster limit, plus anything that needs a move. */
function IrBlock({ onOpen }: { onOpen?: (p: Player, where: string) => void }) {
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
          <div key={p.id} className={`lu-row ir-row${stuck ? " ir-stuck" : ""}${onOpen ? " tap" : ""}`} role={onOpen ? "button" : undefined} tabIndex={onOpen ? 0 : undefined}
            onClick={onOpen ? () => onOpen(p, "On injured reserve") : undefined}
            onKeyDown={onOpen ? (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(p, "On injured reserve"); } } : undefined}>
            <span className="lu-slot">IR</span>
            <Avatar p={p} size={44} />
            <span className="lu-who">
              <span className="lu-name">{p.name}</span>
              <span className="lu-meta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b><span>{p.nfl}</span><b className={`lu-st ${stuck ? "warn" : "bad"}`}>{stuck ? "No longer qualifies" : `${irLabel(p)}${detail && detail !== "Out" ? `, ${detail}` : ""}`}</b></span>
            </span>
            {stuck ? <a className="btn btn-xs" href={sleeperUrl()} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Activate</a> : <span className="lu-pts dim" title="Players on IR don't score for you">0.0</span>}
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

/** Small marks drawn in the logo's line family: rising heat lines and an ice crystal. Each moving part is its own
 *  HTML layer so the browser can animate it with transform and opacity alone, off the main thread. */
const HEAT_TIP = { fire: "Past his projection already", heating: "On pace to beat his projection", cold: "On pace to finish 15% or more under projection" };
export const HeatMark = ({ heat }: { heat: "fire" | "heating" | "cold" }) => <Tooltip content={HEAT_TIP[heat]}>{heatSvg(heat)}</Tooltip>;
const WAVE = (x: number) => `M${x} 20c-1.5-2 1.5-4 0-6s1.5-4 0-6`;
const ICE = ["M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9", "M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"];
const iceSvg = (stroke: string) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke={stroke} strokeWidth={strokeFor(14)} strokeLinecap="round">{ICE.map((d) => <path key={d} d={d} />)}</svg>
);
const heatSvg = (heat: "fire" | "heating" | "cold") => heat === "fire" ? <Flame /> : heat === "heating" ? (
  <span className="heatwave" aria-hidden="true">
    {[7, 12, 17].map((x) => (
      <span key={x} className="hw-line"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#FFB547" strokeWidth={strokeFor(14)} strokeLinecap="round"><path d={WAVE(x)} /></svg></span>
    ))}
  </span>
) : (
  <span className="ice" aria-hidden="true"><span className="ice-glow">{iceSvg("#CFEFFF")}</span>{iceSvg("#9AD8FF")}</span>
);

/** A small flame, drawn in the logo's line family, that flickers while a player is heating up. The bright core is
 *  a separate layer on top so it can pulse on its own. */
export const Flame = () => (
  <span className="flame" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="14" height="14">
      <defs><linearGradient id="flame-g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#FF5A36" /><stop offset="0.6" stopColor="#FF9A3D" /><stop offset="1" stopColor="#FFD166" /></linearGradient></defs>
      <path className="flame-outer" d="M12 22c-4.1 0-7-2.8-7-6.6 0-3.1 1.9-5.2 3.6-7 .4 1.7 1.3 2.8 2.4 3.3C11 7.6 12.6 4.6 15.4 2c-.3 3.4 1 5.6 2.4 7.6 1.1 1.6 1.7 3.4 1.2 5.8C18.4 19.5 15.5 22 12 22z" fill="url(#flame-g)" />
    </svg>
    <span className="flame-inner">
      <svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 20.5c-1.9 0-3.2-1.3-3.2-3 0-1.6 1.1-2.7 2.1-3.6.2 1 .7 1.6 1.4 1.8.1-1.6.9-3 2.1-4.1-.1 1.6.6 2.7 1.1 3.6.5.8.6 1.6.4 2.6-.3 1.6-1.9 2.7-3.9 2.7z" fill="#FFE8A3" /></svg>
    </span>
  </span>
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
      <b>{pts.toFixed(1)}</b><small>proj {proj.toFixed(1)}</small>
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
        <b data-pts={g.pts.toFixed(1)}>{heat && <HeatMark heat={heat} />}{g.pts.toFixed(1)}</b>
        {pace !== null ? <small className={`lu-pace ${(pace >= proj) !== them ? "up" : "down"}`}>pace {pace.toFixed(1)}</small> : <small>proj {proj.toFixed(1)}</small>}
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
      <span className={c.live ? "pc-live" : "pc-left"}>{c.live > 0 && <i aria-hidden="true" />}{playLabel(c)}</span>
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

/** Once a game is live or final the row reads "QB · BUF · Live" as before, without the opponent. */
const kicked = (g: GameNow) => g.state === "in_game" || g.state === "complete";
/** Team and opponent together, no dot between them: "NO v PIT". */
const TeamOpp = ({ nfl, opp }: { nfl: string; opp?: string }) => <span>{nfl}{opp && <> <span className="lu-game">{oppText(opp)}</span></>}</span>;

/** Replaces the kickoff time once the game starts. */
function GameTag({ g, fallback }: { g: GameNow; fallback: string | null }) {
  if (g.state === "in_game") return <span className="lu-live"><i aria-hidden="true" />Live</span>;
  if (g.state === "complete") return <span className="lu-final">Final</span>;
  return fallback ? <span className="lu-game">{fallback}</span> : null;
}

/** What a tappable lineup row needs to open its swap menu (or deny when locked). */
type RowTap = { onTap: (el: Element) => void; lock: boolean; expanded: boolean; label: string };
/** Props that make a lineup row a button: a tap opens its swap menu, or shakes and says why when it's locked. */
const tapProps = (t: RowTap) => ({
  role: "button", tabIndex: 0, "aria-disabled": t.lock ? true : undefined, "aria-expanded": t.lock ? undefined : t.expanded, "aria-label": t.label,
  onClick: (e: { currentTarget: Element }) => t.onTap(e.currentTarget),
  onKeyDown: (e: { key: string; target: unknown; currentTarget: Element; preventDefault: () => void }) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); t.onTap(e.currentTarget); } },
});
const tapCls = (t?: RowTap) => (!t ? "" : t.lock ? " is-locked" : ` tap${t.expanded ? " is-open" : ""}`);
const LockIc = ({ t }: { t?: RowTap }) => (t?.lock ? <span className="lu-lockic" aria-hidden="true"><Icon name="lock" size={12} /></span> : null);

function LineupRow({ p, slot, bench, swap, onOpen, live, tap, ai }: { p: Player; slot: string; bench?: boolean; swap?: { to: Player; gain: number }; onOpen?: (p: Player, where: string) => void; live?: Live; tap?: RowTap; ai?: "start" | "sit" }) {
  const st = statusWord(p);
  useKickoffs();
  const g = gameNow(live, p.id, p.nfl);
  const where = bench ? "On your bench" : `Starting at ${SLOT_LABEL[slot] ?? slot}`;
  const sheet = !tap && onOpen;
  return (
    <div className={`lu-row${bench ? " bench" : ""}${swap ? " has-swap" : ""}${sheet ? " tap" : ""}${tapCls(tap)}${playCls(g, onBye(p.nfl))}${ai ? ` ai-${ai}` : ""}`}
      {...(tap ? tapProps(tap) : sheet ? { role: "button", tabIndex: 0, onClick: () => onOpen(p, where),
        onKeyDown: (e: { key: string; preventDefault: () => void }) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(p, where); } } } : {})}>
      <span className={`lu-slot s-${slot}`}>{SLOT_LABEL[slot] ?? slot}</span>
      <Avatar p={p} size={44} />
      <span className="lu-who">
        <span className="lu-name">{p.name}{st && st !== "Bye" && <b className={`lu-tag ${ringOf(p)}`}>{injuryTag(p)}</b>}</span>
        <span className="lu-meta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b><TeamOpp nfl={p.nfl} opp={onBye(p.nfl) || kicked(g) ? undefined : p.opp} />{!onBye(p.nfl) && <GameTag g={g} fallback={kickWhen(p) || null} />}</span>
        {p.status && !onBye(p.nfl) && (g.state === null || g.state === "pre_game") && <span className={`lu-inj ${ringOf(p)}`}>{injuryDetail(p)}</span>}
      </span>
      {onBye(p.nfl) ? <span className="lu-pts bye">BYE</span> : <PtsCell id={p.id} g={g} proj={eff(p, true)} />}
      {swap && (
        <span className="lu-swap">
          <Icon name="trade" size={14} />
          <span>Start <b>{swap.to.name}</b> here instead{onBye(p.nfl) ? ` (${p.name} is on bye)` : isOut(p, true) ? ` (${p.name} is out)` : ""} for <b className="good">+{swap.gain.toFixed(1)}</b>.</span>
        </span>
      )}
      <LockIc t={tap} />
    </div>
  );
}

/** Kicker or defense row. Same layout as a skill player. */
function SpecialRow({ p, slot, bench, swapTo, live, tap }: { p: SpecialPlayer; slot: string; bench?: boolean; swapTo?: SpecialPlayer; live?: Live; tap?: RowTap }) {
  const bye = p.wk === null;
  useKickoffs();
  const g = gameNow(live, p.id, p.nfl);
  const out = p.status === "O";
  return (
    <div className={`lu-row${bench ? " bench" : ""}${swapTo ? " has-swap" : ""}${tapCls(tap)}${playCls(g, bye)}`} {...(tap ? tapProps(tap) : {})}>
      <span className={`lu-slot s-${slot}`}>{slot}</span>
      <Avatar p={p} size={44} />
      <span className="lu-who">
        <span className="lu-name">{p.name}{out && <b className="lu-tag bad">OUT</b>}{p.status === "Q" && <b className="lu-tag warn">Q</b>}</span>
        <span className="lu-meta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b><TeamOpp nfl={p.nfl} opp={bye || kicked(g) ? undefined : p.opp} />{!bye && <GameTag g={g} fallback={kickWhen(p) || null} />}</span>
      </span>
      {bye ? <span className="lu-pts bye">BYE</span> : <PtsCell id={p.id} g={g} proj={specialPts(p)} />}
      {swapTo && (
        <span className="lu-swap">
          <Icon name="trade" size={14} />
          <span>Start <b>{swapTo.name}</b> here instead{bye ? ` (${p.name} is on bye)` : ""} for <b className="good">+{(specialPts(swapTo) - specialPts(p)).toFixed(1)}</b>.</span>
        </span>
      )}
      <LockIc t={tap} />
    </div>
  );
}

type SwapMenu = ReturnType<typeof useSwapMenu<string>>;
/** A slot pill in front of the player a bench player would replace, in a bench row's swap menu. */
const SlotAt = ({ slot, children }: { slot: string; children: ReactNode }) => <span className="sw-at"><b className="sw-slot">{slot}</b>{children}</span>;
/** The menu sits in a zero-height anchor right after its row, so rows stay siblings and keep their dividers. */
const PickAt = ({ show, children }: { show: boolean; children: ReactNode }) => <SwapAnchor show={show} className="lu-pick-at">{children}</SwapAnchor>;

/** Under the starters: swaps here are a what-if (Sources can't write to Sleeper), with the way back and the way there. */
function LuWhatIf({ changed, delta, locked, base, resetLabel, onReset }: { changed: boolean; delta: number; locked: boolean; base: string; resetLabel: string; onReset: (el: Element) => void }) {
  return (
    <div className={!changed && locked ? "lu-wi is-locked" : "lu-wi"}>
      <p className="lu-wi-txt">{changed ? <><b>What-if lineup</b> <b className={delta >= 0 ? "lu-wi-up" : "lu-wi-down"}>{fmt(delta)} pts</b> vs {base}. Make the swap in Sleeper to lock it in.</>
        : locked ? "Lineups are locked for this week." : "Tap a player to try a swap. Swaps here are a what-if, so make them in Sleeper too."}</p>
      <div className="lu-wi-btns">
        {changed && <button className="btn btn-sm" onClick={(e: { currentTarget: Element }) => onReset(e.currentTarget)}>{resetLabel}</button>}
        <a className="btn btn-sm" href={sleeperUrl()} target="_blank" rel="noreferrer"><PlatformLogo size={16} />Open Sleeper</a>
      </div>
    </div>
  );
}

/** Any other week: past weeks show what you started and the stat lines (locked: a tap shakes and says why), future
 *  weeks show projections and take swaps, shared with that week's full matchup (lineupWhatIf). */
function WeekPanel({ v, menu, onInfo }: { v: WeekView; menu: SwapMenu; onInfo: (p: Player, where: string) => void }) {
  const { m, raw, wi } = useWeekWhatIf(v.week);
  if (v.empty) return <p className="small muted" style={{ padding: "4px 16px 18px" }}>{v.empty}</p>;
  const past = v.kind === "past", future = !past && m?.kind === "future";
  const starters = future ? wi.starters : v.starters, bench = future ? wi.bench : v.bench;
  const { open, setOpen, menuRef } = menu;
  const tapFor = (key: string, label: string): RowTap | undefined => past
    ? { onTap: (el) => deny(el, `Week ${v.week} is over. Lineups can't change.`), lock: true, expanded: false, label: `${label}, locked` }
    : future ? { onTap: (el) => setOpen(open === key ? null : key, el), lock: false, expanded: open === key, label } : undefined;
  const infoFor = (p: WeekPlayer, where: string) => (PLAYERS[p.id] ? { name: p.name, onOpen: () => { setOpen(null); onInfo(playerById(p.id), where); } } : undefined);
  const row = (p: WeekView["bench"][number], slot: string, tap: RowTap | undefined, bench?: boolean) => (
    <div key={`${slot}-${p.id}`} className={`lu-row${bench ? " bench" : ""}${tapCls(tap)}`} {...(tap ? tapProps(tap) : {})}>
      <span className={`lu-slot s-${slot}`}>{SLOT_LABEL[slot] ?? slot}</span>
      <Avatar p={p} size={40} text={p.pos === "DEF" ? p.nfl : undefined} />
      <span className="lu-who">
        <span className="lu-name">{p.name}</span>
        <span className="lu-meta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b><span>{p.pos === "DEF" ? "Team defense" : p.nfl}</span></span>
        {v.kind === "past" && (p.line && p.pts !== null ? <span className="lu-line">{p.line}</span> : <span className="lu-line" aria-hidden="true">&nbsp;</span>)}
      </span>
      {p.pts === null ? <span className="lu-pts bye">BYE</span> : <span className={`lu-pts${v.kind === "past" ? " actual" : ""}`}>{p.pts.toFixed(1)}</span>}
      <LockIc t={tap} />
    </div>
  );
  return (
    <>
      {/* No summary box: the team strip above already shows the week's final or projected score */}
      <div className="lu-list-head"><b>{v.kind === "past" ? "Started" : "Starters"}</b><span className="tiny muted">{v.kind === "past" ? "Pts" : "Proj"}</span></div>
      {starters.map((x, i) => {
        const key = `f${i}`, label = SLOT_LABEL[x.slot] ?? x.slot;
        const tap = tapFor(key, x.p ? (past ? `${x.p.name} at ${label}` : `Swap ${x.p.name} at ${label}`) : `Empty ${label} slot`);
        const options: SwapOption[] = !future ? [] : bench.filter((b) => wi.fitsAt(i, b.pos)).map((b) => {
          const d = (b.pts ?? 0) - (x.p?.pts ?? 0);
          return { key: b.id, who: <WeekWho p={b} side="you" week={v.week} />, name: b.name, pts: b.pts ?? 0, delta: round1(d), up: d >= 0, lock: null, ...weekBye(b, v.week), onPick: (from) => { wi.swap(i, b.id); setOpen(null, from); } };
        });
        return (
          <Fragment key={`s${i}`}>
            {x.p ? row(x.p, x.slot, tap) : <div className={`lu-row${tapCls(tap)}`} {...(tap ? tapProps(tap) : {})}><span className={`lu-slot s-${x.slot}`}>{label}</span><span className="ir-empty" aria-hidden="true" /><span className="lu-who"><span className="lu-name muted">Empty</span></span><span /><LockIc t={tap} /></div>}
            <PickAt show={open === key && future}><SwapPicker menuRef={menuRef} className="lu-pick" title={`Swap in at ${label}`} empty={`No bench player can play ${label}.`} options={options} info={x.p ? infoFor(x.p, `Starting at ${label} in Week ${v.week}`) : undefined} /></PickAt>
          </Fragment>
        );
      })}
      {future && m && raw && <LuWhatIf changed={wi.changed} delta={round1(m.me.total - raw.me.total)} locked={false} base="your best projected lineup" resetLabel="Reset" onReset={(el) => { wi.reset(); setOpen(null, el); }} />}
      <div className="lu-list-head sub"><b>Bench</b><span className="tiny muted">{bench.length} players</span></div>
      {bench.map((p) => {
        const key = `fb${p.id}`;
        // On bye or out long-term that week: starting him only scores 0, so the row says so instead of opening the slots
        const why = future ? (!gameIn(p, v.week) ? byeWhy(p, v.week) : outWhy(p, v.week, false)) : null;
        const tap: RowTap | undefined = why ? { onTap: (el) => deny(el, why), lock: true, expanded: false, label: `${p.name}, can't start` } : tapFor(key, past ? `${p.name} on the bench` : `Start ${p.name}`);
        const options: SwapOption[] = !future ? [] : starters.map((x, i) => ({ x, i })).filter(({ i }) => wi.fitsAt(i, p.pos)).map(({ x, i }) => {
          const label = SLOT_LABEL[x.slot] ?? x.slot, d = (p.pts ?? 0) - (x.p?.pts ?? 0);
          return { key: `${i}`, who: <SlotAt slot={label}><WeekWho p={x.p} side="you" week={v.week} /></SlotAt>, name: `${label}, ${x.p?.name ?? "empty"}`, pts: x.p?.pts ?? 0, delta: round1(d), up: d >= 0, lock: null, onPick: (from) => { wi.swap(i, p.id); setOpen(null, from); } };
        });
        return (
          <Fragment key={p.id}>
            {row(p, "BN", tap, true)}
            <PickAt show={open === key && future}><SwapPicker menuRef={menuRef} className="lu-pick" title={`Start ${p.name} over`} empty={`${p.name} can't play any of your starting slots.`} options={options} info={infoFor(p, `On your bench in Week ${v.week}`)} /></PickAt>
          </Fragment>
        );
      })}
    </>
  );
}

/** Loading a week: the same rows WeekPanel draws (starters, bench), so the list doesn't jump when it lands. */
function WeekSkel({ week }: { week: number }) {
  const starters = order().length, bench = Math.max(0, YOU.roster.length + (YOU.special?.length ?? 0) - starters);
  const row = (k: string, bench?: boolean) => <div key={k} className={`lu-row lu-row-skel${bench ? " bench" : ""}`} aria-hidden="true"><span className="lu-slot" /><span className="ir-empty" /><span className="lu-who"><span className="lu-name">&nbsp;</span><span className="lu-meta">&nbsp;</span>{week < WEEK && <span className="lu-line">&nbsp;</span>}</span><span className="lu-pts" /></div>;
  return (
    <div className="lu-wskel" aria-busy="true" aria-label={`Loading Week ${week}`}>
      <div className="lu-list-head" aria-hidden="true"><b>&nbsp;</b></div>
      {Array.from({ length: starters }, (_, i) => row(`s${i}`))}
      <div className="lu-list-head sub" aria-hidden="true"><b>&nbsp;</b></div>
      {Array.from({ length: bench }, (_, i) => row(`b${i}`, true))}
    </div>
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
            <div key={r.h.slot} className="sr-row">
              <button className="sr-main" onClick={() => setOpenSlot(r.h.slot)} aria-haspopup="dialog" aria-label={`${r.h.slot}: you ${r.you.toFixed(1)}, league ${r.lg.toFixed(1)}, beat average ${r.above} of ${r.n} weeks. Details`}>
                <span className={`sr-slot${r.gap < 0 ? " down" : ""}`}>{r.h.slot}<small className={r.gap >= 0 ? "up" : "down"}>{fmt(Math.round(r.gap * 10) / 10)}</small></span>
                <span className="sr-num">{r.you.toFixed(1)}</span>
                <span className="sr-num muted">{r.lg.toFixed(1)}</span>
                <span className={`sr-beat ${r.above * 2 >= r.n ? "up" : "down"}`}>{r.above}/{r.n}</span>
                <Icon name="chev" size={14} />
              </button>
              {isOpen && (
                <DetailSheet className="sr-sheet" label={`${r.h.slot} slot, week by week`} onClose={() => setOpenSlot(null)} title={
                  <span className="srs-head"><b className="srs-slot">{r.h.slot}</b><span className="srs-who"><b>{r.h.slot} slot</b><small>You <span className="num">{r.you.toFixed(1)}</span> · League <span className="num">{r.lg.toFixed(1)}</span> · <span className={r.gap >= 0 ? "up" : "down"}>{fmt(Math.round(r.gap * 10) / 10)}</span></small></span></span>
                }>
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
                </DetailSheet>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The team strip for any week but this one: a past week's final and the result, or a future week's projected
 *  totals and win chance. Loading and empty weeks keep the same rows so nothing below moves. */
function WeekStrip({ week, onOpen }: { week: number; onOpen?: () => void }) {
  // A week ahead follows the shared what-if, so a swap on Lineup moves the total and win % here right away
  const { m, err, wi } = useWeekWhatIf(week);
  const myTotal = m?.me.total ?? peekWeek(week)?.total;
  if (!m) return (
    <section className={`mw mwf${err ? "" : " is-skel"}`} aria-label={err ?? `Loading Week ${week}`} aria-busy={!err}>
      <FaceOff week={week} state={week < WEEK ? "final" : "pre"} chance={null} res={null} skel={!err} msg={err ? "Unavailable" : "Loading"}
        you={{ t: YOU, pts: myTotal ?? 0 }} them={{ t: null, pts: err ? null : 0, empty: err ? "Matchup unavailable" : "Loading" }} />
    </section>
  );
  const past = m.kind === "past", opp = m.opp;
  // A past week reads its result the same way this week's final does (liveMath.resultOf)
  const res = past && opp ? resultOf(m.me.total, opp.total) : null;
  // Score tones (liveMath.scoreTone): a past week dims the loser; a week ahead is projections, so neither dims
  const wkTone = scoreTone(m.me.total, opp?.total, past ? "final" : "pre");
  const chance = m.chance ?? 50;
  const label = `${YOU.name}, ${YOU.record}. Week ${week}${opp ? ` vs ${opp.team.name}` : `, ${m.empty?.title ?? "no matchup"}`}. `
    + (res ? `Final, ${res.long}` : past ? `Final ${m.me.total.toFixed(1)}` : `Projected ${m.me.total.toFixed(1)}${opp ? ` to ${opp.total.toFixed(1)}, ${chance} percent to win` : ""}`);
  return (
    <section className={`mw mwf${opp && onOpen ? " mc-press" : ""}`} {...(opp && onOpen ? pressProps(onOpen, `Open the Week ${week} matchup. ${label}`) : { "aria-label": label })}>
      <FaceOff week={week} state={past ? "final" : "pre"} chance={opp && !past ? chance : null} res={res} msg={m.empty?.title ?? "No matchup"}
        you={{ t: YOU, pts: m.me.total, note: !past && wi.changed ? "what-if" : undefined, dim: wkTone === "trail" }}
        them={opp ? { t: opp.team, pts: opp.total, dim: wkTone === "lead" } : { t: null, pts: null, empty: m.empty?.title ?? "No matchup" }} />
    </section>
  );
}

/** You vs this week's opponent in the shared face-off (FaceOff.tsx): points scored once games start, projection under them, win %. */
export function MatchupStrip({ onOpen, mineOnly = false, week = WEEK }: { onOpen?: () => void; mineOnly?: boolean; week?: number }) {
  const live = useLive();
  const started = Object.values(live.games).some((x) => x === "in_game" || x === "complete");
  const nowLive = Object.values(live.games).some((x) => x === "in_game");
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  // Sleeper's set lineups, K/DEF included, scored the way the Wire card and full matchup score them (live.matchNow).
  // On Lineup (mineOnly) your side is the shared what-if once you've swapped (lineupWhatIf), like the full matchup.
  const wi = useNowLineup();
  const ms = mineOnly ? nowScore(live, wi.mine, wi.mineK, wi.changed) : matchNow(live);
  const myNow = started ? ms.me.scored : undefined, oppNow = started && ms.opp ? ms.opp.scored : undefined;
  const inPlay = started && myNow !== undefined && (!opp || oppNow !== undefined);
  const myTotal = ms.me.proj, oppTotal = ms.opp ? ms.opp.proj : null;
  const chance = ms.chance ?? 0, res = ms.result;
  // Score tones (liveMath.scoreTone): ahead now or the winner stays bright, the other dims; pregame both bright
  const myTone = scoreTone(myNow ?? myTotal, oppNow ?? oppTotal, res ? "final" : inPlay ? "live" : "pre");
  if (mineOnly && week !== WEEK) return <WeekStrip week={week} onOpen={onOpen} />;
  if (mineOnly) {
    // Your week at a glance, like Sleeper's team card: you and them on one score column, then the win chance or the result
    const myPts = inPlay ? myNow! : myTotal, oppPts = opp ? (inPlay && oppNow !== undefined ? oppNow : oppTotal ?? 0) : null;
    const label = `${YOU.name}, ${YOU.record}. Week ${WEEK}${opp ? ` vs ${opp.name}` : ""}. ${res ? `Final, ${res.long}` : `${inPlay ? `${myNow!.toFixed(1)} points, on pace for ${myTotal.toFixed(1)}` : `Projected ${myTotal.toFixed(1)}`}${opp ? `, ${chance} percent to win` : ""}`}`;
    return (
      <section className={`mw mwf${opp && onOpen ? " mc-press" : ""}`} {...(opp && onOpen ? pressProps(onOpen, `Open this week's matchup. ${label}`) : { "aria-label": label })}>
        <FaceOff week={WEEK} state={res ? "final" : inPlay && nowLive ? "live" : inPlay ? "scored" : "pre"} chance={opp && !res ? chance : null} res={opp ? res : null} msg="Bye week"
          you={{ t: YOU, pts: myPts, live: inPlay, note: res ? undefined : inPlay ? `${wi.changed ? "what-if " : ""}${myTotal.toFixed(1)}` : wi.changed ? "what-if" : undefined, dim: myTone === "trail", count: ms.me.count }}
          them={opp ? { t: opp, pts: oppPts, live: inPlay, note: inPlay && !res ? oppTotal!.toFixed(1) : undefined, dim: myTone === "lead", count: ms.opp?.count } : { t: null, pts: null, empty: "No matchup" }} />
      </section>
    );
  }
  const body = (
    <div className="lu-mx" aria-label={res ? `Final. ${res.long}` : `${inPlay ? `You have ${myNow!.toFixed(1)} points, on pace for ${myTotal.toFixed(1)}` : `Your best lineup projects ${myTotal.toFixed(1)} points`}${opp ? `. ${chance} percent to win` : ""}`}>
      <FaceOff week={WEEK} state={res ? "final" : inPlay && nowLive ? "live" : inPlay ? "scored" : "pre"} chance={opp && !res ? chance : null} res={opp ? res : null} msg="Bye week"
        you={{ t: YOU, pts: inPlay ? myNow! : myTotal, live: inPlay, note: inPlay && !res ? myTotal.toFixed(1) : undefined, dim: myTone === "trail", count: ms.me.count }}
        them={opp && oppTotal !== null ? { t: opp, pts: inPlay && oppNow !== undefined ? oppNow : oppTotal, live: inPlay, note: inPlay && !res ? oppTotal.toFixed(1) : undefined, dim: flipTone(myTone) === "trail", count: ms.opp?.count } : { t: null, pts: null, empty: "No matchup" }} />
    </div>
  );
  return onOpen ? <button type="button" className="lu-mx-open mc-press" onClick={onOpen} aria-label={`Open this week's matchup. ${res ? `Final, ${res.long}` : `You ${(inPlay ? myNow! : myTotal).toFixed(1)}${opp ? `, ${opp.name} ${(inPlay && oppNow !== undefined ? oppNow : oppTotal ?? 0).toFixed(1)}, ${chance} percent to win` : ""}`}`}>{body}</button> : body;
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
  // A K/DEF slot Sleeper has empty, even with one rostered (the suggested pick is the one to start)
  const emptySpecial = startedSpecials(YOU).filter((x) => !x.player || x.suggested);
  return [
    ...ir.mustActivate.map((p) => ({ key: `ira-${p.id}`, tone: "bad" as const, icon: "alert" as IconName, text: `Activate ${p.name} from IR. Sleeper blocks adds and trades until he's moved.`, player: p })),
    ...(ir.open > 0 && ir.moveIn[0] ? [{ key: "irm", tone: "info" as const, icon: "plug" as IconName, text: `Move ${ir.moveIn[0].name} to IR. It frees a bench spot without a drop.` }] : []),
    ...s.filter((x) => x.player.status).map((x) => ({ key: `inj-${x.player.id}`, tone: (x.player.status === "O" ? "bad" : "warn") as "bad" | "warn", icon: "alert" as IconName, player: x.player,
      text: x.player.status === "O" ? `${x.player.name} is out (${injuryDetail(x.player)}). Swap him before lock.` : `${x.player.name} is questionable (${injuryDetail(x.player)}). Check the inactives 90 minutes before kickoff.` })),
    ...emptySpecial.map((x) => ({ key: `empty-${x.slot}`, tone: "bad" as const, icon: "helmet" as IconName, text: x.player ? `Your ${x.slot} slot is empty in Sleeper. Start ${x.player.name} before lock.` : `Your ${x.slot} slot is empty. Pick up a ${x.slot === "K" ? "kicker" : "defense"} in Sleeper before lock.` })),
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
  setPrice: (id: string, p: Price | null) => void;
  tags: ManagerTag[];
  level: string;
  onPitch: (t: Trade) => void;
}) {
  const s = lineup.slots.filter((x) => x.player) as { slot: string; player: Player }[];
  const by = (slot: string) => s.filter((x) => x.slot === slot);
  const flex = by("FLEX")[0];
  const bestBench = lineup.bench.filter((p) => p.pos !== "QB" && !isOut(p, true))[0];
  // Anyone you'd move can carry an asking price: overpay-only guys always do, trade bait and shopping
  // players once you set one. Untouchables are listed so you can switch them to a price instead.
  const locked = YOU.roster.filter((id) => myTags[id] === "amazing" || ((myTags[id] === "available" || myTags[id] === "shopping" || !myTags[id]) && prices[id]));
  const movable = YOU.roster.filter((id) => (myTags[id] === "available" || myTags[id] === "shopping") && !prices[id]);
  const untouch = YOU.roster.filter((id) => myTags[id] === "untouchable");
  const unpriced = YOU.roster.filter((id) => !myTags[id] && !prices[id]);
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
  const [muWeek, setMuWeek] = useState<number | null>(null);
  useKickoffs(week);
  const [wv, setWv] = useState<WeekView | null>(null);
  const [wErr, setWErr] = useState<string | null>(null);
  useEffect(() => {
    if (week === WEEK) { setWv(null); return; }
    // Ready already (cached, or the demo league): draw it right away, no skeleton frame
    const hit = peekWeek(week);
    if (hit) { setWv(hit); setWErr(null); return; }
    let live = true;
    setWv(null); setWErr(null);
    loadWeek(week).then((v) => live && setWv(v)).catch(() => live && setWErr("Couldn't load that week from Sleeper. Try again in a minute."));
    return () => { live = false; };
  }, [week]);
  // The lineup shown this week is the shared what-if (lineupWhatIf): Sleeper's until you swap, here or in the matchup
  const now = useNowLineup();
  const ms = nowScore(live, now.mine, now.mineK, now.changed);
  const pastWeek = !!live.past || !!ms.result;
  const { starterLock, candidateLock } = lockRules(live, pastWeek);
  // Use optimal lineup: the best skill lineup that leaves locked players where they are, skill players compared to
  // skill players. The same helper as the matchup's Use best lineup, so the two never disagree.
  const lockedId = (id: string) => pastWeek || !!lockOf(live, playerById(id));
  const best = bestNow(live, now.mine, lockedId);
  // Start / Sit: the moves from your Sleeper lineup to the optimal one you can still set, from the same helper, so the
  // card, the row hints and the button agree (a player whose game started is never suggested)
  const optIds = bestUnderLocks(now.base.mine, lockedId).map((x) => x.id).filter((id): id is string => !!id);
  const baseIds = now.base.mine.map((x) => x.id).filter((id): id is string => !!id);
  const sits = baseIds.filter((id) => !optIds.includes(id)).map(playerById);
  const moves = optIds.filter((id) => !baseIds.includes(id)).map(playerById).map((p, i) => ({ start: p, benched: sits[i], gain: round1(eff(p, true) - (sits[i] ? eff(sits[i], true) : 0)) })).filter((d) => !!d.benched);
  const allLocked = pastWeek || (now.mine.every((x) => !!starterLock(x.id ? playerById(x.id) : null)) && now.mineK.every((p) => !!starterLock(p)));
  const menu = useSwapMenu<string>();
  const { open, setOpen, menuRef } = menu;
  // Set optimal lineup marks the rows it recommends until you dismiss it
  const [aiMarks, setAiMarks] = useState<AiMarks | null>(null);
  // Switching weeks or tabs closes any open menu, holding the scroll where it is
  useEffect(() => { if (open !== null) setOpen(null); }, [week, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownIds = now.mine.map((x) => x.id);
  const benchNow = YOU.roster.filter((id) => !shownIds.includes(id)).map(playerById).sort((a, b) => eff(b, true) - eff(a, true));
  const benchK = (YOU.special ?? []).map((id) => LEAGUE.specials?.[id]).filter((p): p is SpecialPlayer => !!p && !now.mineK.some((x) => x?.id === p.id)).sort((a, b) => spPts(live, b) - spPts(live, a));
  const tapFor = (key: string, lock: string | null, label: string): RowTap => ({
    lock: !!lock, expanded: open === key, label: lock ? `${label}, locked` : label,
    onTap: (el) => { if (lock) { if (open !== null) setOpen(null, el); deny(el, lock); } else setOpen(open === key ? null : key, el); },
  });
  const pick = (fn: () => void) => (from: Element) => { fn(); setOpen(null, from); };
  const info = (p: Player, where: string) => ({ name: p.name, onOpen: () => { setOpen(null); openPlayer(p, where); } });
  const lbl = (slot: string) => SLOT_LABEL[slot] ?? slot;
  // A starter Sleeper has where the optimal lineup starts someone else: the row says who, until he's in
  const hintFor = (id: string) => { const d = moves.find((x) => x.benched.id === id && !shownIds.includes(x.start.id)); return d ? { to: d.start, gain: d.gain } : undefined; };
  const kHint = (p: SpecialPlayer, slot: string) => {
    const b = kdef.slots.find((x) => x.slot === slot)?.player;
    return b && b.id !== p.id && !now.mineK.some((x) => x?.id === b.id) && specialPts(b) - specialPts(p) >= 0.5 ? b : undefined;
  };

  return (
    <>
      <header className="page-head">
        <div>
          <LeagueSwitch title="Lineup" />
        </div>
      </header>

      <PageTabs value={view} onChange={setView} options={[{ v: "lineup", label: "Lineup", icon: "helmet" }, { v: "compare", label: "Compare", icon: "switch" }, { v: "tags", label: "Tags", icon: "roster" }, { v: "price", label: "Asking price", icon: "lock" }, { v: "slots", label: "Slot report", icon: "values" }]} />

      {/* Below the tabs, like every page's own content, so the header and tab row sit where they do everywhere else */}
      <MatchupStrip mineOnly week={view === "lineup" ? week : WEEK} onOpen={() => setMuWeek(view === "lineup" ? week : WEEK)} />
      {muWeek !== null && <MatchupSheet week={muWeek} onClose={() => setMuWeek(null)} />}

      {view === "lineup" && <div className="lu-grid">
        <div className="lu-col">
          {(
            <section className="card lu-list" aria-label="Starters and bench">
              <WeekStepper week={week} onChange={setWeek} />
              {week !== WEEK ? (wErr ? <p className="small muted" style={{ padding: "4px 16px 18px" }}>{wErr}</p> : (wv?.week === week ? wv : peekWeek(week)) ? <WeekPanel v={(wv?.week === week ? wv : peekWeek(week))!} menu={menu} onInfo={openPlayer} /> : <WeekSkel week={week} />) : <>
              <div className={`ss${moves.length ? "" : " ok"}`} aria-label="Start and sit">
                <div className="ss-head">
                  <b>Start / Sit</b>
                  {!allLocked && best.gain > 0
                    ? <button className="btn btn-sm ss-best" onClick={(e: { currentTarget: Element }) => { now.setMine(best.slots); setOpen(null, e.currentTarget); }}>Use optimal lineup <b className="ss-best-gain">{fmt(best.gain)}</b></button>
                    : <span className="ss-ok"><Icon name="check" size={14} />Lineup set</span>}
                </div>
                {moves.length > 0 ? <>
                  {moves.map((d) => (
                    <div key={d.start.id} className="ss-move">
                      <div className="ss-p start"><span className="ss-tag">Start</span><Avatar p={d.start} size={32} /><span className="ss-n"><b>{d.start.name}</b><small>{d.start.pos} · {d.start.nfl}</small></span><span className="ss-pts">{eff(d.start, true).toFixed(1)}</span></div>
                      <div className="ss-p sit"><span className="ss-tag">Sit</span><Avatar p={d.benched} size={32} /><span className="ss-n"><b>{d.benched.name}</b><small>{d.benched.pos} · {d.benched.nfl}{onBye(d.benched.nfl) ? " · Bye" : ""}</small></span><span className="ss-pts">{eff(d.benched, true).toFixed(1)}</span></div>
                    </div>
                  ))}
                  <div className="ss-foot"><span>Make the {moves.length > 1 ? "swaps" : "swap"} in Sleeper. {lockLine()}.</span><a className="btn btn-sm" href={sleeperUrl()} target="_blank" rel="noreferrer"><PlatformLogo size={16} />Open Sleeper</a></div>
                </> : <p className="ss-none">Your Sleeper lineup matches the optimal one.</p>}
              </div>
              <div className="lu-list-head"><span><b>Starters</b><span className="tiny muted lu-hint">{now.changed ? "Your what-if lineup." : "Your Sleeper lineup."}{allLocked ? " Lineups are locked." : " Tap a player to swap."}</span></span><span className="tiny muted">{started ? "Pts" : "Proj"}</span></div>
              <OptimalLineup live={live} locked={allLocked} onPlayer={openPlayer} onMarks={setAiMarks} />
              {started && <div className="lu-play"><PlayCount c={playCount(live, [...now.mine.map((x) => (x.id ? playerById(x.id).nfl : undefined)), ...now.mineK.map((p) => p?.nfl)])} /></div>}
              {now.mine.map((x, i) => {
                const p = x.id ? playerById(x.id) : null, key = `s${i}`, label = lbl(x.slot);
                const tap = tapFor(key, starterLock(p), p ? `Swap ${p.name} at ${label}` : `Fill the empty ${label} slot`);
                const options: SwapOption[] = benchNow.filter((b) => fits(x.slot, b.pos)).map((b) => {
                  const d = eff(b, true) - expect(live, x.id);
                  return { key: b.id, who: <Who p={b} side="you" />, name: b.name, pts: eff(b, true), delta: round1(d), up: d >= 0, lock: candidateLock(b), onPick: pick(() => now.setMine((cur) => swapInto(cur, i, b.id))) };
                });
                return (
                  <Fragment key={key}>
                    {p ? <LineupRow p={p} slot={x.slot} swap={hintFor(p.id)} live={live} tap={tap} ai={aiMarks?.[p.id]} />
                      : <div className={`lu-row${tapCls(tap)}`} {...tapProps(tap)}><span className={`lu-slot s-${x.slot}`}>{label}</span><span className="ir-empty" aria-hidden="true" /><span className="lu-who"><span className="lu-name muted">Empty</span></span><span /><LockIc t={tap} /></div>}
                    <PickAt show={open === key}><SwapPicker menuRef={menuRef} className="lu-pick" title={`Swap in at ${label}`} empty={`No bench player can play ${label}.`} options={options} info={p ? info(p, `Starting at ${label}`) : undefined} /></PickAt>
                  </Fragment>
                );
              })}
              {now.base.k.map((sk, i) => {
                const p = now.mineK[i] ?? null, key = `k${i}`;
                if (!p) return <div key={`empty-${sk.slot}-${i}`} className="lu-row"><span className={`lu-slot s-${sk.slot}`}>{sk.slot}</span><span className="ir-empty" aria-hidden="true" /><span className="lu-who"><span className="lu-name muted">Empty</span><span className="lu-meta">Pick up a {sk.slot === "K" ? "kicker" : "defense"} in Sleeper before lock.</span></span><span /></div>;
                const tap = tapFor(key, starterLock(p), `Swap ${p.name} at ${sk.slot}`);
                const options: SwapOption[] = benchK.filter((b) => b.pos === sk.slot).map((b) => {
                  const d = round1(spPts(live, b) - spPts(live, p));
                  return { key: b.id, who: <SpecialWho p={b} side="you" />, name: b.name, pts: spPts(live, b), delta: d, up: d >= 0, lock: candidateLock(b), onPick: pick(() => now.setMineK((cur) => cur.map((y, j) => (j === i ? b : y)))) };
                });
                return (
                  <Fragment key={key}>
                    <SpecialRow p={p} slot={sk.slot} swapTo={kHint(p, sk.slot)} live={live} tap={tap} />
                    <PickAt show={open === key}><SwapPicker menuRef={menuRef} className="lu-pick" title={`Swap in at ${sk.slot}`} empty={`No other ${sk.slot === "DEF" ? "defense" : "kicker"} on your roster.`} options={options} /></PickAt>
                  </Fragment>
                );
              })}
              <LuWhatIf changed={now.changed} delta={round1(ms.me.proj - matchNow(live).me.proj)} locked={allLocked} base="your Sleeper lineup" resetLabel="Reset to Sleeper" onReset={(el) => { now.reset(); setOpen(null, el); }} />
              <div className="lu-list-head sub"><b>Bench</b><span className="tiny muted">{benchNow.length + benchK.length} players</span></div>
              {benchNow.map((p) => {
                const key = `b${p.id}`;
                const tap = tapFor(key, candidateLock(p), `Start ${p.name}`);
                const options: SwapOption[] = now.mine.map((x, i) => ({ x, i })).filter(({ x }) => fits(x.slot, p.pos)).map(({ x, i }) => {
                  const cur = x.id ? playerById(x.id) : null, label = lbl(x.slot), d = eff(p, true) - expect(live, x.id);
                  return { key: `${i}`, who: <SlotAt slot={label}><Who p={cur} side="you" /></SlotAt>, name: `${label}, ${cur?.name ?? "empty"}`, pts: cur ? expect(live, cur.id) : 0, delta: round1(d), up: d >= 0, lock: starterLock(cur), onPick: pick(() => now.setMine((c) => swapInto(c, i, p.id))) };
                });
                return (
                  <Fragment key={key}>
                    <LineupRow p={p} slot="BN" bench live={live} tap={tap} ai={aiMarks?.[p.id]} />
                    <PickAt show={open === key}><SwapPicker menuRef={menuRef} className="lu-pick" title={`Start ${p.name} over`} empty={`${p.name} can't play any of your starting slots.`} options={options} info={info(p, "On your bench")} /></PickAt>
                  </Fragment>
                );
              })}
              {benchK.map((p) => {
                const key = `bk${p.id}`;
                const tap = tapFor(key, candidateLock(p), `Start ${p.name}`);
                const options: SwapOption[] = now.base.k.map((sk, i) => ({ sk, i })).filter(({ sk }) => sk.slot === p.pos).map(({ sk, i }) => {
                  const cur = now.mineK[i] ?? null, d = round1(spPts(live, p) - spPts(live, cur));
                  return { key: `${i}`, who: <SlotAt slot={sk.slot}><SpecialWho p={cur} side="you" /></SlotAt>, name: `${sk.slot}, ${cur?.name ?? "empty"}`, pts: spPts(live, cur), delta: d, up: d >= 0, lock: starterLock(cur), onPick: pick(() => now.setMineK((c) => c.map((y, j) => (j === i ? p : y)))) };
                });
                return (
                  <Fragment key={key}>
                    <SpecialRow p={p} slot="BN" bench live={live} tap={tap} />
                    <PickAt show={open === key}><SwapPicker menuRef={menuRef} className="lu-pick" title={`Start ${p.name} over`} empty={`No ${p.pos} slot to start ${p.name} in.`} options={options} /></PickAt>
                  </Fragment>
                );
              })}
              <IrBlock onOpen={openPlayer} />
              </>}
            </section>
          )}
        </div>
        {side && <div className="lu-col lu-side">
          <LineupWeek.Provider value={week}>{side}</LineupWeek.Provider>
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
                <Select id={`tag-${id}`} className="tag-select" aria-label={`Tag for ${p.name}`} value={(myTags[id] ?? "") as MyTag | ""} onChange={(v) => setTag(id, v)}
                  options={[{ value: "" as MyTag | "", label: "No tag" }, ...(Object.keys(TAG_LABEL) as MyTag[]).map((k) => ({ value: k as MyTag | "", label: TAG_LABEL[k] }))]} />
              </div>
            );
          })}
        </section>
      </div>}

      {view === "price" && <section className="card wt" aria-labelledby="wt-title">
        <header className="wt-head">
          <h2 className="section-title" id="wt-title">What would it take?</h2>
          <p>Set an asking price on anyone you'd move. Sources finds the cheapest offer from each team that meets it, and trade ideas never go below it.</p>
        </header>
        {(movable.length > 0 || untouch.length > 0) && (
          <ul className="wt-quick" aria-label="Tagged players without a price">
            {movable.map((pid) => { const p = playerById(pid); return (
              <li key={pid}><Avatar p={p} size={28} /><span className="wt-qname"><b>{p.name}</b><small>{TAG_LABEL[myTags[pid]!]} · no asking price</small></span>
                <button className="btn btn-xs" onClick={() => setPrice(pid, DEFAULT_PRICE)}>Set a price</button></li>
            ); })}
            {untouch.map((pid) => { const p = playerById(pid); return (
              <li key={pid}><Avatar p={p} size={28} /><span className="wt-qname"><b>{p.name}</b><small>Untouchable · left out of every idea</small></span>
                <button className="btn btn-xs" onClick={() => { setTag(pid, "amazing"); setPrice(pid, DEFAULT_PRICE); }}>Set a price instead</button></li>
            ); })}
          </ul>
        )}
        {unpriced.length > 0 && (
          <div className="wt-add">
            <Select id="wt-add" className="tag-select" aria-label="Set a price on another player" value={"" as string}
              onChange={(v) => { if (v) setPrice(v, DEFAULT_PRICE); }}
              searchPlaceholder="Search your players"
              options={[{ value: "", label: "Price another player" }, ...unpriced.map((id) => { const p = playerById(id); return { value: id, label: p.name, hint: p.pos, match: { pos: p.pos, team: p.nfl } }; })]} />
          </div>
        )}
        {locked.length === 0 && movable.length === 0 && untouch.length === 0 && <p className="wt-empty">No asking prices yet. Pick a player above, or <button className="linkish" onClick={() => setView("tags")}>tag a player</button> as overpay only.</p>}
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
                {myTags[pid] !== "amazing" && <button className="linkish wt-clear" onClick={() => setPrice(pid, null)}>Remove price</button>}
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
