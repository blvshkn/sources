import { useId } from "react";
import { Player } from "../data";
import { jerseyNumber, teamColors, useJerseys } from "../jersey";

/** A team-colored jersey with the player's real number. Team palette only, no logos. */
export function Jersey({ p, size = 36, ring }: { p: Pick<Player, "id" | "name" | "nfl">; size?: number; ring?: "warn" | "bad" }) {
  useJerseys();
  const uid = useId().replace(/:/g, "");
  const [body, ink, trim] = teamColors(p.nfl);
  const num = jerseyNumber(p);
  const label = num !== undefined ? String(num) : "";
  const fs = label.length > 1 ? 21 : 24;
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
