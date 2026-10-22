/** Script-side motion pace. MO matches --mo in src/motion-tokens.css: every scripted duration (Web Animations, sheet
 *  springs, close timers that wait for a CSS exit) goes through mo() so the whole app keeps one pace. */
export const MO = 1.75;
const reduce = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const mo = (ms: number) => (reduce() ? ms : Math.round(ms * MO));
/** The house ease-out, the same curve as --ease-out */
export const EASE_OUT = "cubic-bezier(0.33, 1, 0.68, 1)";
