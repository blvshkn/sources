import { useEffect, useRef, useState, type ReactNode } from "react";
import { useBackClose } from "../backClose";
import { createPortal } from "react-dom";
import { ScheduleStrip } from "./Schedule";
import { LineupCall, OutcomeRange, WeekDepth, gameLog, lineupCall, nowFor, outcomeFor, statusDetail } from "./PlayerDepth";
import { WeekStepper } from "./WeekStepper";
import { useLive } from "../live";
import { PLAYERS, Player, TEAMS, WEEK, onBye, sleeperUrl } from "../data";
import { kickLine, useKickoffs } from "../kickoff";
import { eff, fmt, round1, scored } from "../engine";
import { Icon, StatusPill } from "./ui";
import { deny } from "../deny";
import { PlatformLogo } from "./PlatformLogo";
import { PlayerBar, PlayerHero, WatchButton, keepTabs } from "./PlayerHero";
import { toggleWatch, useWatchApi, waiverWeek } from "./watchCtx";
import { usePullToDismiss } from "./sheetDrag";
import { useFocusTrap } from "./focusTrap";
import { useDismiss } from "./useDismiss";
import { useEdgeFade } from "./edgeFade";
import { ScrollArea } from "./ScrollArea";
import { DepthTab, GameLogTab, SheetTabs, useSheetTab } from "./PlayerTabs";
import { mo } from "../motion";

/** Below this the player is a bottom sheet; from here up (tablet and desktop) a centered modal. Matches player-modal.css. */
const isSheet = () => typeof window !== "undefined" && window.innerWidth < 768;

/** Player details in a bottom sheet on phones and a centered modal from 768px, so you stay on the page you were on. */
export function PlayerSheet({ p: first, where: firstWhere, note: firstNote, onClose, onCompare: firstCompare, onLineup, onStartSit }: { p: Player; where?: string; note?: ReactNode; onClose: () => void; onCompare?: () => void; focus?: "news";
  /** Your player, opened from Overview: a way to your Lineup from the sheet (Zach, Oct 23) */
  onLineup?: () => void;
  /** Your player: Compare him with the others who could start in his spot (Lineup's compare) */
  onStartSit?: () => void }) {
  const [shown, setShown] = useState(false);
  // A name tapped in the depth chart opens that player here; the opener's context (where, note, compare) was about the first one
  const [p, setP] = useState(first);
  const other = p.id !== first.id;
  const where = other ? undefined : firstWhere, note = other ? undefined : firstNote, onCompare = other ? undefined : firstCompare;
  // Overview, Game log, Depth chart. The tab row sticks under the sheet's top; a switch keeps it exactly where it is.
  const [tab, setTab] = useSheetTab("player", ["main", "log", "depth"]);
  const pick = (t: typeof tab) => { keepTabs(body.current); setTab(t); };
  const openOther = (id: string) => { const n = PLAYERS[id]; if (!n) return; setP(n); setWeek(WEEK); setTab("main"); body.current?.scrollTo({ top: 0 }); };
  // Which week the sheet shows. The tabs and stepper stay put; the content below them swaps.
  const [week, setWeek] = useState(WEEK);
  useKickoffs(week);
  const cur = week === WEEK;
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => setShown(true));
    closeBtn.current?.focus();
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  // Out on a shorter 240ms ease (styles.css .ps-wrap.out), unmounted only once it has fully left
  const [out, setOut] = useState(false);
  const close = () => { const el = sheet.current; if (el) { el.style.transition = ""; el.style.transform = ""; } if (scrim.current) { scrim.current.style.transition = ""; scrim.current.style.opacity = ""; } setOut(true); setShown(false); window.setTimeout(onClose, mo(240)); };
  const sheet = useRef<HTMLElement>(null);
  useFocusTrap(sheet);
  const body = useRef<HTMLDivElement>(null);
  useEdgeFade(body);
  const scrim = useRef<HTMLDivElement>(null);
  // Pull down from anywhere once the sheet is scrolled to the top; a flick or a long pull closes it.
  // Phone sheet only: from 768px up it's a centered modal that stays put.
  useDismiss(sheet, () => close(), { outside: false });
  useBackClose(close);
  usePullToDismiss(sheet, { scrim, enabled: isSheet, onDismiss: () => close() });

  const { games } = gameLog(p);
  const live = useLive();
  const range = outcomeFor(p, games.map((g) => g.pts), nowFor(live, p));
  const status = statusDetail(p);
  const avg = games.length ? round1(games.reduce((a, g) => a + g.pts, 0) / games.length) : null;
  const max = Math.max(1, ...games.map((g) => g.pts), eff(p, true));
  const playoff = p.playoff ? round1(scored({ ...p, pts: p.playoff, wk: undefined })) : null;

  // The header's actions: Watch (the Waivers watchlist), plus the one move that fits whose he is
  const watchApi = useWatchApi();
  const watchFor = waiverWeek();
  const owner = TEAMS.find((t) => [...t.roster, ...(t.ir ?? []), ...(t.taxi ?? [])].includes(p.id));
  // Swap in Sleeper only when the lineup call asks for a change in your Sleeper lineup (the same test LineupCall uses)
  const call = owner?.you && !onCompare ? lineupCall(p, nowFor(live, p)) : null;
  const swap = !!call && (/in Sleeper|Sleeper still has him/.test(call.line) || call.head === "Take him out of your lineup");
  // Locked (his game kicked off): the swap can't happen, so the button shows but is off, and says why on a tap
  const gs = live?.games[p.nfl];
  const kicked = owner?.you && (gs === "in_game" || gs === "complete");
  const primary = onCompare
    ? <button className="btn btn-primary btn-sm ph-cta" onClick={() => { close(); window.setTimeout(onCompare, mo(240)); }}><Icon name="columns2" size={16} />Compare</button>
    : kicked
      ? <button type="button" className="btn btn-primary btn-sm ph-cta" aria-disabled="true"
          onClick={(e) => deny(e.currentTarget, gs === "complete" ? `${p.name}'s game is final. His spot locked at kickoff.` : `${p.name} is playing now. Lineups lock at kickoff.`)}>
          <PlatformLogo size={16} />Swap in Sleeper</button>
    : swap
      ? <a className="btn btn-primary btn-sm ph-cta" href={sleeperUrl("team")} target="_blank" rel="noreferrer"><PlatformLogo size={16} />Swap in Sleeper</a>
      : !owner && p.nfl !== "FA"
        ? <a className="btn btn-primary btn-sm ph-cta" href={sleeperUrl("players")} target="_blank" rel="noreferrer"><PlatformLogo size={16} />Claim</a>
        : null;

  // Watch first, the main move last so it sits on the right (Zach, Oct 23)
  const lineupBtn = owner?.you && onLineup
    ? <button type="button" className="btn btn-sm ph-lineup" onClick={() => { close(); window.setTimeout(onLineup, mo(240)); }}><Icon name="helmet" size={16} />Lineup</button> : null;
  const startSitBtn = owner?.you && onStartSit && !kicked
    ? <button type="button" className="btn btn-sm ph-compare" onClick={() => { close(); window.setTimeout(onStartSit, mo(240)); }}><Icon name="columns2" size={16} />Compare</button> : null;
  const watchBtn = watchApi ? <WatchButton on={watchApi.watch[p.id] !== undefined} name={p.name} week={watchApi.watch[p.id] ?? watchFor} onToggle={() => toggleWatch(watchApi, p, watchFor)} /> : null;
  const actions = (primary || lineupBtn || startSitBtn) ? <>
    {lineupBtn}
    {startSitBtn}
    {primary}
  </> : null;

  // Portaled to body: rendered in place it inherited the page's stacking (Lineup's sticky side column made it a
  // z-index 0 layer), so the docked inbox and the desk bell painted over the sheet and its scrim.
  return createPortal(
    <div className={`ps-wrap pl-wrap${shown ? " in" : ""}${out ? " out" : ""}`}>
      <div ref={scrim} className="ps-scrim" onClick={close} aria-hidden="true" />
      <section ref={sheet} className="ps ps-player" role="dialog" aria-modal="true" aria-labelledby="ps-name">
        {/* One constant height: the handle, the compact bar (shown once the hero's name scrolls away) and close */}
        <div className="pd-top">
          <span className="ps-handle" aria-hidden="true" />
          <PlayerBar key={p.id} s={p} />
          <button ref={closeBtn} className="ps-x" onClick={close} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>
        {/* Only this scrolls: the hero, then the tabs (sticky), then the tab's content */}
        <ScrollArea ref={body} className={`ps-body${tab === "main" ? "" : " pt-body"}`} data-sheet-scroll>
        <PlayerHero key={p.id} s={p} nameId="ps-name" where={where}
          meta={onBye(p.nfl) ? undefined : kickLine(p) || undefined}
          status={<StatusPill p={p} />}
          actions={actions} watch={watchBtn} />
        <div className="ph-stick">
          <SheetTabs value={tab} onChange={pick} options={[{ v: "main", label: "Overview", icon: "overview" }, { v: "log", label: "Game log", icon: "table" }, { v: "depth", label: "Depth chart", icon: "listOrdered" }]} />
          {tab === "main" && <WeekStepper week={week} onChange={(w) => { keepTabs(body.current); setWeek(w); }} className="pd-weeknav" />}
        </div>
        {tab === "log" && <GameLogTab key={p.id} s={p} />}
        {tab === "depth" && <DepthTab key={p.id} s={p} onOpen={openOther} />}
        {tab === "main" && <>
        {note && cur && <p className="ps-why">{note}</p>}
        {status && week >= WEEK && <p className={`ps-inj${p.status === "O" ? " out" : ""}`}><Icon name="alert" size={14} />{status}</p>}

        {cur && (() => {
          const bye = onBye(p.nfl);
          const wk = eff(p, true), ros = eff(p);
          const trend = bye ? null : round1(wk - ros);
          return (
            <div className="ps-hero">
              <div className="ps-hero-main">
                <span className="ps-k">This week</span>
                <b className={bye ? "bye" : ""}>{bye ? "Bye" : wk.toFixed(1)}</b>
                {trend !== null && Math.abs(trend) >= 0.5 && <span className={`ps-trend ${trend > 0 ? "up" : "down"}`}>{fmt(trend)} vs his ROS avg</span>}
                {bye && <span className="ps-trend">No game this week</span>}
              </div>
              <dl className="ps-hero-side">
                <div><dt>ROS / wk</dt><dd>{ros.toFixed(1)}</dd></div>
                <div><dt>Playoffs / wk</dt><dd>{playoff !== null ? playoff.toFixed(1) : "n/a"}</dd></div>
                {p.value !== undefined && <div><dt>Trade value</dt><dd>{Math.round(p.value).toLocaleString()}</dd></div>}
              </dl>
              {range && <OutcomeRange p={p} o={range} />}
            </div>
          );
        })()}

        {cur && <LineupCall p={p} />}
        <WeekDepth p={p} week={week} avg={avg} />

        <div className="ps-games">
          <div className="ps-sub"><b>Game log</b>{avg !== null && <span><i className="ps-avg-key" />{avg.toFixed(1)} avg</span>}</div>
          {games.length ? (
            <div className="ps-bars" role="list">
              {avg !== null && <span className="ps-avg" aria-hidden="true" style={{ bottom: `calc(18px + (100% - 36px) * ${(avg / max).toFixed(3)})` }} />}
              {games.map((g, i) => {
                const tone = !g.started ? " bn" : avg !== null && g.pts >= avg ? " hi" : "";
                return (
                  <div key={g.w} className={`ps-bar${tone}`} data-sel={g.w === week || undefined} style={{ ["--i" as string]: i }} role="listitem" aria-label={`Week ${g.w}: ${g.pts.toFixed(1)} points${g.started ? "" : ", on your bench"}`}>
                    <b>{g.pts.toFixed(1)}</b>
                    <span><i style={{ height: `${Math.max(2, (g.pts / max) * 100)}%` }} /></span>
                    <small>W{g.w}</small>
                  </div>
                );
              })}
              <div className="ps-bar proj" data-sel={cur || undefined} style={{ ["--i" as string]: games.length }} role="listitem" aria-label={onBye(p.nfl) ? `Week ${WEEK}: bye` : `Week ${WEEK} projection: ${eff(p, true).toFixed(1)}`}>
                <b>{onBye(p.nfl) ? "Bye" : eff(p, true).toFixed(1)}</b>
                <span><i style={{ height: `${onBye(p.nfl) ? 0 : Math.max(2, (eff(p, true) / max) * 100)}%` }} /></span>
                <small>W{WEEK}</small>
              </div>
            </div>
          ) : <p className="ps-none">No games on record yet.</p>}
          {games.length > 0 && (
            <p className="ps-legend">
              <span><i className="hi" />Beat his average</span>
              <span><i />Below</span>
              {games.some((g) => !g.started) && <span><i className="bn" />Bench week</span>}
              <span><i className="proj" />Projected</span>
            </p>
          )}
        </div>
        <div className="ps-games ps-sched">
          <div className="ps-sub"><b>Season schedule</b><span className="sch-key"><i className="t-good" />Good<i className="t-tough" />Tough</span></div>
          <ScheduleStrip p={p} />
        </div>

        </>}
        </ScrollArea>
        {/* Phones: the same actions, docked to the bottom edge (sheet-actions.css) */}
        {actions && <div className="ph-dock">{actions}</div>}
      </section>
    </div>,
    document.body,
  );
}
