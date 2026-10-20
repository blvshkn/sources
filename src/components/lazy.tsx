// Sheets and overlays that only open on a tap: the pitch sheet (with the share card), the player sheet (with its
// depth and usage detail), the league switcher and first-run setup. They load in their own chunks so the first paint
// doesn't parse them, and preloadOverlays() fetches every one of them once the app is idle after its first render, so
// by the time anyone taps they're already here. Until a chunk has arrived the overlay renders nothing (no spinner,
// no placeholder), then opens exactly as it always has.
import { Suspense, lazy, type ComponentProps, type ComponentType } from "react";

const loaders = {
  pitch: () => import("./PitchSheet"),
  player: () => import("./PlayerSheet"),
  switcher: () => import("./LeagueSwitcher"),
  firstRun: () => import("./FirstRun"),
};

/** A named export as a lazy component with its own invisible Suspense boundary. */
function lazyNamed<M, K extends keyof M>(load: () => Promise<M>, key: K) {
  type C = M[K] extends ComponentType<infer P> ? ComponentType<P> : never;
  const L = lazy(() => load().then((m) => ({ default: m[key] as unknown as ComponentType<object> })));
  return function Lazy(props: ComponentProps<C>) {
    return <Suspense fallback={null}><L {...(props as object)} /></Suspense>;
  };
}

export const PitchSheet = lazyNamed(loaders.pitch, "PitchSheet");
export const PlayerSheet = lazyNamed(loaders.player, "PlayerSheet");
export const LeagueSwitcher = lazyNamed(loaders.switcher, "LeagueSwitcher");
export const FirstRun = lazyNamed(loaders.firstRun, "FirstRun");
/** The trade card as an image, for the landing page's sample card. */
export const drawCard = (...args: Parameters<typeof import("./PitchSheet").drawCard>) => loaders.pitch().then((m) => m.drawCard(...args));

let preloaded = false;
/** Fetch every overlay chunk in the background, once, when the browser is idle. */
export function preloadOverlays() {
  if (preloaded) return;
  preloaded = true;
  const run = () => { Object.values(loaders).forEach((load) => { load().catch(() => { preloaded = false; }); }); };
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 2000 }); else window.setTimeout(run, 1200);
}
