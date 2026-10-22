// The landing's live section (Zach, Oct 22: "Break this out as it's own section that we show live things and celebrate
// the sweat"). The sample league's Sunday (live.sampleWeek), drawn with the app's own pieces: the Wire face-off
// (Scoreboard), the Lineup rows with PtsCell, and the 16-bit game-day motion (gameDayMotion.tsx). Nothing here is a
// lookalike.
//
// Four moments, scripted on top of the sample Sunday so the real components turn on their own: finals lock in (the
// stone lock drops on every starter whose game is over), a big play (a live starter's points roll up, he starts to
// smoke, the win chance swings), he catches fire, and a second live starter goes cold. They play once when the board
// scrolls into view. After that nothing moves unless you tap: each moment replays on its own, and Replay runs all four.
// Reduced motion shows the last moment settled, and taps just jump between states.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEMO_SLATE, YOU, playerById, type Player } from "../data";
import { allNeeds, eff } from "../engine";
import { matchNow, onPace, playCount, sampleWeek, startersOf, type Live } from "../live";
import { setInert } from "../inert";
import { PixelFlame, PixelSmoke, PixelSnow, StoneLock } from "../gameDayMotion";
import { Avatar } from "./Avatar";
import { PlayCount, PtsCell, gameNow, playCls } from "./LivePts";
import { Scoreboard } from "./Scoreboard";
import { SplitHead } from "./SplitHead";
import { Icon } from "./ui";

/** 0 is the board before anything plays; 1 to 4 are the moments, in order */
type Beat = 0 | 1 | 2 | 3 | 4;
const ORDER: Record<string, number> = { in_game: 0, complete: 1, pre_game: 2 };
// When each moment lands after the board arrives (or after Replay), in real ms
const AT_MS = [0, 250, 1500, 3100, 4700];
// The moments rewind the live starters' game to the middle of it and play it forward to the sample Sunday as it is
// (beat 4 is the sample exactly, the same Live state the face-off section above shows). Share of the game left, and
// each player's points as a share of where he is on the sample Sunday. The hot one smokes after a big play (on pace
// to pass his projection), then passes it; the cold one holds even until the clock runs on him.
const LEFT = [0.55, 0.55, 0.5, 0.45];
const HOT = [0.44, 0.44, 0.74, 0.944];
const COLD = [0.875, 0.875, 0.875, 1];
const still = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const last = (p: Player) => p.name.split(" ").slice(-1)[0];
const r1 = (n: number) => Math.round(n * 10) / 10;
const names = (ps: Player[]) => { const l = ps.map(last); return l.length > 1 ? `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}` : l[0] ?? ""; };

/** Both teams in a game share its clock */
function sameGame(nfl: string): string[] {
  const g = DEMO_SLATE.find(([a, h]) => a === nfl || h === nfl);
  return g ? [g[0], g[1]] : [nfl];
}

export function LandingLive(): JSX.Element {
  const base = useMemo(() => sampleWeek("live"), []);
  const you = useMemo(() => allNeeds().find((n) => n.team.you)!, []);
  const starters = useMemo(() => startersOf(YOU).map(playerById), []);
  const rows = useMemo(() => [...starters]
    .sort((a, b) => (ORDER[gameNow(base, a.id, a.nfl).state ?? "pre_game"] ?? 3) - (ORDER[gameNow(base, b.id, b.nfl).state ?? "pre_game"] ?? 3))
    .slice(0, 6), [base, starters]);
  // The two live starters the moments follow: the one furthest past his projection heats up, the one furthest short
  // goes cold
  const [hot, cold] = useMemo(() => {
    const ratio = (p: Player) => (base.points[p.id] ?? 0) / Math.max(eff(p, true), 0.1);
    const live = rows.filter((p) => gameNow(base, p.id, p.nfl).state === "in_game").sort((a, b) => ratio(b) - ratio(a));
    return [live[0], live.length > 1 ? live[live.length - 1] : undefined] as const;
  }, [base, rows]);

  /** The sample Sunday at a beat: the two players' points and game clocks rewound, Sleeper's team score with them */
  const weekAt = useMemo(() => (b: Beat): Live => {
    if (b === 4) return base;
    const points = { ...base.points }, left = { ...base.left }, teamPts = { ...base.teamPts };
    const move = (p: Player | undefined, share: number[]) => {
      if (!p) return;
      const now = r1((base.points[p.id] ?? 0) * share[b]);
      teamPts[YOU.id] = (teamPts[YOU.id] ?? 0) + now - (points[p.id] ?? 0);
      points[p.id] = now;
      sameGame(p.nfl).forEach((t) => { left[t] = Math.max(LEFT[b], base.left[t] ?? 0); });
    };
    move(hot, HOT); move(cold, COLD);
    return { ...base, points, left, teamPts };
  }, [base, hot, cold]);

  const [beat, setBeat] = useState<Beat>(0);
  // Remounting the rows lets a moment replay from the state just before it, with nothing animating on the way back
  const [run, setRun] = useState(0);
  // When each moment last played, so its icon in the list plays with it
  const [playedAt, setPlayedAt] = useState<number[]>([0, 0, 0, 0, 0]);
  const timers = useRef<number[]>([]);
  const board = useRef<HTMLDivElement>(null);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const land = (b: Beat) => { setBeat(b); setPlayedAt((p) => p.map((x, i) => (i === b ? performance.now() : x))); };

  /** Play moments `from` to `to` in order, starting from the board as it was just before `from` */
  const play = (from: Beat, to: Beat) => {
    clear();
    if (still()) { setBeat(to); return; }
    setRun((r) => r + 1);
    setBeat((from - 1) as Beat);
    const t0 = AT_MS[from];
    for (let b = from; b <= to; b++) {
      const at = from === to ? 450 : AT_MS[b] - t0 + 450;
      timers.current.push(window.setTimeout(() => land(b as Beat), at));
    }
  };

  // Arrival: the four moments play once, the first time the board is mostly on screen
  useEffect(() => {
    const el = board.current;
    if (!el || typeof IntersectionObserver === "undefined" || still()) { setBeat(4); return; }
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      AT_MS.slice(1).forEach((ms, i) => timers.current.push(window.setTimeout(() => land((i + 1) as Beat), ms)));
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); clear(); };
  }, []);

  const week = weekAt(beat);
  const count = playCount(week, starters.map((p) => p.nfl));

  // Each moment's line, from the engine's own numbers at that beat
  const winAt = (b: Beat) => matchNow(weekAt(b)).chance ?? 50;
  const swing = (b: Beat) => {
    const a = winAt((b - 1) as Beat), z = winAt(b);
    return a === z ? `win chance holds at ${z}%` : `win chance ${z > a ? "up" : "down"} ${a}% to ${z}%`;
  };
  const finals = rows.filter((p) => gameNow(base, p.id, p.nfl).state === "complete");
  const paceOf = (p: Player, b: Beat) => {
    const w = weekAt(b);
    return onPace(w.points[p.id] ?? 0, eff(p, true), w.left[p.nfl]) ?? 0;
  };
  const moments: { b: Beat; title: string; line: string; icon: ReactNode }[] = [
    { b: 1, title: "Finals lock in", line: finals.length ? `${names(finals)} ${finals.length > 1 ? "are" : "is"} done. Set in stone.` : "Finished games set in stone.", icon: <StoneLock at={playedAt[1]} /> },
    ...(hot ? [
      { b: 2 as Beat, title: "Big play", line: `${last(hot)} +${r1((weekAt(2).points[hot.id] ?? 0) - (weekAt(1).points[hot.id] ?? 0)).toFixed(1)}, ${swing(2)}.`, icon: <PixelSmoke at={playedAt[2]} /> },
      { b: 3 as Beat, title: "On fire", line: `${last(hot)} passes his ${eff(hot, true).toFixed(1)} projection, ${swing(3)}.`, icon: <PixelFlame at={playedAt[3]} caught={playedAt[3] > 0} /> },
    ] : []),
    ...(cold ? [{ b: 4 as Beat, title: "Gone cold", line: `${last(cold)} on pace for ${paceOf(cold, 4).toFixed(1)}, ${swing(4)}.`, icon: <PixelSnow at={playedAt[4]} /> }] : []),
  ];

  return (
    <section className="ld-section ld2-livesec" aria-labelledby="ld-live">
      <SplitHead id="ld-live" a="Sweat every snap," b="with the whole lineup." />
      <p className="ll-sub">Points as they land, where every starter is on pace to finish, and a win chance that swings with each drive. Guys catch fire. Guys go cold. Finals lock in.</p>
      <div className="card ll-board" ref={board}>
        {/* The Wire face-off on the same scripted Sunday: scores roll and the win % bars glide as the moments land. It
            remounts with the rows on a replay, so going back to the earlier state shows settled. */}
        <div className="ll-fo" aria-hidden="true" ref={setInert}>
          <Scoreboard key={run} you={you} partner={null} extras={false} at={week} />
        </div>
        <div className="ll-rows-head">
          <span className="ll-k">Your starters</span>
          <PlayCount c={count} />
        </div>
        <div className="lu-list ll-rows" key={run}>
          {rows.map((p) => {
            const g = gameNow(week, p.id, p.nfl);
            return (
              <div key={p.id} className={`lu-row${playCls(g)}`}>
                <span className={`lu-slot s-${p.pos}`}>{p.pos}</span>
                <Avatar p={p} size={48} />
                <span className="lu-who"><span className="lu-name">{p.name}</span><span className="lu-meta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b><span>{p.nfl}</span>{g.state === "in_game" ? <span className="lu-live"><i aria-hidden="true" />Live</span> : g.state === "complete" ? <span className="lu-final">Final</span> : null}</span></span>
                <PtsCell id={p.id} g={g} proj={eff(p, true)} stone={g.state === "complete" && beat >= 1} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="ll-moments" role="group" aria-label="Game day moments">
        <div className="ll-mo-head">
          <span className="ll-k">Sunday moments</span>
          <button type="button" className="ll-replay" onClick={() => play(1, 4)}><Icon name="switch" size={14} />Replay</button>
        </div>
        <ol>
          {moments.map((m) => (
            <li key={m.b}>
              <button type="button" className={`ll-mo${beat === m.b ? " on" : beat > m.b ? " done" : ""}`} aria-pressed={beat === m.b} onClick={() => play(m.b, m.b)}>
                <span className="ll-mo-ic" aria-hidden="true">{m.icon}</span>
                <span className="ll-mo-t"><b>{m.title}</b><small>{m.line}</small></span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
