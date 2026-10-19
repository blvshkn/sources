import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScheduleStrip } from "./Schedule";
import { PlayerNews } from "./News";

/** Latest news, shown only when there is some. */
const PlayerNewsBlock = ({ p }: { p: Player }) => <PlayerNews p={p} wrap={(list) => <div className="ps-games ps-news"><div className="ps-sub"><b>Latest news</b></div>{list}</div>} />;
import { LEAGUE, Player, WEEK, gameLine, onBye } from "../data";
import { eff, fmt, round1, scored } from "../engine";
import { Avatar } from "./Avatar";
import { Icon, StatusPill } from "./ui";
import { usePullToDismiss } from "./sheetDrag";

/** Your past weekly points for this player, from the matchups Sleeper has on record. */
const weekly = (p: Player) => Object.keys(LEAGUE.history ?? {}).map(Number).filter((w) => w < WEEK).sort((a, b) => a - b)
  .map((w) => ({ w, pts: LEAGUE.history![w].points[p.id], started: LEAGUE.history![w].starters.includes(p.id) }))
  .filter((x): x is { w: number; pts: number; started: boolean } => typeof x.pts === "number");

/** Player details in a bottom sheet, so you stay on the page you were on. */
export function PlayerSheet({ p, where, note, onClose, onCompare }: { p: Player; where?: string; note?: ReactNode; onClose: () => void; onCompare?: () => void }) {
  const [shown, setShown] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => setShown(true));
    closeBtn.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", key);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = prev; };
  }, []);
  const close = () => { const el = sheet.current; if (el) { el.style.transition = ""; el.style.transform = ""; } if (scrim.current) { scrim.current.style.transition = ""; scrim.current.style.opacity = ""; } setShown(false); window.setTimeout(onClose, 220); };
  const sheet = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  // Pull down from anywhere once the sheet is scrolled to the top; a flick or a long pull closes it
  usePullToDismiss(sheet,
    (y) => {
      if (sheet.current) { sheet.current.style.transition = "none"; sheet.current.style.transform = `translateY(${y}px)`; }
      if (scrim.current) { scrim.current.style.transition = "none"; scrim.current.style.opacity = String(Math.max(0, 1 - y / 400)); }
    },
    (y, v) => {
      if (y > 120 || v > 700) close();
      else {
        if (sheet.current) { sheet.current.style.transition = ""; sheet.current.style.transform = ""; }
        if (scrim.current) { scrim.current.style.transition = ""; scrim.current.style.opacity = ""; }
      }
    });

  const games = weekly(p);
  const avg = games.length ? round1(games.reduce((a, g) => a + g.pts, 0) / games.length) : null;
  const max = Math.max(1, ...games.map((g) => g.pts), eff(p, true));
  const playoff = p.playoff ? round1(scored({ ...p, pts: p.playoff, wk: undefined })) : null;

  return (
    <div className={`ps-wrap${shown ? " in" : ""}`}>
      <div ref={scrim} className="ps-scrim" onClick={close} aria-hidden="true" />
      <section ref={sheet} className="ps" role="dialog" aria-modal="true" aria-labelledby="ps-name">
        <span className="ps-handle" aria-hidden="true" />
        <header className="ps-head">
          <Avatar p={p} size={56} />
          <span className="ps-who">
            <b id="ps-name">{p.name}</b>
            <small>{p.pos} · {p.nfl}{onBye(p.nfl) ? "" : gameLine(p) ? ` · ${gameLine(p)}` : ""} <StatusPill p={p} /></small>
            {where && <span className={`ps-where${/bench|\w's /i.test(where) ? " bench" : ""}`}>{where}</span>}
          </span>
          <button ref={closeBtn} className="ps-x" onClick={close} aria-label="Close"><Icon name="x" size={18} /></button>
        </header>
        {note && <p className="ps-why">{note}</p>}
        {(p.note || p.injury) && <p className="ps-inj"><Icon name="alert" size={14} />{[p.injury, p.note].filter(Boolean).join(" · ")}</p>}

        {(() => {
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
            </div>
          );
        })()}

        <div className="ps-games">
          <div className="ps-sub"><b>Game log</b>{avg !== null && <span><i className="ps-avg-key" />{avg.toFixed(1)} avg</span>}</div>
          {games.length ? (
            <div className="ps-bars" role="list">
              {avg !== null && <span className="ps-avg" aria-hidden="true" style={{ bottom: `calc(18px + (100% - 36px) * ${(avg / max).toFixed(3)})` }} />}
              {games.map((g, i) => {
                const tone = !g.started ? " bn" : avg !== null && g.pts >= avg ? " hi" : "";
                return (
                  <div key={g.w} className={`ps-bar${tone}`} style={{ ["--i" as string]: i }} role="listitem" aria-label={`Week ${g.w}: ${g.pts.toFixed(1)} points${g.started ? "" : ", on your bench"}`}>
                    <b>{g.pts.toFixed(1)}</b>
                    <span><i style={{ height: `${Math.max(2, (g.pts / max) * 100)}%` }} /></span>
                    <small>W{g.w}</small>
                  </div>
                );
              })}
              <div className="ps-bar proj" style={{ ["--i" as string]: games.length }} role="listitem" aria-label={onBye(p.nfl) ? `Week ${WEEK}: bye` : `Week ${WEEK} projection: ${eff(p, true).toFixed(1)}`}>
                <b>{onBye(p.nfl) ? "Bye" : eff(p, true).toFixed(1)}</b>
                <span><i style={{ height: `${onBye(p.nfl) ? 0 : Math.max(2, (eff(p, true) / max) * 100)}%` }} /></span>
                <small>W{WEEK}</small>
              </div>
            </div>
          ) : <p className="ps-none">No games on record with your team yet.</p>}
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
        <PlayerNewsBlock p={p} />

        {onCompare && <button className="btn btn-primary ps-cta" onClick={() => { close(); window.setTimeout(onCompare, 220); }}>Compare in Start / Sit</button>}
      </section>
    </div>
  );
}
