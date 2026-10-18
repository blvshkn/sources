import { useId } from "react";
import { Player } from "../data";
import { jerseyNumber, teamColors, useJerseys } from "../jersey";

const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
/** Visible difference between two colors: hue counts, not just brightness (red on royal blue reads fine). */
const dist = (a: string, b: string) => { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); return Math.hypot((x >> 16) - (y >> 16), ((x >> 8) & 255) - ((y >> 8) & 255), (x & 255) - (y & 255)); };
const mix = (h: string, w: number) => { const n = parseInt(h.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * w)); return `rgb(${c.join(",")})`; };

/** A team-colored jersey with the player's real number, in the same flat glyph style as the
    defense helmets: one flat body color, flat shade and gloss, seams cut out in the row's
    background, trim on the collar and sleeves. Team palette only, no logos. */
export function Jersey({ p, size = 36, ring, text }: { p: Pick<Player, "id" | "name" | "nfl">; size?: number; ring?: "warn" | "bad"; text?: string }) {
  useJerseys();
  const uid = useId().replace(/:/g, "");
  const [body, ink, trim] = teamColors(p.nfl);
  if (/^[A-Z]{2,3}$/.test(p.id)) return <Helmet team={p.nfl || p.id} size={size} ring={ring} />;
  const num = jerseyNumber(p);
  const label = text ?? (num !== undefined ? String(num) : "");
  const fs = label.length > 2 ? 16 : label.length > 1 ? 22 : 25;
  const shows = (c: string) => dist(c, body) > 110;
  const accent = shows(trim) ? trim : shows(ink) ? ink : mix(body, 0.4);
  const numEdge = trim !== ink && shows(trim) ? trim : lum(ink) > 0.5 ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.5)";
  const dark = lum(body) < 0.2;
  const bg = { stroke: "var(--surface, #fff)" } as const;
  const clip = `jc${uid}`;
  return (
    <span className={`jersey${ring ? ` ring-${ring}` : ""}`} style={{ width: size, height: size }} role="img" aria-label={`${p.nfl} jersey${label ? ` number ${label}` : ""}`}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <defs><clipPath id={clip}><path d={SHAPE} /></clipPath></defs>
        <path d={SHAPE} fill={body} />
        <g clipPath={`url(#${clip})`}>
          {/* Flat shade along the hem, flat gloss on the shoulder: same treatment as the helmet */}
          <path d="M0 50 C20 54 44 54 64 48 L64 64 L0 64 Z" fill="#000" opacity="0.14" />
          {/* Sleeve stripes in trim, each set off by a background gap */}
          <g strokeWidth="5.2" style={bg}><path d={SLEEVES} /></g>
          <g strokeWidth="2.6" stroke={accent}><path d={SLEEVES} /></g>
        </g>
        {/* Seams cut out where the sleeves join the body */}
        <g strokeWidth="1.6" style={bg}>
          <path d="M15.5 25.5 L18.4 11.4" /><path d="M48.5 25.5 L45.6 11.4" />
        </g>
        {/* Collar: trim band with a background gap */}
        <path d={COLLAR} strokeWidth="5.4" style={bg} />
        <path d={COLLAR} strokeWidth="2.8" stroke={accent} />
        <path d="M11 15 C13.4 13.4 15.6 12.6 18 12.2" strokeWidth="2" stroke="#fff" strokeOpacity="0.32" />
        {dark && <path d={SHAPE} strokeWidth="0.9" stroke={mix(body, 0.32)} />}
        {label && (
          <text x="32" y={label.length > 2 ? 37 : 39} textAnchor="middle" fontSize={fs} fontWeight="800" fill={ink} stroke={numEdge} strokeWidth="1.5"
            paintOrder="stroke" fontFamily="'Geist', ui-sans-serif, system-ui, sans-serif" letterSpacing="-0.6">{label}</text>
        )}
      </svg>
    </span>
  );
}
const SHAPE = "M23.4 5.2 L27 4 Q32 8.6 37 4 L40.6 5.2 L55.2 11.2 Q58.4 12.6 59.2 15.8 L61.6 25.4 L50.6 28.8 L48.6 24.2 L48.6 57.6 Q48.6 60.6 45.6 60.6 L18.4 60.6 Q15.4 60.6 15.4 57.6 L15.4 24.2 L13.4 28.8 L2.4 25.4 L4.8 15.8 Q5.6 12.6 8.8 11.2 Z";
const SLEEVES = "M3.4 21.6 L14.2 18.4 M49.8 18.4 L60.6 21.6";
const COLLAR = "M25.6 5 Q32 12.4 38.4 5";

/** Team defense: a flat glyph-style helmet, facing right.
    Built on circles so every curve agrees: the shell is one arc, the stripe and highlight are
    concentric with it. Details are cut out in the row's background so it reads at any size. */
export function Helmet({ team, size = 36, ring }: { team: string; size?: number; ring?: "warn" | "bad" }) {
  const uid = useId().replace(/:/g, "");
  const [shell, ink, trim] = teamColors(team);
  const apart = (c: string, d: number) => Math.abs(lum(c) - lum(shell)) > d;
  // Mask reads against the shell and on light or dark rows, so skip pure white and near-black
  const usable = (c: string) => apart(c, 0.22) && lum(c) > 0.14 && lum(c) < 0.86;
  const mask = usable(trim) ? trim : usable(ink) ? ink : "#8E949E";
  // Stripe: ink core with trim borders when the team has both, otherwise a single band
  const core = dist(ink, shell) > 110 ? ink : dist(trim, shell) > 110 ? trim : "#FFFFFF";
  const edge = dist(trim, shell) > 110 && trim !== core ? trim : null;
  const dark = lum(shell) < 0.2;
  const bg = { stroke: "var(--surface, #fff)" } as const;
  const clip = `hg${uid}`;
  return (
    <span className={`jersey helmet${ring ? ` ring-${ring}` : ""}`} style={{ width: size, height: size }} role="img" aria-label={`${team} defense helmet`}>
      <svg viewBox="45 45 520 520" width={size} height={size} aria-hidden="true" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <defs><clipPath id={clip}><path d={SHELL} /></clipPath></defs>
        <g transform="matrix(-1 0 0 1 610 0)">
          <path d={SHELL} fill={shell} />
          <g clipPath={`url(#${clip})`}>
            <path d="M200 436 C280 470 420 468 560 372 L600 600 L200 600 Z" fill="#000" opacity="0.14" />
            {edge && <path d={STRIPE} strokeWidth="28" stroke={edge} strokeLinecap="butt" />}
            <path d={STRIPE} strokeWidth={edge ? 12 : 20} stroke={core} strokeLinecap="butt" />
            <path d={GLOSS} strokeWidth="12" stroke="#fff" strokeOpacity="0.28" />
          </g>
          {/* Dark shells get a rim in a lighter tone of their own color so they hold up on dark rows */}
          {dark && <path d={SHELL} strokeWidth="7" stroke={mix(shell, 0.32)} />}
          {/* Cut-outs: brow seam, jaw pad, bumper seam, vents */}
          <g strokeWidth="10" style={bg}>
            <path d="M204 206 C198 214 197 226 202 236" />
            <path d="M250 306 L286 382 L238 406" />
            <path d="M434 484 C442 462 454 446 474 440 L534 438" />
          </g>
          <g style={{ fill: "var(--surface, #fff)" }}>
            <circle cx="314" cy="280" r="11" /><circle cx="278" cy="462" r="10" /><circle cx="324" cy="484" r="10" /><circle cx="410" cy="460" r="10" />
          </g>
          {/* Facemask: background gap first, then the bar, so every crossing reads cleanly */}
          <g strokeWidth="34" style={bg}>{MASK.map((d) => <path key={d} d={d} />)}</g>
          <g strokeWidth="18" stroke={mask}>{MASK.map((d) => <path key={d} d={d} />)}</g>
        </g>
      </svg>
    </span>
  );
}
// Left-facing on a 612 grid. Dome: circle at (365, 298), r 188. Brow knob at the front, bumper at the back.
const SHELL = "M202 204 A188 188 0 0 1 531 386 L536 432 C532 452 512 476 490 488 L440 484 C410 482 385 488 360 496 C338 503 314 506 292 498 C262 487 243 470 232 452 C224 430 220 400 218 370 C216 330 212 290 206 252 C205 246 204 240 202 236 L188 236 C177 236 170 228 171 218 C172 210 180 204 190 204 Z";
// Concentric with the dome: stripe at r 164 (a sliver of shell shows above it), gloss at r 128
const STRIPE = "M220 221 A164 164 0 0 1 515 365";
const GLOSS = "M252 238 A128 128 0 0 1 317 179";
const MASK = [
  "M126 244 L270 284 Q300 330 318 384 L240 432",
  "M64 356 L244 386",
  "M64 406 L242 412",
  "M76 360 L74 484 L170 472",
  "M212 288 L176 472",
];
