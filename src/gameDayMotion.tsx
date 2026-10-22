/** Game day motion (Zach, Oct 22): 16-bit fire and cold, the stone lock at kickoff, the week and status morphs, the
 *  odometer counter and the final whistle trophy. Ported from the approved preview (motion-picks.html).
 *
 *  The motion rule: animate on first arrival, when something actually changes, or when you act. Never loop. A value
 *  that was already in its state when a row mounted renders settled. useTurnedAt records when a value changes while
 *  the component is mounted; useFresh turns that into "play now" for whatever draws it, so a row that remounts a
 *  moment later (a branch switch) still plays once, and one that mounts later shows the settled state. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { EASE_OUT, mo } from "./motion";

const reduce = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- Change tracking ----------------------------------------------------------

/** When `v` last changed into a value `when` accepts while this component was mounted (performance.now()), else 0.
 *  The value it mounted with never counts as a change. */
export function useTurnedAt<T>(v: T, when: (v: T) => boolean = () => true): number {
  const r = useRef({ v, at: 0 });
  if (!Object.is(r.current.v, v)) r.current = { v, at: when(v) && !reduce() ? performance.now() : 0 };
  return r.current.at;
}
/** A change recorded by useTurnedAt that's still recent enough to play. */
export const isFresh = (at: number, win = 1200) => at > 0 && performance.now() - at < win;
/** The change to play: `at` when it's fresh at mount or arrives fresh later, else 0 (settled). */
export function useFresh(at: number, win = 1200): number {
  const [p, setP] = useState(() => (isFresh(at, win) ? at : 0));
  useEffect(() => { if (at && at !== p && isFresh(at, win)) setP(at); }, [at]); // eslint-disable-line react-hooks/exhaustive-deps
  return p;
}

// ---- 16-bit art -------------------------------------------------------------------

type Grid = string[];
/** Pixel art as inline SVG: one rect per lit cell, crisp edges. `--d` is each cell's distance from the center, so a
 *  sprite can build out from the middle. */
export function Px({ rows, colors, className, style }: { rows: Grid; colors: Record<string, string>; className?: string; style?: CSSProperties }) {
  const h = rows.length, w = rows[0].length;
  const rects: ReactNode[] = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const fill = colors[ch];
    if (!fill) return;
    const d = Math.abs(x - (w - 1) / 2) + Math.abs(y - (h - 1) / 2);
    rects.push(<rect key={`${x}.${y}`} x={x} y={y} width="1.02" height="1.02" fill={fill} style={{ "--d": d } as CSSProperties} className={ch === "w" && x === (w - 1) / 2 && y === (h - 1) / 2 ? "tw" : undefined} />);
  }));
  return <svg viewBox={`0 0 ${w} ${h}`} className={className} style={style} shapeRendering="crispEdges" aria-hidden="true" focusable="false">{rects}</svg>;
}

const FC = { r: "#E8402A", o: "#FF8A2A", y: "#FFD45A" };
const FIRE: Grid[] = [
  ["...r....", "..rr....", "..rr..r.", ".rorr.r.", ".roorrr.", "rrooyorr", "royyyyor", "royyyyor", ".royyor.", "..rrrr.."],
  ["....r...", "....rr..", ".r..rr..", ".r.rror.", ".rrroor.", "rroyoorr", "royyyyor", "royyyyor", ".royyor.", "..rrrr.."],
  ["..r.....", "..r..r..", ".rr..r..", ".rrorr..", ".rooorr.", "rrooyorr", "royyyyor", "royyyyor", ".royyor.", "..rrrr.."],
];
const SNOW: Grid = ["b...b...b", ".b..b..b.", "..b.b.b..", "...bwb...", "bbbwwwbbb", "...bwb...", "..b.b.b..", ".b..b..b.", "b...b...b"];
const SC = { b: "#A9D8FF", w: "#FFFFFF" };
const LC = { d: "#C9CEC9", s: "#5E6360", l: "#9AA09C", k: "#2A2E2C", h: "#B8BDB9" };
const BODY: Grid = ["sssssssss", "shhhhhhls", "sllllllls", "sllkkllls", "sllkkllls", "slllkllls", "sllllllls", "sssssssss"];
const LOCK: Grid[] = [
  ["..ddddd..", ".d.....d.", ".d.....d.", ".d.......", ".d.......", ...BODY],
  [".........", "..ddddd..", ".d.....d.", ".d.....d.", ".d.....d.", ...BODY],
  [".........", ".........", "..ddddd..", ".d.....d.", ".d.....d.", ...BODY],
];
const TROPHY: Grid = ["ooyyyyyoo", "o.yyyyy.o", "o.yyyyy.o", ".oyyyyyo.", "..yyyyy..", "...yyy...", "....y....", "...ooo...", "..ooooo.."];
const TC = { y: "#F2BE55", o: "#C98A2A" };

/** The pixel flame. When he catches fire it springs in and flickers through its three frames for about two seconds
 *  (125ms a frame), then holds the first frame. Already on fire when the row mounted: just the first frame. */
export function PixelFlame({ at }: { at: number }) {
  const play = useFresh(at);
  const [f, setF] = useState(0);
  useEffect(() => {
    if (!play || reduce()) return;
    let n = 0;
    const t = window.setInterval(() => { n++; if (n >= 16) { window.clearInterval(t); setF(0); } else setF(n % 3); }, mo(71));
    return () => { window.clearInterval(t); setF(0); };
  }, [play]);
  return <span key={play} className={`gd-flame${play ? " gd-play" : ""}`} aria-hidden="true"><Px rows={FIRE[f]} colors={FC} /></span>;
}

/** The pixel snowflake: builds out from its center pixel by pixel, and the center twinkles white. Settled when he was
 *  already cold at mount. */
export function PixelSnow({ at }: { at: number }) {
  const play = useFresh(at);
  return <span key={play} className={`gd-snow${play ? " gd-play" : ""}`} aria-hidden="true"><Px rows={SNOW} colors={SC} /></span>;
}

/** The faint glow in the row's top-right corner while a player is hot or cold, plus a few pixel specks in that corner
 *  for about two seconds when he turns: embers drifting up, or sleet falling on a slant. Positioned against the row. */
export function HeatWx({ kind, at }: { kind: "hot" | "cold"; at: number }) {
  const play = useFresh(at);
  const cv = useRef<HTMLCanvasElement>(null);
  const [finished, setFinished] = useState(0);
  useEffect(() => {
    const c = cv.current;
    if (!play || !c || reduce()) { setFinished(play); return; }
    const dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr;
    const x = c.getContext("2d");
    if (!x) return;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; c?: string };
    const parts: P[] = [], t0 = performance.now(), SPAWN = mo(1030), END = mo(1486), GAP = mo(kind === "hot" ? 97 : 63), S = 2;
    const snap = (v: number) => Math.round(v / S) * S;
    const spawn = (): P => kind === "hot"
      ? { x: W - 10 - Math.random() * 60, y: H * 0.55, vx: (Math.random() - 0.5) * 0.15, vy: -(0.35 + Math.random() * 0.35), life: 0, max: 70, c: [FC.r, FC.o, FC.y][Math.floor(Math.random() * 3)] }
      : { x: W - Math.random() * 90, y: -4, vx: -0.7, vy: 1.6 + Math.random() * 0.6, life: 0, max: 50 };
    let last = 0, raf = 0;
    const step = (now: number) => {
      const t = now - t0;
      x.clearRect(0, 0, W, H);
      if (t < SPAWN && now - last > GAP) { parts.push(spawn()); last = now; }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life++; p.x += p.vx; p.y += p.vy;
        x.globalAlpha = Math.max(0, 1 - p.life / p.max) * 0.8;
        if (kind === "hot") { x.fillStyle = p.c!; x.fillRect(snap(p.x), snap(p.y), S, S); }
        else { x.fillStyle = "#B9DEFF"; x.fillRect(snap(p.x), snap(p.y), S, S); x.fillRect(snap(p.x + 2), snap(p.y - 4), S, S); }
        if (p.life > p.max || p.y < -6 || p.y > H + 6) parts.splice(i, 1);
      }
      x.globalAlpha = 1;
      if (t < END || parts.length) raf = requestAnimationFrame(step); else { x.clearRect(0, 0, W, H); setFinished(play); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [play, kind]);
  return (
    <span className={`gd-wx gd-wx-${kind}${play ? " gd-play" : ""}`} aria-hidden="true">
      <i className="gd-wx-glow" />
      {play !== 0 && finished !== play && <canvas ref={cv} className="gd-wx-c" />}
    </span>
  );
}

/** Ask the stone lock inside a row to answer a tap: it shakes, and the shackle lifts and slams (frames 1, 0, 1, 2). */
export function denyLock(row: Element | null | undefined) {
  row?.querySelector(".gd-lock")?.dispatchEvent(new Event("gd-deny"));
}
/** The 16-bit stone lock on a row whose game has kicked off. Locked during the session: it drops in with some weight,
 *  the shackle snaps shut a frame at a time (about 400ms and 480ms in) and the row gives a small thud. Locked at
 *  mount: closed and still. The closed frames have empty rows on top, so they ride up to stay centered on the points. */
export function StoneLock({ at }: { at: number }) {
  const play = useFresh(at);
  const el = useRef<HTMLSpanElement>(null);
  const [f, setF] = useState(play ? 0 : 2);
  const timers = useRef<number[]>([]);
  const clear = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };
  const seq = (frames: [number, number][]) => { clear(); timers.current = frames.map(([ms, fr]) => window.setTimeout(() => setF(fr), ms)); };
  useEffect(() => {
    if (!play) return;
    if (reduce()) { setF(2); return; }
    setF(0);
    seq([[mo(229), 1], [mo(274), 2]]);
    el.current?.closest(".lu-row, .mu-mine")?.animate([{ transform: "none" }, { transform: "scale(0.985)", offset: 0.4 }, { transform: "none" }], { duration: mo(149), delay: mo(297), easing: "cubic-bezier(0.33, 1, 0.68, 1)", composite: "add" });
    return clear;
  }, [play]);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const onDeny = () => {
      if (reduce()) return;
      seq([[0, 1], [mo(51), 0], [mo(114), 1], [mo(149), 2]]);
      node.animate([{ transform: "none" }, { transform: "translateX(-4px) rotate(-6deg)", offset: 0.2 }, { transform: "translateX(4px) rotate(5deg)", offset: 0.45 }, { transform: "translateX(-2px)", offset: 0.7 }, { transform: "none" }], { duration: mo(240), easing: "cubic-bezier(0.33, 1, 0.68, 1)", composite: "add" });
    };
    node.addEventListener("gd-deny", onDeny);
    return () => { node.removeEventListener("gd-deny", onDeny); clear(); };
  }, []);
  return <span ref={el} className={`gd-lock${play ? " gd-play" : ""}`} data-f={f} aria-hidden="true"><Px rows={LOCK[f]} colors={LC} /></span>;
}

const SPK_C = { w: "#FFF6D6", y: "#F2BE55" };
const SPARK_BIG: Grid = ["...w...", "...w...", "..wyw..", "wwyyyww", "..wyw..", "...w...", "...w..."];
const SPARK: Grid = ["..w..", "..w..", "wwyww", "..w..", "..w.."];
/** The small 16-bit trophy beside the winner's name. When the week goes final while you watch, it spins out from the
 *  name and settles, then three pixel sparkles blink once around it. Already final at mount: it just sits there. */
export const PixelTrophy = () => (
  <span className="gd-trw" aria-hidden="true">
    <span className="gd-troph"><Px rows={TROPHY} colors={TC} /></span>
    <span className="gd-spk s1"><Px rows={SPARK_BIG} colors={SPK_C} /></span>
    <span className="gd-spk s2"><Px rows={SPARK} colors={SPK_C} /></span>
    <span className="gd-spk s3"><Px rows={SPARK} colors={SPK_C} /></span>
  </span>
);

// ---- Text -------------------------------------------------------------------------

/** Text that changes in place: the old words blur out as the new ones blur in, both in the same grid cell so the
 *  width holds through the change. `k` names the content; nothing moves on mount or while `k` stays the same.
 *  `swap` slides instead of blurring (the kickoff line), `rise` brings the new text up after a beat (the result
 *  under the final whistle). `enter` plays the incoming half on mount too. */
export function Morph({ k, children, variant = "blur", enter = false, className = "" }: { k: string; children: ReactNode; variant?: "blur" | "swap" | "rise"; enter?: boolean; className?: string }) {
  const [st, setSt] = useState<{ k: string; n: number; out: ReactNode | null; has: boolean; v: string }>({ k, n: enter && !reduce() ? 1 : 0, out: null, has: false, v: variant });
  const last = useRef<ReactNode>(children);
  if (k !== st.k) setSt({ k, n: st.n + 1, out: last.current, has: !reduce(), v: variant });
  last.current = children;
  useEffect(() => {
    if (!st.has) return;
    const t = window.setTimeout(() => setSt((s) => (s.n === st.n ? { ...s, out: null, has: false } : s)), mo(260));
    return () => window.clearTimeout(t);
  }, [st.n, st.has]);
  return (
    <span className={`gd-morph gd-morph-${st.v} ${className}`.trim()}>
      {st.has && <span key={`o${st.n}`} className="gd-m-out" aria-hidden="true">{st.out}</span>}
      <span key={`i${st.n}`} className={st.n ? "gd-m-in" : undefined}>{children}</span>
    </span>
  );
}

/** A pill whose word can change while it's up (an injury status, Questionable to Out). The words blur across in place
 *  while the pill grows or shrinks to hug the new one: its width is held at the old size, the new word is measured,
 *  and the width eases to it over the same beat. The old word leaves absolutely, so it never props the pill open. */
export function MorphPill({ word, className, ...rest }: { word: string; className: string } & Record<string, unknown>) {
  const el = useRef<HTMLSpanElement>(null);
  const w = useRef(0), shown = useRef(word), t = useRef(0);
  useLayoutEffect(() => {
    const n = el.current;
    if (!n) return;
    if (word === shown.current || reduce()) { shown.current = word; if (!n.style.width) w.current = n.offsetWidth; return; }
    shown.current = word;
    window.clearTimeout(t.current);
    const from = n.style.width ? n.getBoundingClientRect().width : w.current;
    n.style.transition = "none"; n.style.width = "";
    const to = n.offsetWidth;
    w.current = to;
    if (!from || Math.abs(from - to) < 0.5) return;
    // Hold the old width, then ease to the new one two frames on, so the long render a status change sets off
    // can't swallow the animation
    n.style.width = `${from}px`;
    n.style.transition = `color ${mo(229)}ms ${EASE_OUT}, background-color ${mo(229)}ms ${EASE_OUT}`;
    cancelAnimationFrame(t.current);
    t.current = requestAnimationFrame(() => { t.current = requestAnimationFrame(() => {
      const a = n.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: mo(240), easing: EASE_OUT });
      n.style.width = `${to}px`;
      a.onfinish = () => { n.style.width = ""; n.style.transition = ""; };
    }); });
  });
  useEffect(() => () => cancelAnimationFrame(t.current), []);
  return <span ref={el} className={`${className} gd-pill`} {...rest}><Morph k={word}>{word}</Morph></span>;
}

/** One character cell of the counter, as wide as its glyph. A changed digit
 *  rolls (up for a rise, down for a drop); the old one leaves the other way. */
function Cell({ ch, dir }: { ch: string; dir: number }) {
  const [st, setSt] = useState({ cur: ch, old: null as string | null, n: 0, dir: 0 });
  if (ch !== st.cur) setSt({ cur: ch, old: dir && !reduce() ? st.cur : null, n: st.n + 1, dir });
  useEffect(() => {
    if (st.old === null) return;
    const t = window.setTimeout(() => setSt((s) => (s.n === st.n ? { ...s, old: null } : s)), mo(343));
    return () => window.clearTimeout(t);
  }, [st.n, st.old]);
  const way = st.dir > 0 ? "up" : "down";
  return (
    <span className="gd-c">
      {st.old !== null && <span key={`o${st.n}`} className={`gd-g gd-out ${way}`} aria-hidden="true">{st.old}</span>}
      <span key={`c${st.n}`} className={st.old !== null ? `gd-g gd-in ${way}` : "gd-g"}>{st.cur}</span>
    </span>
  );
}
/** A score that rolls like an odometer when it changes: only the digits that changed move. `roll` off (a count-up
 *  in progress, or a value that isn't live) just draws the new number. Cells are keyed from the right, so 99.8 to
 *  100.4 keeps the decimal in place. */
export function RollNum({ v, roll = true, className = "", digits = 1 }: { v: number; roll?: boolean; className?: string; digits?: number }) {
  const prev = useRef(v);
  const dir = useRef(0);
  if (v !== prev.current) { dir.current = roll ? Math.sign(v - prev.current) : 0; prev.current = v; }
  const chars = [...v.toFixed(digits)];
  return <span className={`gd-odo ${className}`.trim()}>{chars.map((c, i) => <Cell key={chars.length - i} ch={c} dir={dir.current} />)}</span>;
}

/** "Locked at kickoff" in place of the kickoff time for a moment after a game kicks off, then whatever the row shows
 *  once a game is on (`after`: the Live tag on Lineup, nothing in the matchup). */
export function KickNote({ at, after = null }: { at: number; after?: ReactNode }) {
  const [on, setOn] = useState(() => isFresh(at));
  useEffect(() => {
    if (!isFresh(at)) return;
    setOn(true);
    const t = window.setTimeout(() => setOn(false), mo(2300));
    return () => window.clearTimeout(t);
  }, [at]);
  if (!on && after === null) return null;
  // Wrapped, so the meta line's separator dot lands on the wrapper and not inside the morph's grid
  return <span className="gd-kickw"><Morph k={on ? "locked" : "after"} variant="swap" enter={on} className="gd-kick">{on ? "Locked at kickoff" : after}</Morph></span>;
}
