/** Game day motion (Zach, Oct 22): 16-bit fire and cold, the stone lock at kickoff, the week and status morphs, the
 *  odometer counter and the final whistle trophy. Ported from the approved preview (motion-picks.html).
 *
 *  The motion rule: animate on first arrival, when something actually changes, or when you act. Never loop. A value
 *  that was already in its state when a row mounted renders settled. useTurnedAt records when a value changes while
 *  the component is mounted; useFresh turns that into "play now" for whatever draws it, so a row that remounts a
 *  moment later (a branch switch) still plays once, and one that mounts later shows the settled state. */
import { PX } from "./components/pixelIcons";
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

// Heating up (approved Oct 22): an ember that smokes, then rests as a faint wisp. Same 8x10 grid as the flame, so
// the smoke can catch into it.
const SMC = { d: "#4A4F4C", s: "#6E746F", l: "#9AA09C", e: "#E8402A", o: "#FF8A2A" };
const SMOKE: Grid[] = [
  ["........", "........", "...ll...", "..llll..", "..lssl..", "...ss...", "..sss...", "..dss...", "...dd...", "..oeeo.."],
  ["...ll...", "..llll..", "..ls.l..", ".lss....", "..sss...", "...ss...", "..dss...", "...dd...", "...d....", "..oeeo.."],
  ["..ll....", ".llll.l.", ".l..l...", "...sl...", "..sss...", "..ss....", "..dss...", "...dd...", "...d....", "..oeeo.."],
];
const WISP: Grid = ["........", "........", "........", "...l....", "..ll....", "..ls....", "...ss...", "...sd...", "...dd...", "..oeeo.."];
const CATCH: Grid = ["....l...", "...l....", "...s....", "...s.r..", "..rr.r..", ".rorr...", ".rooor..", "rroyoor.", ".royyor.", "..rrrr.."];
const CATCH_C = { ...SMC, ...FC };
type Frame = { rows: Grid; c: Record<string, string> };

/** Runs a list of [ms, frame] steps once, from when `play` turns on. Returns the frame to draw. */
function useFrames(play: number, rest: Frame, steps: () => [number, Frame][], after?: (t: number[]) => void): Frame {
  const [fr, setFr] = useState<Frame>(rest);
  useEffect(() => {
    if (!play || reduce()) { setFr(rest); return; }
    const ts = steps().map(([ms, f]) => window.setTimeout(() => setFr(f), ms));
    after?.(ts);
    return () => { ts.forEach((t) => window.clearTimeout(t)); setFr(rest); };
  }, [play]); // eslint-disable-line react-hooks/exhaustive-deps
  return fr;
}

/** Heating up: the ember smokes through its three frames twice (200ms a frame on screen), then rests as a wisp.
 *  Already heating when the row mounted: just the wisp. Never loops. */
export function PixelSmoke({ at }: { at: number }) {
  const play = useFresh(at);
  const rest: Frame = { rows: WISP, c: SMC };
  const fr = useFrames(play, rest, () => [...[0, 1, 2, 0, 1, 2].map((f, k): [number, Frame] => [k * mo(114), { rows: SMOKE[f], c: SMC }]), [6 * mo(114), rest]]);
  return <span className="gd-flame gd-smoke" aria-hidden="true"><Px rows={fr.rows} colors={fr.c} /></span>;
}

/** The pixel flame. When he catches fire it springs in and flickers through its three frames for about two seconds
 *  (125ms a frame), then holds the first frame. `caught`: he was heating up first, so the smoke catches instead: one
 *  smoke frame, the catch frame, a small 1.25 step pop, then 12 flicker frames and rest. Already on fire when the row
 *  mounted: just the first frame. */
export function PixelFlame({ at, caught = false }: { at: number; caught?: boolean }) {
  const play = useFresh(at);
  const el = useRef<HTMLSpanElement>(null);
  const rest: Frame = { rows: FIRE[0], c: FC };
  const fr = useFrames(play, rest, () => caught
    ? [[0, { rows: SMOKE[1], c: SMC }], [mo(86), { rows: CATCH, c: CATCH_C }],
      ...Array.from({ length: 12 }, (_, k): [number, Frame] => [mo(171) + k * mo(71), { rows: FIRE[k % 3], c: FC }]), [mo(171) + 12 * mo(71), rest]]
    : [...Array.from({ length: 15 }, (_, k): [number, Frame] => [(k + 1) * mo(71), { rows: FIRE[(k + 1) % 3], c: FC }]), [16 * mo(71), rest]],
  (ts) => { if (caught) ts.push(window.setTimeout(() => el.current?.animate([{ transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: mo(137), easing: "steps(3)" }), mo(171))); });
  return <span ref={el} key={play} className={`gd-flame${play && !caught ? " gd-play" : ""}`} aria-hidden="true"><Px rows={fr.rows} colors={fr.c} /></span>;
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
// The cheer, in whole frames (steps): a two pixel hop, one rock each way, a small rock back, down. Origin at its base.
const STEP = "steps(1, end)";
const CHEER: Keyframe[] = [
  { transform: "none", easing: STEP },
  { transform: "translateY(-1px)", offset: 0.14, easing: STEP },
  { transform: "translateY(-2px)", offset: 0.28, easing: STEP },
  { transform: "translateY(-2px) rotate(-10deg)", offset: 0.42, easing: STEP },
  { transform: "translateY(-1px) rotate(10deg)", offset: 0.58, easing: STEP },
  { transform: "rotate(-4deg)", offset: 0.74, easing: STEP },
  { transform: "none", offset: 0.88 },
  { transform: "none" },
];
// A sparkle pops off the rim: small, full, drifting out, gone. `dx` is the way it drifts.
const pop = (dx: number): Keyframe[] => [
  { opacity: 1, transform: "scale(0.4)", easing: STEP },
  { opacity: 1, transform: "scale(1)", offset: 0.34, easing: STEP },
  { opacity: 1, transform: `translate(${dx}px, -2px) scale(0.6)`, offset: 0.67, easing: STEP },
  { opacity: 0, transform: `translate(${dx}px, -2px) scale(0.6)` },
];

/** The trophy's cheer: it hops, rocks once and settles while two pixel sparkles pop off its rim (the big one top left,
 *  a small one on the right). Plays once per call and ignores calls while it's playing. Reduced motion: nothing. */
export function cheer(w: HTMLElement) {
  if (reduce() || w.dataset.cheer !== undefined) return;
  const cup = w.querySelector<SVGElement>(".gd-troph svg");
  if (!cup?.animate) return;
  w.dataset.cheer = "";
  const hop = cup.animate(CHEER, { duration: mo(320) });
  const done = () => { delete w.dataset.cheer; };
  hop.onfinish = done;
  hop.oncancel = done;
  w.querySelector(".gd-spk.s1")?.animate(pop(-1), { duration: mo(160), delay: mo(90) });
  w.querySelector(".gd-spk.s2")?.animate(pop(1), { duration: mo(160), delay: mo(140) });
}

/** For a face-off drawn inert (the landing's decorative demos), where the trophy itself gets no pointer events: put
 *  this on a live wrapper's onPointerMove and onPointerDown. A mouse cheers the trophy once as it moves onto it; a tap
 *  or click on it cheers it. Only a trophy that is showing counts. */
export function trophyPointer(e: { clientX: number; clientY: number; pointerType: string; type: string; currentTarget: EventTarget }) {
  const root = e.currentTarget as Element;
  root.querySelectorAll<HTMLElement>(".gd-trw").forEach((w) => {
    const r = w.getBoundingClientRect();
    const on = r.width > 0 && getComputedStyle(w).visibility !== "hidden" && e.clientX >= r.left - 2 && e.clientX <= r.right + 2 && e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2;
    if (e.type === "pointerdown") { if (on) cheer(w); return; }
    if (e.pointerType !== "mouse") return;
    if (on && w.dataset.over === undefined) cheer(w);
    if (on) w.dataset.over = ""; else delete w.dataset.over;
  });
}

/** The small trophy beside the winner's name: the pixel trophy from the icon set (Zach, Oct 22), in gold. When the week goes final while you watch, it spins out from the
 *  name and settles, then three pixel sparkles blink once around it. Already final at mount: it just sits there.
 *  It cheers (see cheer) on hover with a mouse, on a tap, and when a Final face-off it sits in is shown: the stylesheet
 *  (icon-motion.css, px-cue) starts a 1ms cue animation on arrival, and its start event plays the cheer. Never on its own. */
export const PixelTrophy = () => (
  <span className="gd-trw" aria-hidden="true"
    onAnimationStart={(e) => { if (e.animationName === "px-cue" && e.target === e.currentTarget) cheer(e.currentTarget); }}
    onPointerEnter={(e) => { if (e.pointerType === "mouse") cheer(e.currentTarget); }}
    onPointerDown={(e) => { if (e.pointerType !== "mouse") cheer(e.currentTarget); }}>
    <span className="gd-troph"><svg className="px-ic" viewBox={PX.trophy[0]} width="100%" height="100%" fill="#F0C75E" style={{ transformOrigin: "50% 100%" }} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: PX.trophy[1] }} /></span>
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
