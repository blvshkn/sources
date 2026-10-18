/**
 * Text tooltips for icon-only buttons. Each icon button gets a role="tooltip" label linked with
 * aria-describedby, and one floating tip shows that label on hover and keyboard focus.
 */
export function installIconTooltips(root: HTMLElement = document.body) {
  let n = 0;
  const tip = document.createElement("div");
  tip.className = "ui-tip";
  tip.setAttribute("aria-hidden", "true");
  document.body.appendChild(tip);

  const hasText = (b: Element) => /[\p{L}\p{N}]/u.test((b.textContent || "").trim());
  const tag = (b: HTMLElement) => {
    if (b.dataset.tipDone) return;
    const label = b.getAttribute("aria-label");
    if (!label || hasText(b)) return;
    const id = `tip-${++n}`;
    const t = document.createElement("span");
    t.id = id; t.setAttribute("role", "tooltip"); t.className = "sr-only"; t.textContent = label;
    b.after(t);
    b.setAttribute("aria-describedby", [b.getAttribute("aria-describedby"), id].filter(Boolean).join(" "));
    b.dataset.tipDone = "1";
  };
  const scan = () => root.querySelectorAll<HTMLElement>("button[aria-label], [role=button][aria-label]").forEach(tag);
  scan();
  const mo = new MutationObserver(() => scan());
  mo.observe(root, { childList: true, subtree: true });

  let timer = 0;
  const show = (b: HTMLElement) => {
    const label = b.getAttribute("aria-label");
    if (!label || !b.dataset.tipDone) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      tip.textContent = label;
      const r = b.getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max(8, r.left + r.width / 2), innerWidth - 8)}px`;
      const above = r.top > 48;
      tip.style.top = `${above ? r.top - 8 : r.bottom + 8}px`;
      tip.dataset.side = above ? "top" : "bottom";
      tip.classList.add("on");
    }, 350);
  };
  const hide = () => { window.clearTimeout(timer); tip.classList.remove("on"); };
  const target = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>("[data-tip-done]") ?? null;
  root.addEventListener("pointerover", (e) => { const b = target(e); if (b && (e as PointerEvent).pointerType === "mouse") show(b); });
  root.addEventListener("pointerout", (e) => { if (target(e)) hide(); });
  root.addEventListener("focusin", (e) => { const b = target(e); if (b && b.matches(":focus-visible")) show(b); });
  root.addEventListener("focusout", hide);
  root.addEventListener("pointerdown", hide);
  return () => { mo.disconnect(); tip.remove(); };
}
