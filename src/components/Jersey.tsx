// A front-view football jersey in any team's colorway and trim. Pure SVG: the number is drawn as paths
// from the team's numeral set and changes with the `number` prop; the svg's label carries it for
// assistive tech. Stripes, panels and signature patterns
// are drawn from jerseys.ts; no logos, names or maker marks.
// Collar: plain (body color with seams), solid (one color band) or striped (a band with stripes
// parallel to its edge), each with its own band width and V depth, and an optional notch at the point.
// Shoulder trim: sleeve stripes run around the sleeve parallel to the cuff; bars are straight stripes that
// run over the shoulder (yoke stripes, shoulder bands).
// Rendering: lit like a 3D cloth render, all in SVG. A fine hex mesh and turbulence grain sit under the
// trim and number, then a key light (angle set by `light`), a rim light opposite it, cloth folds, a hem
// vignette and a satin sheen on the collar shade everything above. Strengths follow body luminance so
// white jerseys stay clean and black ones still show form. Under 120 px the mesh, grain and blurred
// folds drop out.
// Numbers: per team, either an openly licensed Google Fonts face set as SVG text or one of our own
// drawn digit sets (see numerals.ts), every set held to the same cap height so one and two digits fill
// the chest the same way. Outlines are strokes under the fill, so they keep the same visual widths
// whatever the digit shape.
// Collar: flat knit trim. Only a faint sheen and a soft contact shadow, no tube-like shading.
import { useId, useMemo } from "react";
import { colorway, numberStyle, trimFor, type Band, type Bars, type Collar, type Colorway, type PatternId, type Trim } from "../jerseys";
import { numberPath, numberText, teamNumerals, type NumberText } from "../numerals";

export interface JerseyProps {
  /** NFL abbreviation, e.g. "BUF" */
  team: string;
  /** 0 to 99 */
  number?: string | number;
  /** Width in px. Height follows the 600 x 690 artboard. */
  size?: number;
  /** White colorway */
  away?: boolean;
  /** Key light direction in degrees, counterclockwise from the right: 135 is upper left. */
  light?: number;
  className?: string;
}

const VW = 600;
const VH = 690;
// Chest and shoulder number boxes: cap height, widest run and baseline, in artboard units.
const CHEST = { cap: 190, maxW: [200, 296], y: 366 };
const SHOULDER = { cap: 64, maxW: [70, 112], y: 38 };

// Left half of the silhouette, mirrored for the right: shoulder corner, capped sleeve, arched cuff
// opening (it wraps the arm), then a side that tucks in at the waist and flares to the hem.
const LEFT = "M 184 4 L 72 12 C 32 16 8 42 6 98 L 8 158 C 9 170 12 180 18 190 C 50 178 98 190 126 232 C 131 280 133 330 132 378 C 126 470 104 560 98 684";
type Pt = [number, number];
const pts = (d: string) => [...d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])] as Pt);
const mx = ([x, y]: Pt): Pt => [VW - x, y];
const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${VW - Number(x)} ${y}`);
/** The right half, traced hem to neck: mirror every point and walk the L/C segments backwards. */
function rightHalfReversed(d: string): string {
  const segs = [...d.matchAll(/([MLC])([^MLC]+)/g)].map((m) => ({ cmd: m[1], p: pts(m[2]).map(mx) }));
  const out: string[] = [];
  for (let i = segs.length - 1; i > 0; i--) {
    const s = segs[i];
    const from = segs[i - 1].p[segs[i - 1].p.length - 1];
    out.push(s.cmd === "L" ? `L ${from.join(" ")}` : `C ${s.p[1].join(" ")} ${s.p[0].join(" ")} ${from.join(" ")}`);
  }
  return out.join(" ");
}
const BODY = `${LEFT} Q 300 696 ${VW - 98} 684 ${rightHalfReversed(LEFT)} Z`;

// Cuff band, sitting just inside the arched sleeve opening.
const CUFF_L = "M 18 190 C 50 178 98 190 126 232 L 131 212 C 104 166 46 152 8 166 Z";
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Collar: a V band from the shoulder corners (184 and 416 at the top edge) down to a point at `depth`,
// `w` thick measured straight up at the point. Every line inside the band runs parallel to its outer
// edge, so stripes keep an even width down both arms. The back of the neck shows through the opening.
const COLLAR_W = 26;
const COLLAR_DEPTH = 110;
function collarGeo(depth: number, w: number) {
  const k = 116 / (depth - 4); // x run per unit of y along the outer arm
  /** The V line `o` px up from the outer edge (at the point), run well past the top edge. */
  const vAt = (o: number): [Pt, Pt, Pt] => {
    const py = depth - o;
    return [[300 - k * (py + 20), -20], [300, py], [300 + k * (py + 20), -20]];
  };
  const xi = 300 - k * (depth - w);
  const band = `M 184 4 L 300 ${depth} L 416 4 L ${VW - xi} 0 L 300 ${depth - w} L ${xi} 0 Z`;
  /** A strip between offsets a and b from the outer edge, clipped to the band when drawn. */
  const strip = (a: number, b: number) => {
    const A = vAt(a);
    const B = vAt(b);
    return `M ${[...A, ...[...B].reverse()].map(f).join(" L ")} Z`;
  };
  const len = Math.hypot(116, depth - 4);
  const mid: Pt = [242, (4 + depth) / 2];
  const across: [Pt, Pt] = [mid, add(mid, [(depth - 4) / len, -116 / len], (w * 116) / len)];
  return {
    band,
    strip,
    neck: `M ${xi} 0 L 300 ${depth - w} L ${VW - xi} 0 Z`,
    arm: `M 184 4 L 300 ${depth} L 300 ${depth - w} L ${xi} 0 Z`,
    across,
    outer: `M 184 4 L 300 ${depth} L 416 4`,
    inner: `M ${xi} 0 L 300 ${depth - w} L ${VW - xi} 0`,
    /** A short slit cut up into the point of the V. */
    notch: (() => {
      const s = Math.min(11, w * 0.45);
      const dl: Pt = [-116 / len, -(depth - 4) / len];
      return `M ${f(add([300, depth], dl, s))} L 300 ${(depth - w * 0.62).toFixed(1)} L ${f(add([300, depth], [-dl[0], dl[1]], s))} L 300 ${depth + 1} Z`;
    })(),
  };
}
// Seams: raglan from collar to sleeve, a sleeve seam, the side panel curve and the lower front arc.
const RAGLAN_L = "M 222 50 C 190 92 152 140 120 196";
const SLEEVE_L = "M 22 60 C 32 98 36 132 38 170";
const SIDE_L = "M 132 380 C 165 420 198 455 207 500 C 212 522 214 540 215 562";
const PANEL_L = "M 132 380 C 165 420 198 455 207 500 C 212 522 214 540 215 562 L 218 700 L 0 700 L 0 380 Z";
const BELLY = "M 207 502 C 250 478 350 478 393 502";

// Trim geometry, left side only; the right side is the same art mirrored.
// The sleeve region: everything outside the raglan seam, down to the underarm.
const SLEEVE_ZONE_L = "M 252 -20 L 222 50 C 190 92 152 140 120 196 L 128 238 L -20 238 L -20 -20 Z";
// Top edge of the cuff, traced from the outer edge to the underarm, plus the unit vectors along it
// (D) and away from it up the sleeve (N). Stripes are this curve slid along N.
const CUFF_TOP: Pt[] = [[8, 166], [46, 152], [104, 166], [131, 212]];
const D: Pt = [0.937, 0.35];
const N: Pt = [0.35, -0.937];
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const f = (p: Pt) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
function cuffLine(off: number): string {
  const [p0, p1, p2, p3] = CUFF_TOP.map((p) => add(p, N, off));
  return `M ${f(add(p0, D, -60))} L ${f(p0)} C ${f(p1)} ${f(p2)} ${f(p3)} L ${f(add(p3, D, 60))}`;
}
/** A stripe that tapers from a base of width `t` at `b` to a point at `e`, bowed sideways by `bow`. */
function taper(b: Pt, e: Pt, t: number, bow = 0): string {
  const len = Math.hypot(e[0] - b[0], e[1] - b[1]);
  const p: Pt = [-(e[1] - b[1]) / len, (e[0] - b[0]) / len];
  const m = add(lerp(b, e, 0.45), p, bow);
  return `M ${f(add(b, p, t / 2))} Q ${f(add(m, p, t * 0.45))} ${f(e)} Q ${f(add(m, p, -t * 0.45))} ${f(add(b, p, -t / 2))} Z`;
}
// Tiger stripes: our own claw shapes that hook down over the shoulder cap from the top edge, widest at
// the top, plus a short one in from the outer edge near the cuff.
const TIGER_L = [
  taper([200, -8], [44, 128], 30, 16),
  taper([146, -8], [18, 92], 24, 12),
  taper([98, -6], [6, 54], 17, 7),
  taper([-10, 132], [70, 146], 12, -3),
];
// Peaks: a band across the sleeve cap in the accent color, with a row of pointed peaks along its
// lower edge in the main color, ending above the cuff.
const PEAK_CAP_L = "M -20 70 L 210 96 L 196 128 L -20 106 Z";
const PEAK_TEETH_L = "M -20 104 L 196 126 L 186 140 L 150 132 L 128 154 L 96 128 L 62 150 L 40 120 L -20 124 Z";
// Hook: a curved sleeve stripe, wide at the outer edge and tapering to a point toward the chest, with a
// thin accent line under it.
const HOOK_L = "M -20 58 C 50 66 130 84 204 106 C 130 104 56 112 -20 124 Z";
const HOOK_LINE_L = "M -20 136 C 56 124 130 114 196 112";
// Side marks: three small triangles stacked down the chest side.
const MARKS_L = [300, 324, 348].map((y) => `M 160 ${y - 7} L 167 ${y + 5} L 153 ${y + 5} Z`).join(" ");

// Lighting geometry.
const CENTER: Pt = [300, 345];
// Cloth folds, left side: diagonal drape from the armpit toward the waist as shadow and highlight pairs.
const FOLDS_L = {
  shadow: [taper([136, 244], [232, 478], 26, 10), taper([132, 300], [186, 430], 16, 6), taper([170, 150], [210, 250], 12, -4)],
  light: [taper([156, 236], [250, 452], 14, 10), taper([148, 296], [200, 410], 9, 6)],
};
// Hem ripple: short soft folds rising from the hem.
const HEM = {
  shadow: [taper([168, 690], [184, 590], 22, -4), taper([292, 696], [300, 612], 20, 3), taper([424, 690], [410, 596], 22, 4)],
  light: [taper([192, 690], [206, 612], 12, -3), taper([318, 696], [322, 628], 10, 2), taper([400, 690], [388, 618], 12, 3)],
};

function hex(c: string): [number, number, number] {
  const n = parseInt(c.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lum = (c: string) => {
  const [r, g, b] = hex(c).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
function mix(a: string, b: string, t: number): string {
  const A = hex(a);
  const B = hex(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
/** A shade off the body: darker on light jerseys, lighter on near-black ones so seams still read. */
/** A number's geometry: drawn outlines (path data) or text in the team font. */
type Glyphs = { d?: string; t?: NumberText };
const shade = (c: string, t = 0.16) => (lum(c) < 0.06 ? mix(c, "#FFFFFF", t * 0.9) : mix(c, "#000000", t));

function stripes(trim: Trim) {
  return (trim.sleeve ?? []).flatMap((set, i) => {
    let at = set.at;
    return set.s.map(([color, w], j) => {
      const mid = at + w / 2;
      at += w;
      return color ? <path key={`${i}-${j}`} d={cuffLine(mid)} stroke={color} strokeWidth={w} fill="none" /> : null;
    });
  });
}

function pattern(id: PatternId, c: string, c2?: string) {
  switch (id) {
    case "tiger":
      return TIGER_L.map((d, i) => <path key={i} d={d} fill={c} />);
    case "peaks":
      return (
        <g>
          {c2 && <path d={PEAK_CAP_L} fill={c2} />}
          <path d={PEAK_TEETH_L} fill={c} />
        </g>
      );
    case "hook":
      return (
        <g>
          <path d={HOOK_L} fill={c} />
          {c2 && <path d={HOOK_LINE_L} fill="none" stroke={c2} strokeWidth={5} />}
        </g>
      );
  }
}

/** Straight parallel stripes over the left shoulder, centered on a to b and stacked outward. */
function bars(list: Bars[]) {
  return list.flatMap((bar, i) => {
    const [a, b] = [bar.a, bar.b];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // Unit normal pointing away from the chest (toward smaller x on the left side).
    let n: Pt = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    if (n[0] > 0) n = [-n[0], -n[1]];
    const total = bar.s.reduce((t, [, w]) => t + w, 0);
    let o = -total / 2;
    return bar.s.map(([color, w], j) => {
      const mid = o + w / 2;
      o += w;
      return color ? <path key={`${i}-${j}`} d={`M ${f(add(a, n, mid))} L ${f(add(b, n, mid))}`} stroke={color} strokeWidth={w} fill="none" /> : null;
    });
  });
}

/** A band stroked along `d` and its mirror, with optional edges. */
function band(d: string, b: Band) {
  return (
    <g fill="none" strokeLinecap="butt">
      {b.edge && <path d={d} stroke={b.edge} strokeWidth={b.w + 5} />}
      {b.edge && <path d={mirror(d)} stroke={b.edge} strokeWidth={b.w + 5} />}
      <path d={d} stroke={b.c} strokeWidth={b.w} />
      <path d={mirror(d)} stroke={b.c} strokeWidth={b.w} />
    </g>
  );
}

export function Jersey({ team, number = "", size = 120, away = false, light = 135, className }: JerseyProps) {
  const id = useId().replace(/:/g, "");
  const c: Colorway = colorway(team, away);
  const trim = trimFor(team, away);
  const n = String(number).replace(/\D/g, "").slice(0, 2);
  const two = n.length > 1;
  const seam = shade(c.body);
  const panelSeam = shade(c.panel);
  const edge = shade(c.body, 0.28);
  const col: Collar = c.collar;
  const cw = col.w ?? COLLAR_W;
  const cg = collarGeo(col.depth ?? COLLAR_DEPTH, cw);
  // Chest number sits high on the chest; one and two digits share the cap height, and the run is held
  // to a width that keeps clear of the sleeves and trim.
  const ns = numberStyle(team, away);
  const stroke = 16;
  const outline = ns.plain ? c.number : c.outline;
  const tn = teamNumerals(team);
  const paths = useMemo(() => {
    const at = (box: typeof CHEST, x: number): Glyphs => {
      const maxW = box.maxW[two ? 1 : 0];
      if (tn.kind === "font") return { t: numberText(tn, n, x, box.y, box.cap, maxW) };
      return { d: numberPath(tn.id, tn.set, n, x, box.y, box.cap, maxW).d };
    };
    return { chest: at(CHEST, 300), left: at(SHOULDER, 112), right: at(SHOULDER, 488) };
  }, [tn, n, two]);

  /** The number's shape, as a path or as text in the team font. */
  const shape = (g: Glyphs, p: { fill?: string; stroke?: string; strokeWidth?: number; transform?: string }) => {
    const common = { fill: p.fill ?? "none", stroke: p.stroke, strokeWidth: p.strokeWidth, strokeLinejoin: "miter" as const, strokeMiterlimit: 3, paintOrder: "stroke" };
    if (g.t && tn.kind === "font") {
      const t = g.t;
      const inner = t.transform ?? "";
      const tf = [p.transform, inner].filter(Boolean).join(" ") || undefined;
      // Slab 1s are a path beside the text (siblings, not a group, so the shape also works in a clipPath).
      return (
        <>
          {t.text && (
            <text x={t.x} y={t.y.toFixed(1)} fontFamily={`'${tn.family}', sans-serif`} fontWeight={tn.weight} fontSize={t.size.toFixed(1)} transform={tf} {...common}>
              {t.text}
            </text>
          )}
          {t.bars && <path d={t.bars} transform={tf} {...common} />}
        </>
      );
    }
    return <path d={g.d} transform={p.transform} {...common} />;
  };

  const num = (props: { g: Glyphs; x: number; y: number; strokeW: number; rotate?: number; key: string }) => {
    if (!props.g.d && !props.g.t?.text && !props.g.t?.bars) return null;
    const transforms = [props.rotate ? `rotate(${props.rotate} ${props.x} ${props.y})` : "", ns.slant ? `translate(${props.x} ${props.y}) skewX(${-ns.slant}) translate(${-props.x} ${-props.y})` : ""].filter(Boolean);
    const layer = (fill: string, w: number, dx = 0, dy = 0) => shape(props.g, { fill, stroke: fill, strokeWidth: w, transform: dx || dy ? `translate(${dx} ${dy})` : undefined });
    const k = props.strokeW / stroke;
    const w2 = props.strokeW + 12 * k;
    // Inline: a thin line of a lighter tone set just inside the number's edge, drawn as two strokes
    // clipped to the number (the line, then the fill color over its outer part).
    const clip = `${id}-ni${props.key}`;
    const inl = ns.inline && (
      <>
        <clipPath id={clip}>{shape(props.g, { fill: "#000" })}</clipPath>
        <g clipPath={`url(#${clip})`} strokeLinejoin="round">
          {shape(props.g, { stroke: ns.inline, strokeWidth: (ns.inlineAt ?? 8) * k + (ns.inlineW ?? 5) * k })}
          {shape(props.g, { stroke: c.number, strokeWidth: (ns.inlineAt ?? 8) * k })}
        </g>
      </>
    );
    return (
      <g transform={transforms.length ? transforms.join(" ") : undefined} aria-hidden="true">
        {ns.shadow && layer(ns.shadow, ns.outline2 ? w2 : props.strokeW, 9 * k, 9 * k)}
        {ns.outline2 && layer(ns.outline2, w2)}
        {!ns.plain && layer(outline, props.strokeW)}
        {shape(props.g, { fill: c.number })}
        {inl}
      </g>
    );
  };

  // Light: strengths by body luminance (0 black, 1 white).
  const L = lum(c.body);
  const rich = size >= 120;
  const ramp = (black: number, mid: number, white: number) => (L < 0.3 ? black + (mid - black) * (L / 0.3) : mid + (white - mid) * ((L - 0.3) / 0.7));
  const hi = ramp(0.2, 0.16, 0.04);
  const sh = ramp(0.58, 0.48, 0.2);
  const vig = ramp(0.55, 0.44, 0.14);
  const rimA = ramp(0.42, 0.3, 0);
  const foldSh = ramp(0.6, 0.4, 0.2);
  const foldHi = ramp(0.12, 0.08, 0.5);
  const shadowInk = L > 0.6 ? "#28324a" : "#000";
  const meshInk = L < 0.12 ? "#fff" : "#000";
  const meshA = L < 0.12 ? 0.07 : L > 0.6 ? 0.07 : 0.11;
  // Key light comes from `light` degrees; the rim light mirrors it across the vertical axis.
  const a = (light * Math.PI) / 180;
  const dir: Pt = [Math.cos(a), -Math.sin(a)];
  const keyFrom = add(CENTER, dir, 420);
  const keyTo = add(CENTER, dir, -420);
  const rimFrom = add(CENTER, [-dir[0], dir[1]], 420);
  const hot = add(CENTER, dir, 210);
  const satin = (side: number) => 0.22 + 0.5 * Math.max(0, side * -dir[0]) + 0.12 * Math.max(0, -dir[1]);
  const u = (k: string) => `url(#${id}-${k})`;

  return (
    <svg
      className={className}
      width={size}
      height={(size * VH) / VW}
      viewBox={`0 0 ${VW} ${VH}`}
      role="img"
      aria-label={n ? `Jersey number ${n}` : "Jersey"}
      data-team={team}
    >
      <defs>
        <clipPath id={`${id}-b`}>
          <path d={BODY} />
        </clipPath>
        <clipPath id={`${id}-cb`}>
          <path d={cg.band} />
        </clipPath>
        <clipPath id={`${id}-s`}>
          <path d={SLEEVE_ZONE_L} />
        </clipPath>
        {/* Cylinder form: the body turns away at both sides */}
        <linearGradient id={`${id}-x`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={shadowInk} stopOpacity={sh * 0.9} />
          <stop offset="0.22" stopColor={shadowInk} stopOpacity="0" />
          <stop offset="0.78" stopColor={shadowInk} stopOpacity="0" />
          <stop offset="1" stopColor={shadowInk} stopOpacity={sh * 0.9} />
        </linearGradient>
        {/* Key light, with the soft fill keeping the far side from going flat black */}
        <linearGradient id={`${id}-k`} gradientUnits="userSpaceOnUse" x1={keyFrom[0]} y1={keyFrom[1]} x2={keyTo[0]} y2={keyTo[1]}>
          <stop offset="0.12" stopColor="#fff" stopOpacity={hi} />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.6" stopColor={shadowInk} stopOpacity="0" />
          <stop offset="1" stopColor={shadowInk} stopOpacity={sh * 0.75} />
        </linearGradient>
        {/* Rim light along the edge opposite the key */}
        <linearGradient id={`${id}-r`} gradientUnits="userSpaceOnUse" x1={rimFrom[0]} y1={rimFrom[1]} x2={CENTER[0]} y2={CENTER[1]}>
          <stop offset="0.25" stopColor="#fff" stopOpacity={rimA} />
          <stop offset="0.7" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {/* Key hotspot: the soft bright patch where the key light lands on the chest */}
        <radialGradient id={`${id}-h`} gradientUnits="userSpaceOnUse" cx={hot[0]} cy={hot[1]} r="270">
          <stop offset="0" stopColor="#fff" stopOpacity={hi * 1.1} />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-sl`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity={hi * 1.2} />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        {/* Hem vignette */}
        <linearGradient id={`${id}-v`} gradientUnits="userSpaceOnUse" x1="0" y1="360" x2="0" y2="690">
          <stop offset="0" stopColor={shadowInk} stopOpacity="0" />
          <stop offset="1" stopColor={shadowInk} stopOpacity={vig} />
        </linearGradient>
        <linearGradient id={`${id}-n`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.12" />
          <stop offset="1" stopColor="#000" stopOpacity="0.02" />
        </linearGradient>
        <radialGradient id={`${id}-a`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={shadowInk} stopOpacity={sh * 1.1} />
          <stop offset="1" stopColor={shadowInk} stopOpacity="0" />
        </radialGradient>
        {/* Flat knit collar: a faint, broad sheen across the band (stronger on the lit side), no rolled edges */}
        {[1, -1].map((side) => {
          const [p, q] = side > 0 ? cg.across : cg.across.map(mx);
          const spec = Math.min(col.style === "plain" ? 0.05 : 0.09, satin(side) * 0.14);
          return (
            <linearGradient key={side} id={`${id}-c${side > 0 ? "l" : "r"}`} gradientUnits="userSpaceOnUse" x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]}>
              <stop offset="0" stopColor="#000" stopOpacity="0.04" />
              <stop offset="0.2" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity={spec} />
              <stop offset="0.8" stopColor="#fff" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity="0.04" />
            </linearGradient>
          );
        })}
        {rich && (
          <>
            {/* Polyester mesh: tiny hex-packed holes */}
            <pattern id={`${id}-m`} width="7" height="6.06" patternUnits="userSpaceOnUse">
              <circle cx="1.75" cy="1.52" r="1.15" fill={meshInk} fillOpacity={meshA} />
              <circle cx="5.25" cy="4.55" r="1.15" fill={meshInk} fillOpacity={meshA} />
            </pattern>
            <filter id={`${id}-g`} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
              <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="7" />
              <feColorMatrix type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1.6 -0.75" />
            </filter>
            <filter id={`${id}-f`} x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
            <filter id={`${id}-cs`} x="-5%" y="-20%" width="110%" height="150%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </>
        )}
      </defs>

      <path d={BODY} fill={c.body} />
      <g clipPath={u("b")}>
        <path d={PANEL_L} fill={c.panel} />
        <path d={mirror(PANEL_L)} fill={c.panel} />
        {rich && <rect width={VW} height={VH} fill={u("m")} />}
        {rich && <rect width={VW} height={VH} filter={u("g")} opacity={L > 0.6 ? 0.16 : 0.24} />}
        {/* Trim: side band, raglan band, then sleeve stripes and patterns, mirrored to the right sleeve */}
        {trim?.side && band(SIDE_L, trim.side)}
        {trim?.raglan && band(RAGLAN_L, trim.raglan)}
        {trim?.marks && <path d={`${MARKS_L} ${mirror(MARKS_L)}`} fill={trim.marks} />}
        {trim && (trim.sleeve || trim.pattern || trim.bars) && [false, true].map((flip) => (
          <g key={String(flip)} transform={flip ? `matrix(-1 0 0 1 ${VW} 0)` : undefined}>
            <g clipPath={u("s")}>
              {stripes(trim)}
              {trim.pattern && pattern(trim.pattern.id, trim.pattern.c, trim.pattern.c2)}
            </g>
            {trim.bars && bars(trim.bars)}
          </g>
        ))}
        {/* Shoulder-top numbers, cut by the shoulder line as they wrap over the top */}
        {!ns.noShoulder && num({ g: paths.left, x: 112, y: SHOULDER.y, strokeW: 7, rotate: -5, key: "l" })}
        {!ns.noShoulder && num({ g: paths.right, x: 488, y: SHOULDER.y, strokeW: 7, rotate: 5, key: "r" })}
        <g fill="none" strokeWidth="2.2" strokeLinecap="round">
          <path d={RAGLAN_L} stroke={seam} />
          <path d={mirror(RAGLAN_L)} stroke={seam} />
          <path d={SLEEVE_L} stroke={seam} strokeOpacity="0.7" />
          <path d={mirror(SLEEVE_L)} stroke={seam} strokeOpacity="0.7" />
          <path d={SIDE_L} stroke={panelSeam} />
          <path d={mirror(SIDE_L)} stroke={panelSeam} />
          <path d={BELLY} stroke={seam} />
        </g>
        {/* A very soft contact shadow under the collar edge */}
        <path d={cg.outer} transform="translate(0 4)" fill="none" stroke="#000" strokeOpacity={L > 0.6 ? 0.08 : 0.16} strokeWidth="7" filter={rich ? u("cs") : undefined} />
      </g>

      {/* Cuffs */}
      <path d={CUFF_L} fill={c.cuff} />
      <path d={mirror(CUFF_L)} fill={c.cuff} />

      {/* V-neck: back of the neck, the band (plain, solid or striped), an optional notch, then the satin sheen */}
      <path d={cg.neck} fill={shade(c.body, 0.05)} />
      <path d={cg.neck} fill={u("n")} />
      <path d={cg.band} fill={col.style === "plain" ? c.body : col.c} />
      {col.style === "striped" && (
        <g clipPath={u("cb")}>
          {(() => {
            let o = 0;
            return col.s.map(([color, w], i) => {
              const a = o;
              o += w;
              return color ? <path key={i} d={cg.strip(a, o)} fill={color} /> : null;
            });
          })()}
        </g>
      )}
      {col.style === "plain" && (
        <g fill="none" stroke={seam} strokeWidth="2.2" strokeLinejoin="miter">
          <path d={cg.outer} />
          <path d={cg.inner} />
        </g>
      )}
      {col.style !== "plain" && col.notch && <path d={cg.notch} fill={c.body} />}
      <path d={cg.arm} fill={u("cl")} />
      <path d={mirror(cg.arm)} fill={u("cr")} />
      <path d={cg.band} fill="none" stroke="#000" strokeOpacity="0.1" strokeWidth="1.2" />

      {/* Chest number */}
      {num({ g: paths.chest, x: 300, y: CHEST.y, strokeW: stroke, key: "c" })}

      {/* Shading over everything on the body, number and trim included, so they sit in the cloth */}
      <g clipPath={u("b")} style={{ pointerEvents: "none" }}>
        {rich && (
          <g filter={u("f")}>
            {[false, true].map((flip) => (
              <g key={String(flip)} transform={flip ? `matrix(-1 0 0 1 ${VW} 0)` : undefined}>
                {FOLDS_L.shadow.map((d, i) => <path key={i} d={d} fill={shadowInk} fillOpacity={foldSh} />)}
                {FOLDS_L.light.map((d, i) => <path key={i} d={d} fill="#fff" fillOpacity={foldHi} />)}
              </g>
            ))}
            {HEM.shadow.map((d, i) => <path key={i} d={d} fill={shadowInk} fillOpacity={foldSh} />)}
            {HEM.light.map((d, i) => <path key={i} d={d} fill="#fff" fillOpacity={foldHi} />)}
          </g>
        )}
        {/* Sleeve volume: light across the top of each sleeve, falling off toward the cuff */}
        <ellipse cx="78" cy="96" rx="62" ry="40" transform="rotate(-20 78 96)" fill={u("sl")} opacity={dir[0] < 0 ? 1 : 0.4} />
        <ellipse cx="522" cy="96" rx="62" ry="40" transform="rotate(20 522 96)" fill={u("sl")} opacity={dir[0] > 0 ? 1 : 0.4} />
        <ellipse cx="128" cy="236" rx="40" ry="30" fill={u("a")} />
        <ellipse cx="472" cy="236" rx="40" ry="30" fill={u("a")} />
        <rect width={VW} height={VH} fill={u("x")} />
        <rect width={VW} height={VH} fill={u("k")} />
        <rect width={VW} height={VH} fill={u("h")} />
        <rect width={VW} height={VH} fill={u("v")} />
        <path d={BODY} fill="none" stroke={u("r")} strokeWidth="14" filter={rich ? u("cs") : undefined} />
      </g>
      <path d={BODY} fill="none" stroke={edge} strokeWidth="2" />
    </svg>
  );
}
