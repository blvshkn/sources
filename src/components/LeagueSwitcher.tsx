import { useEffect, useRef, useState } from "react";
import { findLeagues } from "../sleeper";
import { LEAGUE, LEAGUE_NAME } from "../data";
import { Icon } from "./ui";
import { usePullToDismiss } from "./sheetDrag";

type Row = { id: string; name: string; teams: number; avatar?: string | null };

/** Switch between your Sleeper leagues without leaving the app. */
export function LeagueSwitcher({ userId, username, demo, onPick, onConnect, onClose }: {
  userId?: string; username?: string; demo: boolean;
  onPick: (leagueId: string) => void; onConnect: () => void; onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const sheet = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const close = () => {
    if (sheet.current) { sheet.current.style.transition = ""; sheet.current.style.transform = ""; }
    if (scrim.current) { scrim.current.style.transition = ""; scrim.current.style.opacity = ""; }
    setShown(false); window.setTimeout(onClose, 220);
  };

  useEffect(() => {
    requestAnimationFrame(() => setShown(true));
    closeBtn.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", key);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    if (!demo && userId) {
      findLeagues(userId)
        .then(({ leagues }) => setRows(leagues.map((l) => ({ id: l.league_id, name: l.name, teams: l.total_rosters, avatar: l.avatar }))))
        .catch(() => setErr("Couldn't reach Sleeper. Try again in a minute."));
    } else setRows([]);
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = prev; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const initials = (s: string) => s.replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const Mark = ({ r }: { r: Row }) => r.avatar
    ? <img className="lsw-av" src={`https://sleepercdn.com/avatars/thumbs/${r.avatar}`} alt="" />
    : <span className="lsw-av">{initials(r.name)}</span>;

  return (
    <div className={`ps-wrap${shown ? " in" : ""}`}>
      <div ref={scrim} className="ps-scrim" onClick={close} aria-hidden="true" />
      <section ref={sheet} className="ps lsw" role="dialog" aria-modal="true" aria-labelledby="lsw-title">
        <span className="ps-handle" aria-hidden="true" />
        <header className="fb-head">
          <span><b id="lsw-title">Your leagues</b><small>{demo ? "You're exploring the demo league." : `Sleeper leagues for @${username}`}</small></span>
          <button ref={closeBtn} className="ps-x" onClick={close} aria-label="Close"><Icon name="x" size={18} /></button>
        </header>
        <ul className="fb-list">
          {demo && (
            <li><span className="lsw-row on"><span className="lsw-av">DL</span><span className="lsw-n"><b>{LEAGUE_NAME}</b><small>Sample data</small></span><Icon name="check" size={18} /></span></li>
          )}
          {!demo && rows === null && !err && <li className="lsw-load">Loading your leagues…</li>}
          {err && <li className="lsw-load">{err}</li>}
          {rows?.map((r) => {
            const on = r.id === LEAGUE.id;
            return (
              <li key={r.id}>
                <button className={`lsw-row${on ? " on" : ""}`} aria-current={on ? "true" : undefined} onClick={() => { if (!on) onPick(r.id); close(); }}>
                  <Mark r={r} />
                  <span className="lsw-n"><b>{r.name}</b><small>{r.teams} teams</small></span>
                  {on ? <Icon name="check" size={18} /> : <Icon name="chev" size={16} />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="lsw-foot">
          {demo
            ? <button className="btn btn-primary" onClick={() => { close(); onConnect(); }}><Icon name="plug" size={16} />Connect Sleeper</button>
            : <button className="btn" onClick={() => { close(); onConnect(); }}><Icon name="plus" size={16} />Use another Sleeper account</button>}
        </div>
      </section>
    </div>
  );
}
