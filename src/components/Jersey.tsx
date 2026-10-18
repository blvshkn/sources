import { useId } from "react";
import { Player } from "../data";
import { jerseyNumber, teamColors, useJerseys } from "../jersey";

/** A team-colored jersey with the player's real number. Team palette only, no logos. */
export function Jersey({ p, size = 36, ring, text }: { p: Pick<Player, "id" | "name" | "nfl">; size?: number; ring?: "warn" | "bad"; text?: string }) {
  useJerseys();
  const uid = useId().replace(/:/g, "");
  const [body, ink, trim] = teamColors(p.nfl);
  if (/^[A-Z]{2,3}$/.test(p.id)) return <Helmet team={p.nfl || p.id} size={size} ring={ring} />;
  const num = jerseyNumber(p);
  const label = text ?? (num !== undefined ? String(num) : "");
  const fs = label.length > 2 ? 15 : label.length > 1 ? 21 : 24;
  return (
    <span className={`jersey${ring ? ` ring-${ring}` : ""}`} style={{ width: size, height: size }} role="img" aria-label={`${p.nfl} jersey${label ? ` number ${label}` : ""}`}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id={`jg${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.18" />
          </linearGradient>
          <clipPath id={`jc${uid}`}><path d={SHAPE} /></clipPath>
        </defs>
        <path d={SHAPE} fill={body} />
        <g clipPath={`url(#jc${uid})`}>
          <path d="M3 21 L13 17.5 M5 26 L14.5 22.5" stroke={trim} strokeWidth="2.6" />
          <path d="M61 21 L51 17.5 M59 26 L49.5 22.5" stroke={trim} strokeWidth="2.6" />
          <path d={SHAPE} fill={`url(#jg${uid})`} />
        </g>
        <path d="M24 6.5 Q32 14 40 6.5" fill="none" stroke={trim} strokeWidth="2.4" strokeLinecap="round" />
        <path d={SHAPE} fill="none" stroke="rgba(0,0,0,0.28)" strokeWidth="1" />
        {label && (
          <text x="32" y="44" textAnchor="middle" fontSize={fs} fontWeight="800" fill={ink} stroke={trim === ink ? "rgba(0,0,0,0.35)" : trim} strokeWidth="1.4"
            paintOrder="stroke" fontFamily="'Geist', ui-sans-serif, system-ui, sans-serif" letterSpacing="-0.5">{label}</text>
        )}
      </svg>
    </span>
  );
}
const SHAPE = "M23 5 L27 3.5 Q32 9 37 3.5 L41 5 L56 11.5 Q59 13 60 16 L62 26 L50 29.5 L48.5 24 L48.5 58 Q48.5 61 45.5 61 L18.5 61 Q15.5 61 15.5 58 L15.5 24 L14 29.5 L2 26 L4 16 Q5 13 8 11.5 Z";

/** Team defense: a flat glyph-style helmet, facing right.
    Built on circles so every curve agrees: the shell is one arc, the stripe and highlight are
    concentric with it. Details are cut out in the row's background so it reads at any size. */
export function Helmet({ team, size = 36, ring }: { team: string; size?: number; ring?: "warn" | "bad" }) {
  const uid = useId().replace(/:/g, "");
  const [shell, ink, trim] = teamColors(team);
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const mix = (h: string, w: number) => { const n = parseInt(h.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * w)); return `rgb(${c.join(",")})`; };
  const apart = (c: string, d: number) => Math.abs(lum(c) - lum(shell)) > d;
  // Mask reads against the shell and on light or dark rows, so skip pure white and near-black
  const usable = (c: string) => apart(c, 0.22) && lum(c) > 0.14 && lum(c) < 0.86;
  const mask = usable(trim) ? trim : usable(ink) ? ink : "#8E949E";
  // Stripe: ink core with trim borders when the team has both, otherwise a single band
  const core = apart(ink, 0.15) ? ink : apart(trim, 0.15) ? trim : "#FFFFFF";
  const edge = apart(trim, 0.15) && trim !== core ? trim : null;
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
