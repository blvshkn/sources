/** New since you looked (approved Oct 22, motion-picks.html "New since you looked"): when a sync brings something new
 *  into a spot you've already seen (a new top trade idea, an offer that went through), it slides in at the top with a
 *  faint ink tint that fades, and keeps a small dot until you open it. What was there the first time you saw the spot
 *  this visit sits still, and so does anything you've opened. In memory only, like motionOnce: a reload starts fresh. */
import { useState } from "react";

/** What each spot showed last, by spot name */
const last = new Map<string, string | null>();
/** When each new item arrived (performance.now()), by spot and item; removed once you open it */
const unopened = new Map<string, number>();
const reduce = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * `spot` names the place ("radar-trade"); `item` names what's in it now (null when it's empty). Returns whether to play
 * the slide in (only right after it arrived, so a remount a moment later still plays and a later one doesn't), whether
 * the dot shows, and `open` to call when it's opened.
 */
export function useNewSince(spot: string, item: string | null): { slide: boolean; dot: boolean; open: () => void } {
  const [, bump] = useState(0);
  if (!last.has(spot)) last.set(spot, item);
  else if (last.get(spot) !== item) {
    last.set(spot, item);
    if (item !== null) unopened.set(`${spot}|${item}`, performance.now());
  }
  const k = `${spot}|${item}`;
  const at = item === null ? undefined : unopened.get(k);
  return {
    slide: at !== undefined && !reduce() && performance.now() - at < 2000,
    dot: at !== undefined,
    open: () => { if (unopened.delete(k)) bump((n) => n + 1); },
  };
}
