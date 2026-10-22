/** Motion with a purpose (Zach, Oct 22): things animate when you first arrive (a hard or soft refresh, or the first
 *  time you open a section this visit) or when something actually changed. Coming back to a page you've already seen
 *  this visit shows it settled. Everything here lives in memory, so a reload starts fresh. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { mo } from "./motion";

const seen = new Set<string>();
/** True the first time `key` is asked for this page load, false after. */
export function firstTime(key: string): boolean {
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}
export const wasSeen = (key: string) => seen.has(key);

/** First counts that started but haven't finished yet */
const pending = new Set<string>();
const reduce = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Counts a group of numbers up together and reports the shared eased progress, so bars tied to them grow at the
 * same rate and stop when the numbers stop. Runs from zero the first time `key` shows this visit, and from the old
 * values whenever the targets change by more than `min`. Otherwise it returns the targets as they are.
 * `ready` false (a loading skeleton) waits without spending the key.
 */
export function useCountTogether(key: string | undefined, targets: number[], { ready = true, ms = 1100, min = 0.05 } = {}) {
  const [vals, setVals] = useState<number[]>(() => targets);
  const [running, setRunning] = useState(false);
  const shown = useRef<number[]>(targets);
  const raf = useRef(0);
  const sig = targets.map((x) => x.toFixed(2)).join("|");

  useEffect(() => {
    if (!key || !ready) { cancelAnimationFrame(raf.current); shown.current = targets; setVals(targets); setRunning(false); return; }
    // A first count that hasn't finished (the card remounted while data settled) starts over instead of being lost
    const first = pending.has(key) || firstTime(key);
    if (first) pending.add(key);
    const changed = !first && targets.some((t, i) => Math.abs(t - (shown.current[i] ?? t)) > min);
    if ((!first && !changed) || reduce()) { shown.current = targets; setVals(targets); setRunning(false); return; }
    const from = first ? targets.map(() => 0) : shown.current.slice();
    const dur = first ? mo(ms) : mo(ms * 0.6);
    const t0 = performance.now();
    setRunning(true);
    const step = (now: number) => {
      const e = easeOut(Math.min(1, (now - t0) / dur));
      const next = targets.map((t, i) => from[i] + (t - from[i]) * e);
      shown.current = next; setVals(next);
      if (e < 1) raf.current = requestAnimationFrame(step); else { shown.current = targets; setVals(targets); setRunning(false); pending.delete(key); }
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [key, ready, sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return { vals, running };
}

/** Last value each state key had this visit, so a remount (switching tabs and back) doesn't count as a change */
const lastState = new Map<string, boolean>();
/**
 * True for the render where a state is newly reached: `on` turned true after being false this visit, or it is true
 * the first time `key` shows (first arrival). A remount of something that was already true stays false, so a check
 * that was already there never replays. Pair it with a class that runs a one-shot CSS animation.
 */
export function useArrived(key: string, on: boolean): boolean {
  const [play, setPlay] = useState(false);
  useLayoutEffect(() => {
    const was = lastState.get(key);
    lastState.set(key, on);
    if (!on) { setPlay(false); return; }
    if (was !== true) setPlay(true);
  }, [key, on]);
  return play;
}
