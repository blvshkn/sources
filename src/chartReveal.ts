/** Charts grow in when they scroll into view, not when the page mounts. Every bar the stylesheet animates is
 *  held at its start (paused) until it is on screen, then marked seen and allowed to play once. */
export const CHART_BARS = ".ps-bar span i, .slot-bars .sb-you, .ps-bar b, .sx-bar i, .vb-bar > span, .bar-fill, .mw-bar i, .sb2-bar > span, .mu-bar > span, .lu-mx-bar i, .tc-bar > span, .tc-market-bar > span";

export function chartReveal(root: HTMLElement) {
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -8% 0px" });
  const watch = (el: Element) => {
    if (el.matches(CHART_BARS) && !el.classList.contains("seen")) io.observe(el);
    el.querySelectorAll(CHART_BARS).forEach((n) => { if (!n.classList.contains("seen")) io.observe(n); });
  };
  watch(root);
  new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) watch(n as Element); })))
    .observe(root, { childList: true, subtree: true });
}
