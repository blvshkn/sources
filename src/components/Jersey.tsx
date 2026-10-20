// A front-view football jersey in any team's colorway. Pure SVG: the number is live text, so it
// stays selectable and changes with the `number` prop. No logos, names or maker marks, only team
// colors and a small Sources dot under the collar.
// Number font: Teko 700 (Google Fonts, OFL), a squared block face close to a sewn tackle-twill number; loaded in index.html.
import { useId } from "react";
import { colorway, type Colorway } from "../jerseys";

export interface JerseyProps {
  /** NFL abbreviation, e.g. "BUF" */
  team: string;
  /** 0 to 99 */
  number?: string | number;
  /** Width in px. Height follows the 600 x 690 artboard. */
  size?: number;
  /** White colorway */
  away?: boolean;
  className?: string;
}

const VW = 600;
const VH = 690;
export const JERSEY_FONT = `"Teko", "Oswald", "Arial Narrow", "Roboto Condensed", sans-serif`;

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
// Collar band: the shoulders carry the outer stripe, the V front carries the inner stripe with two
// thin pinstripes, and the back of the neck shows through the opening.
const OUT: Pt[] = [[184, 4], [300, 110], [416, 4]];
const INN: Pt[] = [[212, 0], [300, 82], [388, 0]];
const BAND = `M ${OUT.map((p) => p.join(" ")).join(" L ")} L ${[...INN].reverse().map((p) => p.join(" ")).join(" L ")} Z`;
const SHOULDER_L = "M 184 4 L 230 46 L 248.5 34 L 212 0 Z";
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const pin = (t: number) => {
  const a = lerp([230, 46], [248.5, 34], t);
  const v = lerp([300, 110], [300, 82], t);
  return `M ${a.join(" ")} L ${v.join(" ")} L ${mx(a).join(" ")}`;
};
const NECK = `M ${INN.map((p) => p.join(" ")).join(" L ")} Z`;
// Seams: raglan from collar to sleeve, a sleeve seam, the side panel curve and the lower front arc.
const RAGLAN_L = "M 222 50 C 190 92 152 140 120 196";
const SLEEVE_L = "M 22 60 C 32 98 36 132 38 170";
const SIDE_L = "M 132 380 C 165 420 198 455 207 500 C 212 522 214 540 215 562";
const PANEL_L = "M 132 380 C 165 420 198 455 207 500 C 212 522 214 540 215 562 L 218 700 L 0 700 L 0 380 Z";
const BELLY = "M 207 502 C 250 478 350 478 393 502";

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
const shade = (c: string, t = 0.16) => (lum(c) < 0.06 ? mix(c, "#FFFFFF", t * 0.9) : mix(c, "#000000", t));

export function Jersey({ team, number = "", size = 120, away = false, className }: JerseyProps) {
  const id = useId().replace(/:/g, "");
  const c: Colorway = colorway(team, away);
  const n = String(number).replace(/\D/g, "").slice(0, 2);
  const two = n.length > 1;
  const seam = shade(c.body);
  const panelSeam = shade(c.panel);
  const edge = shade(c.body, 0.28);
  // Chest number: one digit stands tall and centred; two digits come down a touch with a little
  // tracking so the outlines meet without the fills touching.
  const fs = two ? 258 : 300;
  const track = two ? 0.02 : 0;
  const numY = two ? 398 : 410;
  const stroke = 16;
  const dark = lum(c.body) < 0.2;

  const num = (props: { x: number; y: number; size: number; strokeW: number; rotate?: number; letter?: number }) => {
    const common = {
      x: props.x,
      y: props.y,
      textAnchor: "middle" as const,
      fontFamily: JERSEY_FONT,
      fontWeight: 700,
      fontSize: props.size,
      letterSpacing: `${props.letter ?? track}em`,
      transform: props.rotate ? `rotate(${props.rotate} ${props.x} ${props.y})` : undefined,
    };
    return (
      <>
        <text {...common} aria-hidden="true" fill={c.outline} stroke={c.outline} strokeWidth={props.strokeW} strokeLinejoin="miter" strokeMiterlimit={3} paintOrder="stroke" style={{ userSelect: "none" }}>
          {n}
        </text>
        <text {...common} fill={c.number}>
          {n}
        </text>
      </>
    );
  };

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
        <linearGradient id={`${id}-x`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity={dark ? 0.28 : 0.16} />
          <stop offset="0.2" stopColor="#000" stopOpacity="0.02" />
          <stop offset="0.5" stopColor="#fff" stopOpacity={dark ? 0.07 : 0.05} />
          <stop offset="0.8" stopColor="#000" stopOpacity="0.02" />
          <stop offset="1" stopColor="#000" stopOpacity={dark ? 0.28 : 0.16} />
        </linearGradient>
        <linearGradient id={`${id}-y`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={dark ? 0.06 : 0} />
          <stop offset="0.35" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity={dark ? 0.16 : 0.07} />
        </linearGradient>
        <linearGradient id={`${id}-n`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.16" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-a`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity={dark ? 0.35 : 0.14} />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <path d={BODY} fill={c.body} />
      <g clipPath={`url(#${id}-b)`}>
        <path d={PANEL_L} fill={c.panel} />
        <path d={mirror(PANEL_L)} fill={c.panel} />
        {/* Shoulder-top numbers, cut by the shoulder line as they wrap over the top */}
        {num({ x: 112, y: 38, size: 100, strokeW: 7, rotate: -5, letter: two ? 0.02 : 0 })}
        {num({ x: 488, y: 38, size: 100, strokeW: 7, rotate: 5, letter: two ? 0.02 : 0 })}
        {/* Underarm folds */}
        <ellipse cx="130" cy="232" rx="30" ry="20" fill={`url(#${id}-a)`} />
        <ellipse cx="470" cy="232" rx="30" ry="20" fill={`url(#${id}-a)`} />
        <g fill="none" strokeWidth="2.2" strokeLinecap="round">
          <path d={RAGLAN_L} stroke={seam} />
          <path d={mirror(RAGLAN_L)} stroke={seam} />
          <path d={SLEEVE_L} stroke={seam} strokeOpacity="0.7" />
          <path d={mirror(SLEEVE_L)} stroke={seam} strokeOpacity="0.7" />
          <path d={SIDE_L} stroke={panelSeam} />
          <path d={mirror(SIDE_L)} stroke={panelSeam} />
          <path d={BELLY} stroke={seam} />
        </g>
      </g>

      {/* Cuffs */}
      <path d={CUFF_L} fill={c.cuff} />
      <path d={mirror(CUFF_L)} fill={c.cuff} />

      {/* V-neck: outer stripe, inner stripe, back of the neck */}
      <path d={NECK} fill={shade(c.body, 0.05)} />
      <path d={NECK} fill={`url(#${id}-n)`} />
      <path d={BAND} fill={c.collar2} />
      <path d={SHOULDER_L} fill={c.collar1} />
      <path d={mirror(SHOULDER_L)} fill={c.collar1} />
      <g fill="none" stroke={c.collar1} strokeWidth="2" strokeOpacity="0.75" strokeLinejoin="miter">
        <path d={pin(0.36)} />
        <path d={pin(0.68)} />
      </g>
      <path d={BAND} fill="none" stroke="#000" strokeOpacity="0.12" strokeWidth="1.5" />

      {/* Sources dot mark */}
      <circle cx="234" cy="134" r="8" fill={c.collar1 === c.body ? c.outline : c.collar1} />
      <text x="234" y="138" textAnchor="middle" fontFamily="Geist, system-ui, sans-serif" fontWeight="700" fontSize="11" fill={c.body} aria-hidden="true" style={{ userSelect: "none" }}>
        S
      </text>

      {/* Chest number */}
      {num({ x: 300, y: numY, size: fs, strokeW: stroke })}

      {/* Fabric depth over everything on the body */}
      <g clipPath={`url(#${id}-b)`} style={{ pointerEvents: "none" }}>
        <rect width={VW} height={VH} fill={`url(#${id}-x)`} />
        <rect width={VW} height={VH} fill={`url(#${id}-y)`} />
      </g>
      <path d={BODY} fill="none" stroke={edge} strokeWidth="2" />
    </svg>
  );
}
