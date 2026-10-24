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

/**
 * iPhone, take two (Zach, Oct 23: no haptics in Safari). Apple closed the hidden-switch trick in iOS 26.5: a switch
 * flipped by script no longer ticks. A switch the person's own finger flips still does, so the controls that should
 * answer a tap carry an invisible native switch laid over them (the ios-haptics approach). The tap lands on the switch,
 * iOS plays its tick, and the click carries on to the control underneath as usual. Only where there's no vibrate (iOS)
 * and the screen is touch. Submit buttons are left out: a tap on the switch wouldn't submit their form.
 */
const ARM = [
  ".tabbar button", ".page-tabs .seg button", ".st-tabs .seg button", ".seg button[aria-pressed]",
  ".snooze-btn", ".brief-snooze", ".ph-cta", ".ph-watch", ".btn-primary:not([type='submit'])", ".ask-chip", ".ibx-pills > button",
].join(", ");
function arm(el: HTMLElement) {
  if (el.querySelector(":scope > input.hx") || (el as HTMLButtonElement).type === "submit") return;
  const s = document.createElement("input");
  s.type = "checkbox"; s.setAttribute("switch", ""); s.className = "hx"; s.tabIndex = -1; s.setAttribute("aria-hidden", "true");
  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  el.appendChild(s);
}
export function hapticSurfaces() {
  if (typeof window === "undefined" || typeof navigator.vibrate === "function" || !coarse()) return;
  // The switch's own tick counts as this tap's haptic, so a handler's haptic() right after doesn't play a second one
  document.addEventListener("click", (e) => { if ((e.target as Element | null)?.classList?.contains("hx")) last = Date.now(); }, true);
  let queued = false;
  const sweep = () => { queued = false; document.querySelectorAll<HTMLElement>(ARM).forEach(arm); };
  sweep();
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(sweep); } })
    .observe(document.body, { childList: true, subtree: true });
}

/** Buzzes once each time an error message appears (empty or null means no error) */
export function useErrorHaptic(error: unknown) {
  useEffect(() => { if (error) haptic("error"); }, [error]);
}
