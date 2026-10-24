/**
 * Haptics, used sparingly (Zach, Oct 23): a touch confirms what the eye already sees, never decoration.
 *
 *   tap   one light tick: a choice that took (passed, snoozed, saved, sent, a refresh let go)
 *   deny  two quick ticks: something that can't be done right now (deny.ts)
 *   done  a tick, then a firmer one: a job that finished (a refresh landed, the optimal lineup is ready)
 *   error three quick ticks: something went wrong (a username not found, Sleeper unreachable, a refresh that failed)
 *
 * Android uses navigator.vibrate. iOS Safari has no vibrate, but flipping a native switch input (iOS 18 and later)
 * plays the system's selection tick, so a hidden one is flipped once per tick. Browsers only allow either during or
 * just after a tap, so calls far from a gesture fall silent, which is the right failure. Calls closer than 150ms apart
 * collapse into the first, so stacked handlers never buzz twice.
 */
import { useEffect } from "react";

export type Haptic = "tap" | "deny" | "done" | "error";

const PATTERN: Record<Haptic, number | number[]> = { tap: 8, deny: [12, 60, 12], done: [8, 70, 16], error: [12, 50, 12, 50, 12] };
const TICKS: Record<Haptic, number[]> = { tap: [0], deny: [0, 80], done: [0, 110], error: [0, 70, 140] };

let last = 0;
const coarse = () => { try { return matchMedia("(pointer: coarse)").matches; } catch { return false; } };

function iosTick() {
  const label = document.createElement("label");
  label.ariaHidden = "true";
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.appendChild(input);
  document.body.appendChild(label);
  label.click();
  label.remove();
}

export function haptic(kind: Haptic = "tap") {
  if (typeof navigator === "undefined" || !coarse()) return;
  const now = Date.now();
  if (now - last < 150) return;
  last = now;
  try {
    if (typeof navigator.vibrate === "function") { navigator.vibrate(PATTERN[kind]); return; }
    TICKS[kind].forEach((ms) => (ms ? window.setTimeout(iosTick, ms) : iosTick()));
  } catch { /* unsupported: the visual feedback carries it */ }
}

/** Buzzes once each time an error message appears (empty or null means no error) */
export function useErrorHaptic(error: unknown) {
  useEffect(() => { if (error) haptic("error"); }, [error]);
}
