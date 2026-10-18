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

/** Team defense: a speed-style helmet in a bold cel-shaded illustration style, facing right.
    Drawn on an 800-unit grid (left-facing, then mirrored). Team palette plus the team's
    abbreviation where a player number would sit. No logos. */
export function Helmet({ team, size = 36, ring }: { team: string; size?: number; ring?: "warn" | "bad" }) {
  const uid = useId().replace(/:/g, "");
  const [shell, ink] = teamColors(team);
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const light = lum(shell) > 0.6;
  const decal = light ? (lum(ink) < 0.5 ? ink : "#14161A") : "#FFFFFF";
  const K = "#111216"; // outline ink
  const clip = `hc${uid}`;
  const bars = (w: number, c: string, o = 1) => <g fill="none" stroke={c} strokeWidth={w} strokeOpacity={o}>{MASK.map((d) => <path key={d} d={d} />)}</g>;
  return (
    <span className={`jersey helmet${ring ? ` ring-${ring}` : ""}`} style={{ width: size, height: size }} role="img" aria-label={`${team} defense helmet`}>
      <svg viewBox="40 40 720 720" width={size} height={size} aria-hidden="true" strokeLinejoin="round" strokeLinecap="round">
        <defs><clipPath id={clip}><path d={SHELL} /></clipPath></defs>
        <g transform="matrix(-1 0 0 1 800 0)">

          {/* Shell: base, light upper zone, shadowed lower zone, highlights */}
          <path d={SHELL} fill={shell} />
          <g clipPath={`url(#${clip})`}>
            <path d="M160 40 L780 40 L780 300 C700 318 620 332 520 324 C420 316 330 302 250 274 L160 250 Z" fill="#fff" opacity="0.16" />
            <path d="M240 560 C400 610 610 540 780 430 L780 780 L240 780 Z" fill="#000" opacity="0.22" />
            <path d="M690 200 C725 260 740 330 735 420 L780 420 L780 160 Z" fill="#000" opacity="0.14" />
            <path d="M232 182 C300 118 420 92 528 100 C430 112 332 140 272 196 Z" fill="#fff" opacity="0.5" />
            <path d="M600 128 C640 150 670 180 690 214" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="12" />
            <path d="M236 262 C250 300 262 340 270 380" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="8" />
            {/* Sculpt ridges */}
            <g fill="none" stroke={K} strokeOpacity="0.4" strokeWidth="6">
              <path d="M252 274 C330 302 430 314 520 322 C600 330 680 318 736 300" />
              <path d="M606 386 C650 372 690 360 728 352" />
              <path d="M300 420 C340 440 380 452 420 458" />
            </g>
            <g fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="4">
              <path d="M254 284 C332 312 430 324 520 332 C600 340 680 328 736 310" />
            </g>
          </g>

          {/* Vents and cutouts */}
          <g fill={K}>
            <path d="M405 118 C440 108 482 110 514 122 L508 134 C476 124 440 122 410 130 Z" />
            <path d="M262 232 C292 224 334 228 374 240 L332 254 C306 250 286 252 270 260 Z" />
            <path d="M596 172 C624 190 646 216 656 250 L640 254 C630 224 612 202 588 186 Z" />
            <path d="M684 362 L722 350 L720 374 L688 384 Z" />
            <path d="M226 205 C238 190 252 178 268 170 L262 188 C250 196 240 206 232 218 Z" />
            <path d="M424 462 C460 440 512 434 552 440 L530 472 C500 470 470 478 446 494 Z" />
          </g>
          <path d="M446 494 C470 478 500 470 530 472 L548 490 C512 488 480 496 456 510 Z" fill="#fff" opacity="0.28" />
          <circle cx="404" cy="540" r="17" fill={K} />

          {/* Back bumper */}
          <path d="M560 572 L706 500 C714 540 708 570 692 586 L582 590 C568 590 560 584 560 572 Z" fill="#3A3D45" stroke={K} strokeWidth="8" />
          <path d="M580 572 L700 516" stroke="#fff" strokeOpacity="0.18" strokeWidth="6" />

          <path d={SHELL} fill="none" stroke={K} strokeWidth="10" />

          {/* Upper strap tab */}
          <rect x="430" y="316" width="62" height="28" rx="8" fill="#555A63" stroke={K} strokeWidth="7" transform="rotate(-32 461 330)" />

          {/* Chin strap with buckle */}
          <path d="M272 662 C380 610 480 556 576 506" fill="none" stroke={K} strokeWidth="30" />
          <path d="M272 662 C380 610 480 556 576 506" fill="none" stroke="#3B3F47" strokeWidth="16" />
          <rect x="458" y="532" width="74" height="36" rx="8" fill="#5A5F69" stroke={K} strokeWidth="7" transform="rotate(-27 495 550)" />
          <circle cx="576" cy="506" r="14" fill="#6A707A" stroke={K} strokeWidth="6" />

          {/* Facemask: black outline, gunmetal bars, glint */}
          {bars(32, K)}
          {bars(18, "#4A4F58")}
          <g transform="translate(-2 -5)">{bars(5, "#fff", 0.3)}</g>

          {/* Chin cup */}
          <ellipse cx="240" cy="680" rx="46" ry="34" transform="rotate(-14 240 680)" fill="#2C2F36" stroke={K} strokeWidth="8" />
          <path d="M212 668 C230 660 252 658 270 664" fill="none" stroke="#fff" strokeOpacity="0.2" strokeWidth="5" />

          {/* Quick-release clips */}
          <g stroke={K} strokeWidth="7">
            <rect x="327" y="345" width="72" height="46" rx="12" fill="#8E949E" transform="rotate(-25 363 368)" />
            <rect x="288" y="549" width="70" height="46" rx="12" fill="#8E949E" transform="rotate(20 323 572)" />
          </g>
          <circle cx="363" cy="368" r="11" fill="#2A2D33" />
          <circle cx="323" cy="572" r="11" fill="#2A2D33" />
        </g>

        {/* Side decal where the number sits (outside the mirror so it reads correctly) */}
        <text x="290" y="300" textAnchor="middle" fontSize={team.length > 2 ? 104 : 128} fontWeight="900" fontFamily="'Geist', ui-sans-serif, system-ui, sans-serif"
          letterSpacing="-4" fill={decal} stroke={K} strokeWidth="16" paintOrder="stroke" transform="rotate(4 290 262)">{team}</text>
      </svg>
    </span>
  );
}
// 800-grid, left-facing: brow at the front, crown, flared back, jaw sweeping down to the face opening
const SHELL = "M200 212 C215 160 270 110 340 92 C430 70 560 80 640 140 C700 185 735 250 738 330 C740 390 735 430 722 455 L706 500 L560 572 C520 590 480 612 455 628 C420 645 360 648 320 640 C295 635 275 618 268 595 L262 540 C268 480 290 420 300 380 C304 340 290 310 262 290 C240 275 215 262 205 245 C198 235 197 222 200 212 Z";
const MASK = [
  "M356 370 C326 334 300 320 250 316 C200 312 150 306 118 302",
  "M118 302 C124 318 160 330 192 336",
  "M192 336 C186 400 178 450 168 520 C176 570 190 620 206 652",
  "M270 330 C264 400 258 450 248 520 C246 560 244 600 240 642",
  "M330 488 C250 486 160 484 76 482",
  "M300 526 C230 524 150 522 82 520",
  "M76 482 C76 520 84 570 100 620 C110 650 128 672 150 682 C170 690 192 692 212 690",
  "M326 602 C290 612 250 624 210 636 C180 645 158 652 140 656",
];
