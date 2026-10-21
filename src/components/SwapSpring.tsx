// The Lineup swap menu's open and close, on Motion. Its own chunk: SwapAnchor (SwapPicker.tsx) loads it lazily and
// preloadOverlays fetches it once the app is idle.
import { useMemo, type ReactNode } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { SwapShell } from "./SwapPicker";

const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
// Critically damped (ratio 1), about 0.24s: k = (2π / 0.24)², c = 4π / 0.24
const OPEN = { type: "spring", stiffness: 685, damping: 52, mass: 1 } as const;

/**
 * Mounts the anchor while `show` is true and keeps it through the close. The menu grows out of its row: the
 * transform origin is the row's edge (top center below the row, bottom center when placeSwap flips it above, in
 * lineup-swap.css), so it scales from where it's attached. A full transform string keeps it on the compositor.
 * Tapping again mid-way reverses it from where it is. Reduced motion: opacity only.
 */
export function SwapSpring({ show, className, children }: { show: boolean; className: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const shell = useMemo(() => ({
    Root: m.div,
    props: reduce
      ? {
          initial: { opacity: 0 },
          animate: { opacity: 1, transition: { duration: 0.16, ease: EASE } },
          exit: { opacity: 0, transition: { duration: 0.12, ease: EASE } },
        }
      : {
          initial: { opacity: 0, transform: "translateY(0px) scale(0.94)" },
          animate: { opacity: 1, transform: "translateY(0px) scale(1)", transition: { default: OPEN, opacity: { duration: 0.14, ease: EASE } } },
          exit: { opacity: 0, transform: "translateY(0px) scale(0.96)", transition: { duration: 0.14, ease: EASE } },
        },
  }), [reduce]);
  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {show && (
          <div key="at" className={className} data-swap-row="prev">
            <SwapShell.Provider value={shell}>{children}</SwapShell.Provider>
          </div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
