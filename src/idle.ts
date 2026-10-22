// Run work the first screen doesn't need once the page has loaded and the main thread is free, so it stays off the
// path to first paint and out of the page's busiest stretch. Returns a cancel function.
type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };

/** Once the page has loaded, run when `el` comes within `margin` of the viewport (a screen or so ahead of the reader),
 *  so work for a section far down the page never competes with the top of it. Returns a cancel function. */
export function whenNear(el: Element | null, run: () => void, margin = "1200px 0px"): () => void {
  if (!el || typeof IntersectionObserver === "undefined") return afterLoadIdle(run);
  let io: IntersectionObserver | null = null, done = false;
  const cancelLoad = afterLoadIdle(() => {
    io = new IntersectionObserver((es) => { if (!done && es.some((e) => e.isIntersecting)) { done = true; io?.disconnect(); run(); } }, { rootMargin: margin });
    io.observe(el);
  }, 1000);
  return () => { done = true; cancelLoad(); io?.disconnect(); };
}

export function afterLoadIdle(run: () => void, timeout = 3000): () => void {
  const w = window as IdleWindow;
  let idle = 0, timer = 0, done = false;
  const go = () => {
    if (done) return;
    if (w.requestIdleCallback) idle = w.requestIdleCallback(() => { if (!done) { done = true; run(); } }, { timeout });
    else timer = window.setTimeout(() => { if (!done) { done = true; run(); } }, 200);
  };
  if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
  return () => {
    done = true;
    window.removeEventListener("load", go);
    if (idle && w.cancelIdleCallback) w.cancelIdleCallback(idle);
    if (timer) clearTimeout(timer);
  };
}
