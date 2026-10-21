import { placeTip, tipClosed, tipDelay, tipOpened } from "./components/Tooltip";

/**
 * Text tooltips for icon-only buttons. Each icon button gets a role="tooltip" label linked with
 * aria-describedby, and one floating tip (the same branded chip as <Tooltip>) shows that label on
 * hover and keyboard focus. Buttons already wrapped in <Tooltip> (data-tt) are left alone.
 * A button whose label shows only at some sizes (Lineup's Compare) sets data-tip to the tip's text: it gets the tip
 * only while its text is hidden, and its aria-label stays its name.
 */
export function installIconTooltips(root: HTMLElement = document.body) {
  let n = 0;
  const tip = document.createElement("div");
  tip.className = "tt";
  tip.setAttribute("aria-hidden", "true");
  const inner = document.createElement("span");
  inner.className = "tt-in";
  tip.appendChild(inner);

  const hasText = (b: Element) => /[\p{L}\p{N}]/u.test((b.textContent || "").trim());
  /** Text the button shows right now (innerText skips what CSS hides). */
  const hasShown = (b: HTMLElement) => /[\p{L}\p{N}]/u.test((b.innerText || "").trim());
  const tag = (b: HTMLElement) => {
    if (b.dataset.tipDone || b.hasAttribute("data-tt")) return;
    if (b.dataset.tip) { b.dataset.tipDone = "1"; return; }
    const label = b.getAttribute("aria-label");
    if (!label || hasText(b)) return;
    const id = `tip-${++n}`;
    const t = document.createElement("span");
    t.id = id; t.setAttribute("role", "tooltip"); t.className = "sr-only"; t.textContent = label;
    b.after(t);
    b.setAttribute("aria-describedby", [b.getAttribute("aria-describedby"), id].filter(Boolean).join(" "));
    b.dataset.tipDone = "1";
  };
  const scan = () => root.querySelectorAll<HTMLElement>("button[aria-label], [role=button][aria-label], button[data-tip]").forEach(tag);
  scan();
  const mo = new MutationObserver(() => scan());
  mo.observe(root, { childList: true, subtree: true });

  let timer = 0;
  let current: HTMLElement | null = null;
  const hide = () => {
    window.clearTimeout(timer);
    if (!current) return;
    current = null;
    tip.remove();
    tipClosed(hide);
  };
  const open = (b: HTMLElement, label: string, instant: boolean) => {
    inner.textContent = label;
    if (instant) tip.setAttribute("data-instant", ""); else tip.removeAttribute("data-instant");
    tip.style.animation = "none";
    document.body.appendChild(tip);
    void tip.offsetWidth; // restart the entrance animation
    tip.style.animation = "";
    placeTip(tip, b);
    current = b;
    tipOpened(hide);
  };
  const show = (b: HTMLElement, now: boolean) => {
    const label = b.dataset.tip ?? b.getAttribute("aria-label");
    if (!label || !b.dataset.tipDone || b === current) return;
    if (b.dataset.tip && hasShown(b)) return;
    window.clearTimeout(timer);
    const d = now ? 0 : tipDelay();
    if (d) timer = window.setTimeout(() => open(b, label, false), d);
    else open(b, label, !now);
  };
  const target = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>("[data-tip-done]") ?? null;
  root.addEventListener("pointerover", (e) => { const b = target(e); if (b && (e as PointerEvent).pointerType === "mouse") show(b, false); });
  root.addEventListener("pointerout", (e) => { const b = target(e); if (b && !b.contains((e as PointerEvent).relatedTarget as Node | null)) hide(); });
  root.addEventListener("focusin", (e) => { const b = target(e); if (b && b.matches(":focus-visible")) show(b, true); });
  root.addEventListener("focusout", hide);
  root.addEventListener("pointerdown", hide);
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
  addEventListener("keydown", onKey);
  addEventListener("scroll", hide, true);
  return () => { mo.disconnect(); hide(); removeEventListener("keydown", onKey); removeEventListener("scroll", hide, true); };
}
