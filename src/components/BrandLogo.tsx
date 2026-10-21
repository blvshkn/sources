/** The Sources logo from Zach's updated Figma ("Logo / Mark", "Logo / Wordmark"): the two-lane mark, the uppercase
 *  wordmark set as live text in Clash Grotesk Medium (loaded by src/fonts.ts, Geist until it arrives), and the mono
 *  tagline. Static: nothing here animates. Stacked (mark over wordmark over tagline) like the loading screen, or in
 *  a row (mark beside the wordmark). Sizes are in px; the Figma stack is mark 88, wordmark 40, tagline 13.
 *  Colors come from --brand-mark, --brand-word and --brand-tag so each surface (and the light theme) can set them. */
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

export function BrandLogo({ layout = "stack", mark = 88, word = 40, tagline = false, label = "Sources", className = "" }: {
  layout?: "stack" | "row";
  /** Mark size in px (the square it's drawn in, as in Figma) */
  mark?: number;
  /** Wordmark font size in px. Its line box is the same height (Figma: 100% line height). */
  word?: number;
  /** The uppercase mono tagline under the wordmark */
  tagline?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <span className={`bl bl-${layout} ${className}`.trim()} role="img" aria-label={label}>
      <Mark size={mark} className="bl-mark" />
      <span className="bl-type" aria-hidden="true">
        <BrandWordmark size={word} />
        {tagline && <span className="bl-tag">{TAGLINE}</span>}
      </span>
    </span>
  );
}
