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

/** Team defense: a side-view helmet with facemask in the team palette. No logos. */
export function Helmet({ team, size = 36, ring }: { team: string; size?: number; ring?: "warn" | "bad" }) {
  const uid = useId().replace(/:/g, "");
  const [shell, ink, trim] = teamColors(team);
  // Facemask reads best in a contrasting team color; fall back to a steel gray
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const mask = Math.abs(lum(trim) - lum(shell)) > 0.18 ? trim : Math.abs(lum(ink) - lum(shell)) > 0.18 ? ink : "#BFC5CE";
  return (
    <span className={`jersey helmet${ring ? ` ring-${ring}` : ""}`} style={{ width: size, height: size }} role="img" aria-label={`${team} defense helmet`}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <defs>
          <radialGradient id={`hs${uid}`} cx="0.38" cy="0.28" r="0.75">
            <stop offset="0" stopColor="#fff" stopOpacity="0.42" />
            <stop offset="0.35" stopColor="#fff" stopOpacity="0.08" />
            <stop offset="1" stopColor="#000" stopOpacity="0.28" />
          </radialGradient>
          <clipPath id={`hc${uid}`}><path d={SHELL} /></clipPath>
        </defs>
        {/* Facemask behind the shell edge so the bars tuck in */}
        {/* Smoked visor in the face opening */}
        <path d="M46 30.5 C51 30 54.5 31.5 55 34.5 L55 38 C52 39 49 38.6 47.4 37.6 Z" fill="#0B0D12" opacity="0.85" />
        <path d="M47 31.4 C50.5 31.2 52.8 32 53.6 33.4" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.9" strokeLinecap="round" />
        <g fill="none" stroke={mask} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M45 30 C55 28.6 61.6 32.6 61.6 40 C61.6 46 58.6 50 52 50.6 L45.6 49.6" />
          <path d="M47 37 C52 36.3 57 36.5 61.4 37.6" />
          <path d="M48 43.3 C52.5 43.5 57 43.7 60.6 44.7" />
          <path d="M54.2 29.6 C53.6 37 53.8 44 53.5 50.6" />
        </g>
        <path d={SHELL} fill={shell} />
        <g clipPath={`url(#hc${uid})`}>
          {/* Center stripe: team ink with trim pinstripes */}
          <path d="M10 33 C11 19 23 10.5 36 10.5 C47 10.5 55 17 57.6 26" fill="none" stroke={trim} strokeWidth="6.4" />
          <path d="M10 33 C11 19 23 10.5 36 10.5 C47 10.5 55 17 57.6 26" fill="none" stroke={ink === shell ? trim : ink} strokeWidth="2.4" />
          <path d={SHELL} fill={`url(#hs${uid})`} />
        </g>
        {/* Ear hole, jaw pad and chin strap */}
        <circle cx="31" cy="35" r="4" fill="rgba(0,0,0,0.18)" />
        <circle cx="31" cy="35" r="2.6" fill="rgba(0,0,0,0.6)" />
        <path d="M36 44 C40 46.5 44 47.5 47 47" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="3" strokeLinecap="round" />
        <path d="M24 47.5 C30 51 38 51.5 45 49.5" fill="none" stroke="#E9ECF1" strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />
        <path d={SHELL} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
        {/* Front bumper where the mask clips on */}
        <path d="M44.5 29.5 C46.5 29 48 29.4 48.6 30.6" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}
const SHELL = "M9.5 40 C6.5 26 13 11.5 30 8.5 C44.5 6 56.5 13.5 58.5 26.5 C58.8 28.4 57.6 29.6 55.8 29.6 L49 29.6 C46.6 29.6 45.4 31.4 46 33.6 L48.2 42.5 C48.8 45 47.6 47 45 47.6 C36 49.6 26 50.6 18.5 48.8 C13.8 47.6 10.6 44.6 9.5 40 Z";
