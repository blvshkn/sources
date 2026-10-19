/** Numbers read in mono everywhere. Any element whose whole text is a number (a score, a count, a record, a
 *  money range, a delta) gets data-n, which the stylesheet sets in the mono face. Words keep the text face, and a
 *  number inside a sentence stays with its sentence. */
const NUM = /^[\s$+\-−–▲▼↑↓]*\d[\d\s.,:%$+\-−–/x×]*$/;

function mark(el: Element) {
  if (el.closest("svg")) return;
  const t = el.textContent?.trim() ?? "";
  if (t && NUM.test(t)) el.setAttribute("data-n", ""); else el.removeAttribute("data-n");
}

export function monoNumbers(root: HTMLElement) {
  const pending = new Set<Element>();
  let queued = false;
  const flush = () => { queued = false; pending.forEach(mark); pending.clear(); };
  const add = (el: Element | null) => { if (!el) return; pending.add(el); if (!queued) { queued = true; requestAnimationFrame(flush); } };
  const addTree = (el: Element) => { add(el); el.querySelectorAll("*").forEach(add); };
  addTree(root);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") add(m.target.parentElement);
      else { add(m.target as Element); m.addedNodes.forEach((n) => (n.nodeType === 1 ? addTree(n as Element) : add(n.parentElement))); }
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}
