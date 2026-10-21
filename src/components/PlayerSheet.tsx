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
import { PlatformLogo } from "./PlatformLogo";
import { PlayerHero, WatchButton, holdHeader } from "./PlayerHero";
import { toggleWatch, useWatchApi, waiverWeek } from "./watchCtx";
import { usePullToDismiss } from "./sheetDrag";
import { useFocusTrap } from "./focusTrap";
import { useDismiss } from "./useDismiss";
import { useEdgeFade } from "./edgeFade";
import { ScrollArea } from "./ScrollArea";
import { DepthTab, GameLogTab, SheetTabs, useSheetTab } from "./PlayerTabs";

/** Below this the player is a bottom sheet; from here up (tablet and desktop) a centered modal. Matches player-modal.css. */
const isSheet = () => typeof window !== "undefined" && window.innerWidth < 768;

/** Player details in a bottom sheet on phones and a centered modal from 768px, so you stay on the page you were on. */
export function PlayerSheet({ p: first, where: firstWhere, note: firstNote, onClose, onCompare: firstCompare }: { p: Player; where?: string; note?: ReactNode; onClose: () => void; onCompare?: () => void; focus?: "news" }) {
  const [shown, setShown] = useState(false);
  // A name tapped in the depth chart opens that player here; the opener's context (where, note, compare) was about the first one
  const [p, setP] = useState(first);
  const other = p.id !== first.id;
  const where = other ? undefined : firstWhere, note = other ? undefined : firstNote, onCompare = other ? undefined : firstCompare;
  // Overview, Game log, Depth chart. The tab row sits in the fixed top with the header, so neither moves on a switch.
  const [tab, setTab] = useSheetTab("player", ["main", "log", "depth"]);
  const pick = (t: typeof tab) => { holdHeader(body.current); setTab(t); body.current?.scrollTo({ top: 0 }); };
  const openOther = (id: string) => { const n = PLAYERS[id]; if (!n) return; setP(n); setWeek(WEEK); setTab("main"); body.current?.scrollTo({ top: 0 }); };
  // Which week the sheet shows. The header and stepper stay put; the body below them swaps.
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
  const close = () => { const el = sheet.current; if (el) { el.style.transition = ""; el.style.transform = ""; } if (scrim.current) { scrim.current.style.transition = ""; scrim.current.style.opacity = ""; } setShown(false); window.setTimeout(onClose, 220); };
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
  const primary = onCompare
    ? <button className="btn btn-primary btn-sm ph-cta" onClick={() => { close(); window.setTimeout(onCompare, 220); }}><Icon name="switch" size={16} />Compare</button>
    : swap
      ? <a className="btn btn-primary btn-sm ph-cta" href={sleeperUrl("team")} target="_blank" rel="noreferrer"><PlatformLogo size={16} />Swap in Sleeper</a>
      : !owner && p.nfl !== "FA"
        ? <a className="btn btn-primary btn-sm ph-cta" href={sleeperUrl("players")} target="_blank" rel="noreferrer"><PlatformLogo size={16} />Claim</a>
        : null;

  // Portaled to body: rendered in place it inherited the page's stacking (Lineup's sticky side column made it a
  // z-index 0 layer), so the docked inbox and the desk bell painted over the sheet and its scrim.
  return createPortal(
    <div className={`ps-wrap pl-wrap${shown ? " in" : ""}`}>
      <div ref={scrim} className="ps-scrim" onClick={close} aria-hidden="true" />
      <section ref={sheet} className="ps ps-player" role="dialog" aria-modal="true" aria-labelledby="ps-name">
        <div className="pd-top">
        <span className="ps-handle" aria-hidden="true" />
        <PlayerHero key={p.id} s={p} nameId="ps-name" where={where}
          meta={onBye(p.nfl) ? undefined : kickLine(p) || undefined}
          status={<StatusPill p={p} />}
          actions={<>
            {primary}
            {watchApi && <WatchButton on={watchApi.watch[p.id] !== undefined} name={p.name} week={watchApi.watch[p.id] ?? watchFor} onToggle={() => toggleWatch(watchApi, p, watchFor)} />}
          </>} />
        <button ref={closeBtn} className="ps-x" onClick={close} aria-label="Close"><Icon name="x" size={18} /></button>
        <SheetTabs value={tab} onChange={pick} options={[{ v: "main", label: "Overview", icon: "overview" }, { v: "log", label: "Game log", icon: "table" }, { v: "depth", label: "Depth chart", icon: "listOrdered" }]} />
        {tab === "main" && <WeekStepper week={week} onChange={(w) => { holdHeader(body.current); setWeek(w); body.current?.scrollTo({ top: 0 }); }} className="pd-weeknav" />}
        </div>
        {/* Only this scrolls; the shell clips it to the rounded corners and the header above stays put */}
        <ScrollArea ref={body} className={`ps-body${tab === "main" ? "" : " pt-body"}`} data-sheet-scroll>
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
      </section>
    </div>,
    document.body,
  );
}
