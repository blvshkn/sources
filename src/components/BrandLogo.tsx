/** The Sources logo from Zach's updated Figma ("Logo / Mark", "Logo / Wordmark", "Logo"): the two-lane mark, the
 *  uppercase wordmark set as live text in Clash Grotesk Medium (loaded by src/fonts.ts, Geist until it arrives),
 *  and the mono tagline. Static: nothing here animates.
 *  - stack: mark over wordmark over tagline, centered (the loading screen: mark 88, wordmark 40, tagline 13).
 *  - row: mark beside the wordmark, the tagline under the wordmark, left-aligned (Figma's "Logo": mark 56, 4px,
 *    wordmark 24, 2px, tagline 13; the sidebar and phone header use it scaled).
 *  Colors come from --brand-mark, --brand-word and --brand-tag so each surface (and the light theme) can set them. */
import type { CSSProperties } from "react";
import { Mark } from "./Logo";

/** The wordmark text, for places that draw it themselves (the share image's canvas). */
export const WORDMARK = "SOURCES";
export const TAGLINE = "Your fantasy insider";
/** The wordmark's font stack and weight, shared with the canvas so both draw the same letters. */
export const WORD_FONT = `"Clash Grotesk", Geist, system-ui, sans-serif`;
export const WORD_WEIGHT = 500;

export function BrandWordmark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return <span className={`bl-word ${className}`.trim()} style={{ fontSize: size }} aria-hidden="true">{WORDMARK}</span>;
}

export function BrandLogo({ layout = "stack", mark = 88, word = 40, tagline = false, tag = 13, label = "Sources", className = "" }: {
  layout?: "stack" | "row";
  /** Mark size in px (the square it's drawn in, as in Figma) */
  mark?: number;
  /** Wordmark font size in px. Its line box is the same height (Figma: 100% line height). */
  word?: number;
  /** The uppercase mono tagline under the wordmark */
  tagline?: boolean;
  /** Tagline font size in px */
  tag?: number;
  label?: string;
  className?: string;
}) {
  // Figma's spacing scales with the lockup: in a row, 4px after a 56px mark and 2px between the lines
  const gaps = layout === "row"
    ? { ["--bl-gap" as string]: `${+(mark * 4 / 56).toFixed(2)}px`, ["--bl-line" as string]: `${+(mark * 2 / 56).toFixed(2)}px` }
    : undefined;
  return (
    <span className={`bl bl-${layout} ${className}`.trim()} style={gaps as CSSProperties | undefined} role="img" aria-label={label}>
      <Mark size={mark} className="bl-mark" />
      <span className="bl-type" aria-hidden="true">
        <BrandWordmark size={word} />
        {tagline && <span className="bl-tag" style={tag !== 13 ? { fontSize: tag } : undefined}>{TAGLINE}</span>}
      </span>
    </span>
  );
}
