/** Charts grow in when they scroll into view, not when the page mounts. Every bar the stylesheet animates is
 *  held at its start (paused) until it is on screen, then marked seen and allowed to play once.
 *
 *  On the app's pages, a chart that is already on screen the moment it mounts only grows as part of a section
 *  entrance (sectionEnter.ts sets <html data-entering> while one plays). Mounted by an in-page tab, a week step or a
 *  filter, it's drawn at full size right away (.seen-still), so a tab swap never animates in. Sheets and modals keep
 *  their grow-in, and a chart further down still grows when you scroll to it. */
export const CHART_BARS = ".ps-bar span i, .slot-bars .sb-you, .ps-bar b, .sx-bar i, .vb-bar > span, .bar-fill, .mw-bar i, .sb2-bar > span, .mu-bar > span, .lu-mx-bar i, .tc-bar > span, .tc-market-bar > span";
const OVERLAY = '[role="dialog"], [aria-modal="true"], .ps-wrap, .scrim-wrap, .sheet';

export function chartReveal(root: HTMLElement) {
  // Mounted in place by a swap: on its first report, if it's on screen, show it settled
  const still = new WeakSet<Element>();
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("seen"); if (still.has(e.target)) e.target.classList.add("seen-still"); io.unobserve(e.target); }
    still.delete(e.target);
  }), { rootMargin: "0px 0px -8% 0px" });
  const swap = (n: Element) => !document.documentElement.hasAttribute("data-entering") && !!n.closest("#main") && !n.closest(OVERLAY);
  const add = (n: Element) => { if (n.classList.contains("seen")) return; if (swap(n)) still.add(n); io.observe(n); };
  const watch = (el: Element) => {
    if (el.matches(CHART_BARS)) add(el);
    el.querySelectorAll(CHART_BARS).forEach(add);
  };
  watch(root);
  new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) watch(n as Element); })))
    .observe(root, { childList: true, subtree: true });
}
