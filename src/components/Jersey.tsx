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

/** Team defense: a flat glyph-style helmet, facing right. Solid team-color shell, facemask in a
    contrasting team color, and details cut out in the row's background so it reads at any size. */
export function Helmet({ team, size = 36, ring }: { team: string; size?: number; ring?: "warn" | "bad" }) {
  const [shell, ink, trim] = teamColors(team);
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  // Mask must stand out from the shell and from both light and dark backgrounds, so skip pure white and near-black
  const usable = (c: string) => Math.abs(lum(c) - lum(shell)) > 0.22 && lum(c) > 0.14 && lum(c) < 0.86;
  const mask = usable(trim) ? trim : usable(ink) ? ink : "#8E949E";
  const cut = { stroke: "var(--surface, #fff)" } as const;
  return (
    <span className={`jersey helmet${ring ? ` ring-${ring}` : ""}`} style={{ width: size, height: size }} role="img" aria-label={`${team} defense helmet`}>
      <svg viewBox="45 45 520 520" width={size} height={size} aria-hidden="true" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <g transform="matrix(-1 0 0 1 610 0)">
          {/* A faint rim so dark shells still read on a dark background */}
          <path d={SHELL} fill={shell} strokeWidth="7" style={{ stroke: "var(--faint, #9AA0AA)", strokeOpacity: 0.55 }} />
          {/* Back bumper seam and vent dots, cut out of the shell */}
          <path d="M432 484 C440 460 452 444 472 438 L530 436" strokeWidth="10" style={cut} />
          <g style={{ fill: "var(--surface, #fff)" }}>
            <circle cx="311" cy="278" r="10" /><circle cx="276" cy="462" r="10" /><circle cx="322" cy="485" r="10" /><circle cx="409" cy="460" r="10" />
          </g>
          {/* Facemask: a background-colored gap, then the bar */}
          <g strokeWidth="30" style={cut}>{MASK.map((d) => <path key={d} d={d} />)}</g>
          <g strokeWidth="16" stroke={mask}>{MASK.map((d) => <path key={d} d={d} />)}</g>
        </g>
      </svg>
    </span>
  );
}
// 612-grid, left-facing glyph: brow knob, round crown, back bumper, jaw sweeping to the face
const SHELL = "M178 196 C220 140 280 108 335 106 C430 104 520 160 548 260 C560 320 552 390 530 432 L490 488 L438 484 C410 482 385 488 360 496 C340 504 315 508 292 498 C262 486 244 470 232 452 L222 430 C210 410 205 380 205 350 L198 300 C192 270 190 250 186 236 C176 236 160 236 152 228 C146 218 152 206 162 204 C168 202 174 200 178 196 Z";
const MASK = [
  "M128 242 L276 284 L326 388 L238 434",
  "M232 302 L256 334 L290 380 L236 410",
  "M66 356 L242 386",
  "M66 406 L240 412",
  "M76 360 L74 484 L170 472",
  "M212 288 L176 472",
];
