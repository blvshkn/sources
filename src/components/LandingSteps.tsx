// "Up and running in a minute." on the landing: three steps that each show the thing happening, built from the
// app's own pieces. The username pill resolves with the Sleeper chip, the league row loads with the real thinking
// trace step ("Loaded 10 teams from Sleeper"), and a real trade idea from the sample league lands with its points.
// A rail joins the number chips and fills as you scroll; each chip lights when the fill reaches it. Each demo plays
// once when it scrolls into view, after the one before it. Reduced motion shows every end state at once.
import { SplitHead } from "./SplitHead";
import { setInert } from "../inert";
import { useEffect, useRef, useState } from "react";
import { LEAGUE, LEAGUE_NAME, TEAMS, playerById, teamById } from "../data";
import { fmt, type Trade } from "../engine";
import { Icon } from "./ui";
import { PlatformLogo } from "./PlatformLogo";
import { ManagerAvatar } from "./Avatar";
import { AiMark } from "./WorkingLoader";

const USER = "blevishkin";
const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

/** The demos run at a bit over half their written timing (Zach, Oct 23: they need to come in faster) */
const PACE = 0.55;

/** Steps through `marks` (ms from start) once `go` turns true. Returns how many marks have passed. */
function usePhase(go: boolean, marks: number[], onDone: () => void): number {
  // Reduced motion: the end state from the first paint, in view or not
  const [k, setK] = useState(() => (reduced() ? marks.length : 0));
  useEffect(() => {
    if (reduced()) { setK(marks.length); onDone(); return; }
    if (!go) return;
    const ids = marks.map((ms, i) => window.setTimeout(() => { setK(i + 1); if (i === marks.length - 1) onDone(); }, ms * PACE));
    return () => ids.forEach(clearTimeout);
  }, [go]); // eslint-disable-line react-hooks/exhaustive-deps
  return k;
}

const SleeperChip = () => <span className="thk-chip k-feed has-logo">Sleeper<PlatformLogo platform="sleeper" size={16} /></span>;

function UserDemo({ go, onDone }: { go: boolean; onDone: () => void }) {
  // One mark per letter, then a beat, then it resolves
  const marks = [...USER].map((_, i) => 220 + i * 80);
  marks.push(marks[marks.length - 1] + 520);
  const k = usePhase(go, marks, onDone);
  const typed = USER.slice(0, Math.min(k, USER.length));
  const found = k > USER.length;
  return (
    <div className={`lds-demo lds-user${found ? " found" : ""}`}>
      <span className="nudge-kind"><Icon name="plug" size={15} />Connect Sleeper</span>
      <div className="lds-field">
        <span className="at">@</span>
        <span className="lds-typed">{typed || <span className="lds-ph">yourname…</span>}<i className={`lds-caret${go && !found ? " on" : ""}`} /></span>
        <span className="lds-ok"><Icon name="check" size={16} /></span>
      </div>
      <p className="lds-found">Found on <SleeperChip /></p>
    </div>
  );
}

function LeagueDemo({ go, onDone }: { go: boolean; onDone: () => void }) {
  const k = usePhase(go, [260, 620, 1600], onDone);
  const n = TEAMS.length;
  return (
    <div className={`lds-demo lds-league p${k}`}>
      <span className="nudge-kind"><Icon name="league" size={15} />Your leagues</span>
      <span className={`lsw-row lds-row${k >= 1 ? " on" : ""}`}>
        <ManagerAvatar src={LEAGUE?.userAvatar} name={LEAGUE_NAME} size={36} className="lsw-av" />
        <span className="lsw-n"><b>{LEAGUE_NAME || "Sample league"}</b><small>Sample data</small></span>
        <Icon name="check" size={18} />
      </span>
      <div className="thk lds-thk">
        <ol className="thk-steps">
          <li className={`thk-step ${k >= 3 ? "done" : "active"}`}>
            {k >= 3 ? <i className="thk-mark" /> : <span className="thk-mark run"><AiMark size={14} /></span>}
            <span className="thk-line">
              <span className={`thk-label${k === 2 ? " shim" : ""}`}>{k >= 3 ? <>Loaded <span className="lds-n">{n}</span> teams from</> : "Loading your league from"}</span>
              <span className="thk-chips"><SleeperChip /></span>
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}

function TradeDemo({ go, t }: { go: boolean; t: Trade }) {
  const k = usePhase(go, [120, 300, 760], () => {});
  const them = teamById(t.partnerId);
  const row = (id: string, label: string, v?: string) => {
    const p = playerById(id);
    if (!p) return null;
    return (
      <li key={`${label}-${id}`}>
        <div className="ask-prow">
          <span className="ask-prow-k">{label}</span>
          <span className="lds-pl"><span className="ask-prow-name">{p.name}</span><span className="ask-prow-meta">{p.pos} · {p.nfl}</span></span>
          {v && <span className="ask-prow-v good lds-pts">{v}</span>}
        </div>
      </li>
    );
  };
  return (
    <div className={`lds-demo lds-trade p${k}`}>
      <span className="nudge-kind"><Icon name="trade" size={15} />Trade idea{them ? ` with ${them.manager}` : ""}</span>
      <ul className="ask-prows">
        {t.get.map((id, i) => row(id, "Get", i === 0 ? fmt(t.youDelta) : undefined))}
        {t.give.map((id) => row(id, "Send"))}
      </ul>
      <p className="lds-both">Starting points a week.{them && t.themDelta > 0 && <> {them.manager} gains <b className="lds-g">{fmt(t.themDelta)}</b> too.</>}</p>
    </div>
  );
}

export function LandingSteps({ trade }: { trade?: Trade }) {
  const ol = useRef<HTMLOListElement>(null);
  const rail = useRef<HTMLSpanElement>(null);
  const [started, setStarted] = useState([false, false, false]);
  const [, setDone] = useState([false, false, false]);
  const [lit, setLit] = useState(0);
  const finish = (i: number) => setDone((d) => d.map((x, j) => x || j === i));

  // The rail runs from the first chip's center to the last. It fills with scroll (transform only) and each chip
  // lights when the fill reaches it. Only listens while the list is on screen.
  useEffect(() => {
    const el = ol.current, r = rail.current; if (!el || !r) return;
    const chips = [...el.querySelectorAll<HTMLElement>(".lds-num")];
    let across = false, pos: number[] = [], raf = 0;
    const layout = () => {
      const box = el.getBoundingClientRect();
      const c = chips.map((b) => { const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2 - box.left, y: q.top + q.height / 2 - box.top }; });
      across = Math.abs(c[2].x - c[0].x) > Math.abs(c[2].y - c[0].y);
      const a = across ? c.map((p) => p.x) : c.map((p) => p.y);
      pos = a.map((v) => (v - a[0]) / Math.max(1, a[2] - a[0]));
      r.dataset.dir = across ? "x" : "y";
      Object.assign(r.style, across
        ? { left: `${c[0].x}px`, top: `${c[0].y}px`, width: `${c[2].x - c[0].x}px`, height: "" }
        : { left: `${c[0].x}px`, top: `${c[0].y}px`, height: `${c[2].y - c[0].y}px`, width: "" });
    };
    const tick = () => {
      raf = 0;
      let f = 1;
      if (!reduced()) {
        const box = el.getBoundingClientRect(), vh = innerHeight;
        // Down the page the fill's tip follows a reading line 62% down the screen; across it fills over half a screen
        const first = box.top + (across ? 0 : parseFloat(r.style.top) || 0);
        f = across ? (vh * 0.9 - box.top) / (vh * 0.45) : (vh * 0.62 - first) / Math.max(1, parseFloat(r.style.height) || 1);
        f = Math.min(1, Math.max(0, f));
      }
      r.style.setProperty("--f", f.toFixed(4));
      setLit(pos.filter((p) => f >= p - 0.001).length);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    layout(); tick();
    const ro = new ResizeObserver(() => { layout(); kick(); });
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { addEventListener("scroll", kick, { passive: true }); kick(); }
      else removeEventListener("scroll", kick);
    });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); removeEventListener("scroll", kick); cancelAnimationFrame(raf); };
  }, []);

  // Each box plays the moment its number lights as you scroll (Zach, Oct 23), not after the one before it finishes
  // and once started it plays through even if you scroll back up
  useEffect(() => { setStarted((st) => (st.every((x, j) => x || lit <= j) ? st : st.map((x, j) => x || lit > j))); }, [lit]);
  const go = (i: number) => started[i];
  const steps = [
    { h: "Enter your username", p: "Your Sleeper username, nothing else. No password, no sign up form.", demo: <UserDemo go={go(0)} onDone={() => finish(0)} /> },
    { h: "Pick your league", p: "Source loads rosters, projections, trades and waivers for the league you choose.", demo: <LeagueDemo go={go(1)} onDone={() => finish(1)} /> },
    { h: "Get your moves", p: "Trade ideas that help both sides, lineup fixes and waiver bids, refreshed through the week.", demo: trade ? <TradeDemo go={go(2)} t={trade} /> : null },
  ];
  return (
    <section className="ld-section lds" aria-labelledby="ld-steps">
      <SplitHead id="ld-steps" a="Up and running" b="in a minute." />
      <div className="lds-wrap">
        <span className="lds-rail" ref={rail} aria-hidden="true"><i /></span>
        <ol className="lds-ol" ref={ol}>
          {steps.map((s, i) => (
            <li key={s.h} className={`lds-step${i < lit ? " lit" : ""}`}>
              <b className="lds-num"><span>{i + 1}</span><i aria-hidden="true">{i + 1}</i></b>
              <div className="lds-copy"><h3>{s.h}</h3><p>{s.p}</p></div>
              {s.demo && <div className="lds-stage" aria-hidden="true" ref={setInert}>{s.demo}</div>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
