// Motion's spring engine for the bottom sheets. It loads in its own chunk (sheetDrag.ts imports it on first use and
// preloadOverlays fetches it when the app is idle), so the first paint never parses it.
import { animate } from "motion/react";

export interface SpringRun { stop: () => void }

/**
 * Spring a sheet's offset from `from` to `to`, carrying the finger's release velocity (px/s). Apple's terms:
 * `ratio` is the damping ratio (1 is critically damped, no bounce) and `response` is roughly how long it takes, in
 * seconds. Every frame goes through `onUpdate`, which writes a full translate3d, so it stays on the compositor and a
 * new touch can stop it anywhere and take over from the exact spot on screen.
 */
export function spring(from: number, to: number, velocity: number, ratio: number, response: number,
  onUpdate: (y: number) => void, onComplete?: () => void): SpringRun {
  const stiffness = (2 * Math.PI / response) ** 2;
  const damping = (4 * Math.PI * ratio) / response;
  const run = animate(from, to, {
    type: "spring", stiffness, damping, mass: 1, velocity,
    restDelta: 0.5, restSpeed: 4,
    onUpdate, onComplete,
  });
  return { stop: () => run.stop() };
}
