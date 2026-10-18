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

/** Team defense: a studio-lit side-view helmet in the team palette. No logos. */
export function Helmet({ team, size = 36, ring }: { team: string; size?: number; ring?: "warn" | "bad" }) {
  const uid = useId().replace(/:/g, "");
  const [shell, ink, trim] = teamColors(team);
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  // Facemask in the most contrasting team color, else steel. Stripe in ink with trim borders.
  const mask = Math.abs(lum(trim) - lum(shell)) > 0.2 ? trim : Math.abs(lum(ink) - lum(shell)) > 0.2 ? ink : "#C3C8D0";
  const stripe = ink === shell || Math.abs(lum(ink) - lum(shell)) < 0.12 ? trim : ink;
  const id = (k: string) => `${k}${uid}`;
  return (
    <span className={`jersey helmet${ring ? ` ring-${ring}` : ""}`} style={{ width: size, height: size }} role="img" aria-label={`${team} defense helmet`}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <defs>
          <clipPath id={id("c")}><path d={SHELL} /></clipPath>
          <linearGradient id={id("tone")} x1="0" y1="0" x2="0.15" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
            <stop offset="0.42" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.78" stopColor="#000" stopOpacity="0.18" />
            <stop offset="1" stopColor="#000" stopOpacity="0.42" />
          </linearGradient>
          <radialGradient id={id("spec")} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={id("ground")} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#000" stopOpacity="0.45" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={id("ear")} cx="0.4" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
            <stop offset="1" stopColor="#000" stopOpacity="0.3" />
          </radialGradient>
        </defs>

        {/* Contact shadow */}
        <ellipse cx="35" cy="56" rx="22" ry="3" fill={`url(#${id("ground")})`} />

        {/* Shell */}
        <path d={SHELL} fill={shell} />
        <g clipPath={`url(#${id("c")})`}>
          {/* Center stripe: trim borders around an ink core */}
          <path d={STRIPE} fill="none" stroke={trim} strokeWidth="5.4" strokeLinecap="round" />
          <path d={STRIPE} fill="none" stroke={stripe} strokeWidth="2.5" strokeLinecap="round" />
          {/* Studio lighting: key from upper left, falloff underneath */}
          <path d={SHELL} fill={`url(#${id("tone")})`} />
          <ellipse cx="23" cy="15" rx="10" ry="5" transform="rotate(-28 23 15)" fill={`url(#${id("spec")})`} />
          <ellipse cx="44" cy="11" rx="3.6" ry="1.4" transform="rotate(20 44 11)" fill="#fff" opacity="0.35" />
          {/* Jaw panel seam and bottom padding rim */}
          <path d="M40 22 C41.2 30 41.4 38 39.6 49.4" fill="none" stroke="#000" strokeOpacity="0.25" strokeWidth="0.9" />
          <path d="M14 46 C20.4 49.6 31 50.6 40 49.8 L47.4 49.2" fill="none" stroke="#000" strokeOpacity="0.5" strokeWidth="2.8" />
          {/* Rim light along the back edge */}
          <path d="M13 44 C8.6 37 8 28 10.6 21.4" fill="none" stroke="#fff" strokeOpacity="0.32" strokeWidth="1.1" strokeLinecap="round" />
        </g>
        <path d={SHELL} fill="none" stroke="#000" strokeOpacity="0.38" strokeWidth="0.8" />

        {/* Ear plate */}
        <ellipse cx="30" cy="31" rx="4.8" ry="4.3" fill={shell} />
        <ellipse cx="30" cy="31" rx="4.8" ry="4.3" fill={`url(#${id("ear")})`} stroke="#000" strokeOpacity="0.3" strokeWidth="0.6" />
        <circle cx="30" cy="31" r="1.2" fill="#05070A" />
        <circle cx="27.9" cy="32.5" r="0.7" fill="#05070A" />
        <circle cx="32.1" cy="32.5" r="0.7" fill="#05070A" />

        {/* Chin strap tucked along the jaw, cup under the mask */}
        <path d="M33.6 35 C36.5 40.5 40.5 45.5 46 49" fill="none" stroke="#E8EBF0" strokeOpacity="0.85" strokeWidth="1.3" strokeLinecap="round" />
        <rect x="45" y="47.6" width="6.6" height="3.8" rx="1.9" fill="#E8EBF0" transform="rotate(-12 48.3 49.5)" />
        {/* Facemask: shadow pass, color pass, highlight pass */}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <g stroke="#000" strokeOpacity="0.4" strokeWidth="3.4" transform="translate(0.5 0.8)">{MASK.map((d) => <path key={d} d={d} />)}</g>
          <g stroke={mask} strokeWidth="2.5">{MASK.map((d) => <path key={d} d={d} />)}</g>
          <g stroke="#fff" strokeOpacity="0.45" strokeWidth="0.7" transform="translate(-0.3 -0.55)">{MASK.map((d) => <path key={d} d={d} />)}</g>
        </g>
        {/* Clips where the cage meets the shell */}
        <circle cx="51.4" cy="25.8" r="1.25" fill="#1A1D23" />
        <circle cx="50.8" cy="46.6" r="1.25" fill="#1A1D23" />
      </svg>
    </span>
  );
}
const SHELL = "M14 46 C9 40 7.5 30 10 22 C13 13 22 6.5 33 6 C43 5.6 51 9.6 55 17 C56.6 20 57.4 23 56.8 25.2 L51 25.6 C48.8 25.8 47.4 27.6 47.6 30 L48.2 35.6 C51 38 52.6 41.6 52 45.2 C51.6 47.6 49.8 49 47.4 49.2 L40 49.8 C31 50.6 20.4 49.6 14 46 Z";
const STRIPE = "M12.4 35 C11.6 21 21.6 9.8 33 9.6 C43 9.4 50.4 13.6 54 20.8";
const MASK = [
  "M51.4 25.8 C56 25 60.4 27 61.6 31.6 C62.8 37 62 43 59.6 46.6 C57.8 49.4 54.6 50.4 50.8 46.6",
  "M48.4 32 C53 31.6 57.8 32 62.4 33.4",
  "M50.8 39.6 C54.6 39.6 58.4 40 62 40.8",
  "M56.6 25.6 C56 33 56.2 41 56.4 49.6",
]
