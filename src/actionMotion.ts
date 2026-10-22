/** Action motion that lives on the document rather than in one component (Zach's motion rule: animate when you act,
 *  when something changes, or on first arrival; never loop).
 *
 *  1. Highlight: in League standings and Player values, on a desktop pointer, one soft pill slides between rows
 *     instead of each row lighting up on its own. It takes the size and inset of the row's own hover pill
 *     (states-qa.css), so it lands exactly where that pill would have, and action-motion.css hides the row's own pill
 *     while the sliding one is showing. Touch keeps the row's own press state.
 *  2. Auto height: text disclosures (<details>) grow to their real height and shrink back, instead of popping. */
import { EASE_OUT, mo } from "./motion";

const LISTS = ".st-table, .card.vb-list";
const ROWS = "button.st-row.st-tap, .vb-row";
const DETAILS = "details.wt-none, .ld2-faq details";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function slideHighlight() {
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const pillOf = (list: Element) => {
    let hl = list.querySelector<HTMLElement>(":scope > .hl-slide");
    if (!hl) {
      hl = document.createElement("span");
      hl.className = "hl-slide";
      hl.setAttribute("aria-hidden", "true");
      list.append(hl);
      list.setAttribute("data-hl", "");
    }
    return hl;
  };
  document.addEventListener("pointerover", (e) => {
    if (!fine.matches || e.pointerType !== "mouse") return;
    const row = (e.target as Element | null)?.closest?.<HTMLElement>(ROWS);
    const list = row?.parentElement?.closest(LISTS);
    if (!row || !list || row.parentElement !== list) return;
    const hl = pillOf(list);
    // The row's own pill, as drawn: its ::after inset from the row's edges
    const pill = getComputedStyle(row, "::after");
    const t = parseFloat(pill.top) || 0, b = parseFloat(pill.bottom) || 0, l = parseFloat(pill.left) || 0, r = parseFloat(pill.right) || 0;
    const x = row.offsetLeft + l, y = row.offsetTop + t;
    const fresh = !hl.classList.contains("on");
    if (fresh) hl.classList.add("place");
    hl.style.width = `${row.offsetWidth - l - r}px`;
    hl.style.height = `${row.offsetHeight - t - b}px`;
    hl.style.transform = `translate(${x}px, ${y}px)`;
    if (fresh) { void hl.offsetWidth; hl.classList.remove("place"); }
    hl.classList.add("on");
  }, { passive: true });
  document.addEventListener("pointerout", (e) => {
    const row = (e.target as Element | null)?.closest?.(ROWS);
    const list = row?.parentElement;
    if (!row || !list?.hasAttribute("data-hl")) return;
    const to = e.relatedTarget as Element | null;
    if (to && to.closest?.(ROWS)?.parentElement === list) return;
    list.querySelector(":scope > .hl-slide")?.classList.remove("on");
  }, { passive: true });
}

const running = new WeakMap<HTMLDetailsElement, Animation>();
function autoHeight() {
  document.addEventListener("click", (e) => {
    const sum = (e.target as Element | null)?.closest?.("summary");
    const d = sum?.parentElement;
    if (!(d instanceof HTMLDetailsElement) || !d.matches(DETAILS) || reduced()) return;
    e.preventDefault();
    const from = d.offsetHeight;
    const opening = !running.has(d) ? !d.open : d.dataset.ah !== "open";
    running.get(d)?.cancel();
    // Measure the end height in one synchronous pass: no paint happens between these toggles
    d.open = opening;
    const to = d.offsetHeight;
    d.open = true;
    d.dataset.ah = opening ? "open" : "close";
    d.style.overflow = "hidden";
    const a = d.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: mo(240), easing: EASE_OUT });
    running.set(d, a);
    a.onfinish = () => {
      running.delete(d); d.style.overflow = ""; delete d.dataset.ah;
      if (!opening) d.open = false;
    };
    a.oncancel = () => { d.style.overflow = ""; };
  });
}

export function actionMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return;
  slideHighlight();
  autoHeight();
}
