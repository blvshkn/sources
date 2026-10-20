import { useEffect, useRef } from "react";

/**
 * The browser's Back closes an open sheet or modal before it steps back a screen.
 * Opening adds a history entry (same URL) marked with this sheet's id. Back pops it, and when the current entry is no
 * longer ours the sheet closes with its own animation. Closing any other way (the X, the scrim, a swipe, Escape) takes
 * our entry back off, so Back after that still goes to the previous screen. Nested sheets each hold their own entry,
 * so Back closes the top one first. If a screen change already replaced our entry, nothing is popped.
 */
export function useBackClose(close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const id = Math.random().toString(36).slice(2);
    try { history.pushState({ ...(history.state ?? {}), sheet: id }, ""); } catch { /* ignore */ }
    let popped = false;
    const onPop = () => {
      if ((history.state as { sheet?: string } | null)?.sheet === id) return;
      popped = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Checked a tick later: a sheet that's remounting (React's dev double mount) has pushed its new entry by then, so
      // the old one isn't popped out from under it
      if (!popped) window.setTimeout(() => { if ((history.state as { sheet?: string } | null)?.sheet === id) { try { history.back(); } catch { /* ignore */ } } }, 0);
    };
  }, []);
}
