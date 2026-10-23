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
import { SectionCta } from "./SectionCta";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEMO_SLATE, YOU, playerById, type Player } from "../data";
import { allNeeds, eff } from "../engine";
import { matchNow, onPace, playCount, sampleWeek, startersOf, type Live } from "../live";
import { setInert } from "../inert";
import { PixelFlame, PixelSmoke, PixelSnow, StoneLock } from "../gameDayMotion";
import { Avatar } from "./Avatar";
import { GameMeta } from "./GameMeta";
import { PlayCount, PtsCell, gameNow, playCls } from "./LivePts";
import { Scoreboard } from "./Scoreboard";
import { SplitHead } from "./SplitHead";
import { Icon } from "./ui";

/** 0 is the board before kickoff; 1 to 5 are the moments, in the order a Sunday runs (Zach, Oct 23): the lock at
 *  kickoff, heating up, on fire, gone cold, then finals lock in */
type Beat = 0 | 1 | 2 | 3 | 4 | 5;
const ORDER: Record<string, number> = { in_game: 0, complete: 1, pre_game: 2 };
// When each moment lands after the board arrives (or after Replay), in real ms
const AT_MS = [0, 250, 1500, 2700, 4000, 5300];
// Between the big play and on fire the hot player's points keep climbing in steps, so he rolls straight into the flame
// instead of holding still and then jumping (Zach, Oct 22)
const TWEEN = [0.25, 0.5, 0.75];
// The moments rewind the live starters' game to the middle of it and play it forward to the sample Sunday as it is
// (beats 4 and 5 are the sample exactly, the same Live state the face-off section above shows). Share of the game left, and
// each player's points as a share of where he is on the sample Sunday. The hot one smokes after a big play (on pace
// to pass his projection), then passes it; the cold one holds even until the clock runs on him.
// Beat 0 is before kickoff (their games not started), beat 1 is kickoff (on the field, no points yet, so the lock
// stamps), then the points come in and the lock steps aside for the smoke, the flame and the cold.
const LEFT = [1, 1, 0.55, 0.5, 0.45];
const HOT = [0, 0, 0.74, 0.944, 1];
const COLD = [0, 0, 0.6, 0.875, 1];
const still = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const last = (p: Player) => p.name.split(" ").slice(-1)[0];
const r1 = (n: number) => Math.round(n * 10) / 10;
const names = (ps: Player[]) => { const l = ps.map(last); return l.length > 1 ? `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}` : l[0] ?? ""; };

/** Both teams in a game share its clock */
function sameGame(nfl: string): string[] {
  const g = DEMO_SLATE.find(([a, h]) => a === nfl || h === nfl);
  return g ? [g[0], g[1]] : [nfl];
}

export function LandingLive({ onAdd }: { onAdd?: () => void } = {}): JSX.Element {
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
  const weekAt = useMemo(() => (b: Beat, tw = 0): Live => {
    if (b >= 4) return base;
    const points = { ...base.points }, left = { ...base.left }, teamPts = { ...base.teamPts }, games = { ...base.games };
    const at = (xs: number[]) => (b === 2 && tw > 0 ? xs[2] + (xs[3] - xs[2]) * tw : xs[b]);
    const move = (p: Player | undefined, share: number[]) => {
      if (!p) return;
      const now = r1((base.points[p.id] ?? 0) * at(share));
      teamPts[YOU.id] = (teamPts[YOU.id] ?? 0) + now - (points[p.id] ?? 0);
      points[p.id] = now;
      sameGame(p.nfl).forEach((t) => { left[t] = Math.max(at(LEFT), base.left[t] ?? 0); if (b === 0) games[t] = "pre_game"; });
    };
    move(hot, HOT); move(cold, COLD);
    return { ...base, points, left, teamPts, games };
  }, [base, hot, cold]);

  const [beat, setBeat] = useState<Beat>(0);
  const [tw, setTw] = useState(0);
  // Remounting the rows lets a moment replay from the state just before it, with nothing animating on the way back
  const [run, setRun] = useState(0);
  // When each moment last played, so its icon in the list plays with it
  const [playedAt, setPlayedAt] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const timers = useRef<number[]>([]);
  const board = useRef<HTMLDivElement>(null);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const land = (b: Beat) => { setBeat(b); setTw(0); setPlayedAt((p) => p.map((x, i) => (i === b ? performance.now() : x))); };

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
      if (b === 2 && to >= 3) TWEEN.forEach((f) => timers.current.push(window.setTimeout(() => setTw(f), at + (AT_MS[3] - AT_MS[2]) * f)));
    }
  };

  // Arrival: the moments play once, the first time the board is mostly on screen
  useEffect(() => {
    const el = board.current;
    if (!el || typeof IntersectionObserver === "undefined" || still()) { setBeat(5); return; }
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      AT_MS.slice(1).forEach((ms, i) => timers.current.push(window.setTimeout(() => land((i + 1) as Beat), ms)));
      TWEEN.forEach((f) => timers.current.push(window.setTimeout(() => setTw(f), AT_MS[2] + (AT_MS[3] - AT_MS[2]) * f)));
    }, { threshold: 0.2 });
    io.observe(el);
    return () => { io.disconnect(); clear(); };
  }, []);

  // One Live state per beat (and tween step), so the face-off below gets the same object back on a re-render
  const week = useMemo(() => weekAt(beat, tw), [weekAt, beat, tw]);
  const count = playCount(week, starters.map((p) => p.nfl));

  // Each moment's line, from the engine's own numbers at that beat. They only depend on the sample Sunday, so the win
  // model runs once here instead of several times on every beat and tween step.
  const lines = useMemo(() => {
    const at = ([0, 1, 2, 3, 4, 5] as Beat[]).map((b) => weekAt(b));
    const win = at.map((w) => matchNow(w).chance ?? 50);
    const swing = (b: Beat) => {
      const a = win[b - 1], z = win[b];
      return a === z ? `win chance holds at ${z}%` : `win chance ${z > a ? "up" : "down"} ${a}% to ${z}%`;
    };
    const finals = rows.filter((p) => gameNow(base, p.id, p.nfl).state === "complete");
    const paceOf = (p: Player, b: Beat) => onPace(at[b].points[p.id] ?? 0, eff(p, true), at[b].left[p.nfl]) ?? 0;
    const kicked = [hot, cold].filter((p): p is Player => !!p);
    return {
      1: kicked.length ? `${names(kicked)} ${kicked.length > 1 ? "kick" : "kicks"} off. Locked in your lineup.` : "Kickoff locks your starters in.",
      2: hot ? `${last(hot)} up to ${(at[2].points[hot.id] ?? 0).toFixed(1)}, on pace to pass his projection, ${swing(2)}.` : "",
      3: hot ? `${last(hot)} passes his ${eff(hot, true).toFixed(1)} projection, ${swing(3)}.` : "",
      4: cold ? `${last(cold)} on pace for ${paceOf(cold, 4).toFixed(1)}, ${swing(4)}.` : "",
      5: finals.length ? `${names(finals)} ${finals.length > 1 ? "are" : "is"} done. Set in stone.` : "Finished games set in stone.",
    };
  }, [weekAt, rows, base, hot, cold]);
  const moments: { b: Beat; title: string; line: string; icon: ReactNode }[] = [
    { b: 1, title: "Locked at kickoff", line: lines[1], icon: <StoneLock at={playedAt[1]} /> },
    ...(hot ? [
      { b: 2 as Beat, title: "Heating up", line: lines[2], icon: <PixelSmoke at={playedAt[2]} /> },
      { b: 3 as Beat, title: "On fire", line: lines[3], icon: <PixelFlame at={playedAt[3]} caught={playedAt[3] > 0} /> },
    ] : []),
    ...(cold ? [{ b: 4 as Beat, title: "Gone cold", line: lines[4], icon: <PixelSnow at={playedAt[4]} /> }] : []),
    { b: 5 as Beat, title: "Finals lock in", line: lines[5], icon: <StoneLock at={playedAt[5]} /> },
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
                <span className="lu-who"><span className="lu-name">{p.name}</span><GameMeta p={p} g={g} /></span>
                <PtsCell id={p.id} g={g} proj={eff(p, true)} stone={g.state === "in_game" || (g.state === "complete" && beat >= 5)} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="ll-moments" role="group" aria-label="Game day moments">
        <div className="ll-mo-head">
          <span className="ll-k">Sunday moments</span>
          <button type="button" className="ll-replay" onClick={() => play(1, 5)}><Icon name="replay" size={14} />Replay</button>
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
        {onAdd && <SectionCta line="See this in action for yourself." onAdd={onAdd} />}
      </div>
    </section>
  );
}
