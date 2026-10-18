import { useEffect, useRef, useState } from "react";
import { LEAGUE, Player, WEEK, gameLine, onBye } from "../data";
import { eff, round1, scored } from "../engine";
import { Avatar } from "./Avatar";
import { Icon, StatusPill } from "./ui";

/** Your past weekly points for this player, from the matchups Sleeper has on record. */
const weekly = (p: Player) => Object.keys(LEAGUE.history ?? {}).map(Number).filter((w) => w < WEEK).sort((a, b) => a - b)
  .map((w) => ({ w, pts: LEAGUE.history![w].points[p.id], started: LEAGUE.history![w].starters.includes(p.id) }))
  .filter((x): x is { w: number; pts: number; started: boolean } => typeof x.pts === "number");

/** Player details in a bottom sheet, so you stay on the page you were on. */
export function PlayerSheet({ p, where, onClose, onCompare }: { p: Player; where?: string; onClose: () => void; onCompare?: () => void }) {
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
  const close = () => { setShown(false); window.setTimeout(onClose, 200); };

  const games = weekly(p);
  const avg = games.length ? round1(games.reduce((a, g) => a + g.pts, 0) / games.length) : null;
  const max = Math.max(1, ...games.map((g) => g.pts), eff(p, true));
  const playoff = p.playoff ? round1(scored({ ...p, pts: p.playoff, wk: undefined })) : null;

  return (
    <div className={`ps-wrap${shown ? " in" : ""}`}>
      <div className="ps-scrim" onClick={close} aria-hidden="true" />
      <section className="ps" role="dialog" aria-modal="true" aria-labelledby="ps-name">
        <span className="ps-handle" aria-hidden="true" />
        <header className="ps-head">
          <Avatar p={p} size={56} />
          <span className="ps-who">
            <b id="ps-name">{p.name}</b>
            <small>{p.pos} · {p.nfl}{onBye(p.nfl) ? "" : gameLine(p) ? ` · ${gameLine(p)}` : ""} <StatusPill p={p} /></small>
            {where && <small className="ps-where">{where}</small>}
          </span>
          <button ref={closeBtn} className="ps-x" onClick={close} aria-label="Close"><Icon name="x" size={18} /></button>
        </header>
        {(p.note || p.injury) && <p className="ps-inj"><Icon name="alert" size={14} />{[p.injury, p.note].filter(Boolean).join(" · ")}</p>}

        <dl className="ti-stats ps-stats">
          <div className="ti-stat"><dt>This week</dt><dd>{onBye(p.nfl) ? "Bye" : eff(p, true).toFixed(1)}</dd></div>
          <div className="ti-stat"><dt>ROS / wk</dt><dd>{eff(p).toFixed(1)}</dd></div>
          <div className="ti-stat"><dt>Playoffs / wk</dt><dd>{playoff !== null ? playoff.toFixed(1) : "n/a"}</dd></div>
        </dl>

        <div className="ps-games">
          <div className="ps-sub"><b>Game log</b>{avg !== null && <span>{avg.toFixed(1)} avg</span>}</div>
          {games.length ? (
            <div className="ps-bars" role="list">
              {games.map((g) => (
                <div key={g.w} className={`ps-bar${g.started ? "" : " bn"}`} role="listitem" aria-label={`Week ${g.w}: ${g.pts.toFixed(1)} points${g.started ? "" : ", on your bench"}`}>
                  <b>{g.pts.toFixed(1)}</b>
                  <span><i style={{ height: `${(g.pts / max) * 100}%` }} /></span>
                  <small>W{g.w}</small>
                </div>
              ))}
              <div className="ps-bar proj" role="listitem" aria-label={`Week ${WEEK} projection: ${eff(p, true).toFixed(1)}`}>
                <b>{eff(p, true).toFixed(1)}</b>
                <span><i style={{ height: `${(eff(p, true) / max) * 100}%` }} /></span>
                <small>W{WEEK}</small>
              </div>
            </div>
          ) : <p className="ps-none">No games on record with your team yet.</p>}
          {games.some((g) => !g.started) && <p className="ps-key">Faded bars were bench weeks. The outlined bar is this week's projection.</p>}
        </div>

        {p.value !== undefined && (
          <div className="ps-row"><span>Trade value</span><b>{Math.round(p.value).toLocaleString()}</b></div>
        )}

        {onCompare && <button className="btn ps-cta" onClick={() => { close(); window.setTimeout(onCompare, 220); }}>Compare in Start / Sit</button>}
      </section>
    </div>
  );
}
