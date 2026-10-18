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

/** Team defense: a modern speed-style helmet in a bold cel-shaded illustration style, facing right.
    Team palette and the team's abbreviation as a side decal. No logos. */
export function Helmet({ team, size = 36, ring }: { team: string; size?: number; ring?: "warn" | "bad" }) {
  const uid = useId().replace(/:/g, "");
  const [shell, ink, trim] = teamColors(team);
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const darkShell = lum(shell) < 0.2;
  const contrast = (c: string) => Math.abs(lum(c) - lum(shell)) > 0.22;
  // Gray cage like the real thing, or a team color when the shell is too dark for gray to read
  const mask = darkShell ? (contrast(trim) ? trim : contrast(ink) ? ink : "#9AA0AA") : "#33373F";
  const decal = contrast(ink) ? ink : contrast(trim) ? trim : lum(shell) > 0.5 ? "#14161A" : "#FFFFFF";
  const decalEdge = contrast(trim) && trim !== decal ? trim : "#0E1014";
  const line = "#0E1014";
  const clip = `hc${uid}`;
  return (
    <span className={`jersey helmet${ring ? ` ring-${ring}` : ""}`} style={{ width: size, height: size }} role="img" aria-label={`${team} defense helmet`}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" strokeLinejoin="round" strokeLinecap="round">
        <defs><clipPath id={clip}><path d={SHELL} /></clipPath></defs>
        {/* Drawn facing left, mirrored to face right */}
        <g transform="matrix(-1 0 0 1 64 0)">
          {/* Helmet interior and jaw pad, seen through the cage */}
          <path d="M17.6 23 C21 22.8 24.6 24 26.8 26.6 C28.6 31.4 29.8 37.4 30.6 41.6 L32.2 48.2 C28.4 50.6 24.4 52.4 20.2 53.2 L15.6 52.6 C14.4 44 14.2 33 15 23.6 Z" fill="#1B1E25" stroke={line} strokeWidth="1" />
          <path d="M26 30 C27.4 35 28.2 40 28.4 45.6 C26 47.4 23.4 48.6 20.6 49.2 C20.2 43 20.2 36 20.8 30.2 C22.6 29.6 24.4 29.6 26 30 Z" fill="#2C3038" />
          <path d={SHELL} fill={shell} />
          <g clipPath={`url(#${clip})`}>
            {/* Cel shading: shadow under the jaw line and down the back, light band across the dome */}
            <path d="M24 34 C34 39 46 38 64 30 L64 64 L20 64 Z" fill="#000" opacity="0.2" />
            <path d="M50 8 C56 14 60 22 60 30 L64 30 L64 0 Z" fill="#000" opacity="0.16" />
            <path d="M18 15.6 C24 9 33 6.6 42 7.4 C34 8.6 26.4 12 21.8 17.4 Z" fill="#fff" opacity="0.38" />
            <path d="M44.6 8.6 C48.6 9.8 51.6 12 53.8 14.6" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="1" />
            {/* Sculpt lines */}
            <path d="M36.6 44.6 C43 43.4 51 41.8 57.8 39.6" fill="none" stroke="#000" strokeOpacity="0.3" strokeWidth="0.9" />
            <path d="M36.8 45.6 C43 44.4 51 42.8 57.6 40.6" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="0.6" />
            <path d="M31 30 C35 27.6 41 27 46 28.4" fill="none" stroke="#000" strokeOpacity="0.22" strokeWidth="0.8" />
          </g>
          {/* Vents and cutouts */}
          <g fill={line}>
            <path d="M32.6 9.2 C35.8 8.4 39.4 8.6 42.6 9.8 L42 11.6 C39 10.6 35.8 10.4 33 11.2 Z" />
            <path d="M47.8 13.2 C49.8 14.4 51.4 16.6 52.4 19.4 L50.6 20.8 C49.8 18.4 48.4 16.4 46.8 15.2 Z" />
            <path d="M21.4 17.4 C23 16.8 25 16.8 26.8 17.4 L26 19.2 C24.6 18.8 23.2 18.8 21.8 19.2 Z" />
            <path d="M35.4 33.4 C38.6 32.4 42 32.2 45.2 33 L44.2 36.6 C41.4 36 38.6 36.2 36 37 Z" />
          </g>
          {/* Back bumper */}
          <path d="M55.4 39.4 L58.6 37.6 C59.2 40.8 58.6 44 57 46.6 L52.4 47.8 C53.4 45 54.4 42.2 55.4 39.4 Z" fill="#2E3139" stroke={line} strokeWidth="1" />
          <path d={SHELL} fill="none" stroke={line} strokeWidth="1.6" />
          <circle cx="32.2" cy="43.4" r="1" fill={line} />

          {/* Chin strap */}
          <path d="M18.6 52 C26 49 36 44.6 46.4 40" fill="none" stroke={line} strokeWidth="2.8" />
          <path d="M18.6 52 C26 49 36 44.6 46.4 40" fill="none" stroke="#3F434C" strokeWidth="1.4" />
          <rect x="35.4" y="43.2" width="5.6" height="3.2" rx="1" fill="#555A64" stroke={line} strokeWidth="0.8" transform="rotate(-22 38.2 44.8)" />

          {/* Facemask: outline pass, color pass, glint */}
          <g fill="none">
            <g stroke={line} strokeWidth="3.4">{MASK.map((d) => <path key={d} d={d} />)}</g>
            <g stroke={mask} strokeWidth="1.9">{MASK.map((d) => <path key={d} d={d} />)}</g>
            <g stroke="#fff" strokeOpacity="0.3" strokeWidth="0.55" transform="translate(0.2 -0.45)">{MASK.map((d) => <path key={d} d={d} />)}</g>
          </g>
          {/* Chin cup */}
          <path d="M14.6 50.4 C17.4 49.2 20.4 49.6 21.6 51.8 C22.4 54 20.6 56 17.6 56.2 C15 56.4 13.4 54.6 13.6 52.6 Z" fill="#3A3E47" stroke={line} strokeWidth="1" />
          {/* Mask clips */}
          <g stroke={line} strokeWidth="0.9" fill="#8A909A">
            <rect x="26" y="27.4" width="6" height="4" rx="1.3" transform="rotate(-20 29 29.4)" />
            <rect x="22.8" y="43.6" width="6" height="4" rx="1.3" transform="rotate(16 25.8 45.6)" />
          </g>
          <circle cx="29" cy="29.4" r="0.9" fill={line} />
          <circle cx="25.8" cy="45.6" r="0.9" fill={line} />
        </g>
        {/* Side decal: team abbreviation in block letters (kept outside the mirror so it reads correctly) */}
        <text x="22.6" y="25.4" textAnchor="middle" fontSize={team.length > 2 ? 8.4 : 9.6} fontWeight="900" fontFamily="'Geist', ui-sans-serif, system-ui, sans-serif"
          letterSpacing="-0.3" fill={decal} stroke={decalEdge} strokeWidth="1.5" paintOrder="stroke" transform="rotate(-6 22.6 22)">{team}</text>
      </svg>
    </span>
  );
}
// Left-facing outline: brow overhang at the front, high crown, flared back, jaw sweeping down to the chin
const SHELL = "M16 21 C16.4 16.6 18.6 12.6 22.4 9.8 C27.6 6 34.4 4.8 41 5.6 C48.4 6.6 54.6 11 57.6 17.8 C59.6 22.4 59.4 27.6 58.6 32 L57.4 38 C56.6 41.6 55.6 44.4 54.6 46.6 C51 47.8 47.6 48.4 44.8 48.6 C41.4 49.2 37.8 50.4 34.4 51.4 C33 50.8 32.4 49.6 32 48 L30.4 41.6 C29.6 37.4 28.4 31.4 26.6 26.6 C24.4 24.2 21.4 23.2 18.4 23.2 C17 23.2 16.2 22.4 16 21 Z";
const MASK = [
  "M27 24.2 C21 23.6 14 23.6 9.4 24.2 C7 28.4 5.6 33.4 5.8 38.6 C6 42.4 6.6 45.6 7.4 48.2 C9.4 52.4 12.4 55.2 15.4 55.6",
  "M24.6 38.4 C18 38.2 11 38.2 5.8 38.6",
  "M24.4 42.6 C18 42.8 12 43 6.6 43.4",
  "M14.4 24 C14.2 33 14.4 43 15.2 52.6",
  "M19.4 23.8 C19.4 33 19.6 42 20.2 51.4",
  "M29 29.4 C26 27.8 22.6 26 19.4 24",
  "M25.8 45.6 C24.6 49 22.6 51.6 20 52.8",
];
