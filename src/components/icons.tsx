import type React from "react";
// Source icon family: pixel icons (Zach, Oct 22). Each is the old Lucide-based line icon traced onto a 16 x 16 pixel
// grid, with touching pixels merged into one shape and their outer corners rounded (pixelIcons.ts, generated from the
// approved review sheet). The star is icons8's "pixel star" on its 25 grid; the Settings gear rests turned 60 degrees.
// Animated parts carry m1 to m4 classes (icon-motion.css).
import { AskIcon } from "./AskIcon";
import { AiMark } from "./WorkingLoader";
import { PX } from "./pixelIcons";

export type IconName =
  | "overview" | "headset" | "hatGlasses" | "league" | "trade" | "roster" | "check" | "x" | "lock" | "copy" | "msg" | "send" | "share" | "alert"
  | "waivers" | "ask" | "gear" | "mic" | "chev" | "group" | "app" | "plug" | "trash" | "spark" | "ai" | "clock" | "eye" | "helmet" | "pen"
  | "target" | "trophy" | "values" | "activity" | "tendencies" | "switch" | "plus" | "search" | "bell" | "bookmark"
  | "download" | "image" | "mail" | "star" | "shield"
  | "userPlus" | "table" | "listOrdered" | "columns2";

// Icons with a micro-animation (src/icon-motion.css). "nav" ones play when their tab becomes active and on hover inside
// the sidebar, tab bar or top bar. "any" ones are affordances that play on hover of whatever control holds them.
const MOTION: Partial<Record<IconName, "nav" | "any">> = {
  helmet: "nav", overview: "nav", league: "nav", trade: "nav", waivers: "nav", bell: "nav", ask: "nav", gear: "nav",
  search: "any", pen: "any", chev: "any",
};

export function Icon({ name, size = 20, active = false }: { name: IconName; size?: number; active?: boolean }) {
  // Ask, and the mark on anything Source writes, is the two chat bubbles with their own hover beat (AskIcon)
  if (name === "spark" || name === "ask") return <AskIcon size={size} active={active} />;
  // The 5 x 5 dot grid fills its box edge to edge, so it runs a touch smaller to sit even with the others
  if (name === "ai") return <AiMark size={Math.round(size * 0.82)} />;
  return <Glyph name={name} size={size} />;
}

/** A pixel icon: filled shapes on its own grid, in the text color, crisp at any size. */
/** Extra line weight for a pixel icon drawn large (Zach, Oct 22: "when the icons get bigger, increase the stroke"):
 *  a stroke in viewBox units traced over the 1px lines, none at 24px and under, rising to 0.5 (a 1.5px line) by 64px. */
export const pxWeight = (size: number) => Math.max(0, Math.min(0.5, (size - 24) / 80)).toFixed(3);

function Glyph({ name, size }: { name: IconName; size: number }) {
  const [box, html] = PX[name] ?? PX.x;
  return (
    <svg width={size} height={size} viewBox={box} fill="currentColor" aria-hidden="true" focusable="false"
      className={`ic px-ic ic-${name}${size > 24 ? " px-heavy" : ""}`} style={size > 24 ? ({ ["--px-sw" as string]: pxWeight(size) } as React.CSSProperties) : undefined}
      data-m={MOTION[name]} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

const PLAY_MS = 900;
/** Replays an icon's animation once, by setting data-play for the length of the longest animation. */
function play(svg: Element) {
  if (svg.hasAttribute("data-play")) return;
  svg.setAttribute("data-play", "");
  window.setTimeout(() => svg.removeAttribute("data-play"), PLAY_MS);
}
/** Reduced motion: a small opacity tick instead of any movement. */
const tick = (el: Element) => (el as HTMLElement).animate?.([{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });

/**
 * Hover plays (mouse only, never touch). Route-change plays are pure CSS on aria-current.
 * Reduced motion turns all of it off; the stylesheet does the same for the CSS side.
 */
export function iconMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const hover = window.matchMedia("(hover: hover) and (pointer: fine)");

  document.addEventListener("pointerover", (e) => {
    if (!hover.matches || e.pointerType !== "mouse") return;
    const control = (e.target as Element | null)?.closest?.("button, a, summary, label, [role='button'], [role='tab']");
    if (!control || control.getAttribute("aria-current") === "page") return;
    if (e.relatedTarget instanceof Node && control.contains(e.relatedTarget)) return;
    if (reduced.matches) { if (control.matches(".top-bell")) control.querySelectorAll("svg.ic-bell").forEach(tick); return; }
    // The inbox bell rings on hover wherever it sits (the desktop one lives on the page, not in the nav)
    const inNav = !!control.closest(".side, .tabbar, .topbar, .top-bell");
    control.querySelectorAll("svg.ic[data-m]").forEach((svg) => {
      if (inNav || svg.getAttribute("data-m") === "any") play(svg);
    });
  }, { passive: true });

  // A new inbox item swinging the bell and springing its dot is App's (data-ring, action-motion.css). Opening the
  // inbox is quiet, so clicks no longer ring it.
}

/** Every check in the app: the traced one-pixel check, in the text color. */
export function PixelCheck({ size = 16, className = "" }: { size?: number; className?: string }) {
  const [box, html] = PX.check;
  return <svg className={`ic px-ic ic-check px-check ${className}`.trim()} width={size} height={size} viewBox={box} fill="currentColor" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: html }} />;
}
