import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./icons";

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
  icon?: ReactNode;
  /** Rows with the same group sit under one header, in the order they first appear. */
  group?: string;
};

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  /** Header shown at the top of the menu. */
  header?: string;
  placeholder?: string;
  /** "field" for form fields, "pill" for compact sort pills, "chip" for inline chips. Styling hooks only. */
  size?: "field" | "pill" | "chip";
  id?: string;
  className?: string;
  menuClassName?: string;
  disabled?: boolean;
  /** Icon after the label. null hides it. */
  chevron?: IconName | null;
  /** Custom trigger content. Replaces the label and chevron. */
  children?: ReactNode;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

const DUR = 140;
const GAP = 6;
const EDGE = 8;
const MAX_H = 320;

type Place = { top: number; left: number; minWidth: number; maxHeight: number; up: boolean; originX: number };

/** Custom dropdown with the listbox pattern. The menu renders in a fixed layer on document.body, anchored to the trigger. */
export function Select<T extends string>({
  value, onChange, options, header, placeholder, size = "field", id, className, menuClassName, disabled, chevron = "chev", children,
  "aria-label": ariaLabel, "aria-labelledby": ariaLabelledby,
}: Props<T>) {
  const uid = useId().replace(/:/g, "");
  const listId = `sel-${uid}-list`;
  const optId = (i: number) => `sel-${uid}-o${i}`;
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<Place | null>(null);
  const typed = useRef({ s: "", t: 0 });
  const closeTimer = useRef(0);

  const selIndex = options.findIndex((o) => o.value === value);
  const current = selIndex >= 0 ? options[selIndex] : undefined;
  const enabled = (i: number) => i >= 0 && i < options.length && !options[i].disabled;

  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (enabled(i)) return i;
    return from;
  };
  const first = () => step(-1, 1);
  const last = () => step(options.length, -1);

  const open = (at?: number) => {
    if (disabled || options.length === 0) return;
    window.clearTimeout(closeTimer.current);
    setActive(at ?? (enabled(selIndex) ? selIndex : first()));
    if (mounted) { setShown(true); list.current?.focus({ preventScroll: true }); return; } // reopened mid exit
    setMounted(true);
  };

  const close = useCallback((refocus: boolean) => {
    setShown(false);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => { setMounted(false); setPlace(null); }, DUR);
    if (refocus) trigger.current?.focus({ preventScroll: true });
  }, []);

  const choose = (i: number) => {
    if (!enabled(i)) return;
    if (options[i].value !== value) onChange(options[i].value);
    close(true);
  };

  // Place the menu under the trigger, or above it when there is no room below.
  const position = useCallback(() => {
    const t = trigger.current, m = menu.current;
    if (!t || !m) return;
    const r = t.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const l = list.current;
    const natural = Math.min(l ? l.scrollHeight + (m.offsetHeight - l.offsetHeight) : m.scrollHeight, MAX_H);
    const below = vh - r.bottom - GAP - EDGE, above = r.top - GAP - EDGE;
    const up = below < natural && above > below;
    const maxHeight = Math.max(120, Math.min(MAX_H, up ? above : below));
    const minWidth = Math.min(r.width, vw - EDGE * 2);
    const width = Math.min(Math.max(m.offsetWidth, minWidth), vw - EDGE * 2);
    const left = Math.max(EDGE, Math.min(r.left, vw - EDGE - width));
    const h = Math.min(natural, maxHeight);
    const top = up ? r.top - GAP - h : r.bottom + GAP;
    setPlace({ top, left, minWidth, maxHeight, up, originX: Math.max(0, Math.min(width, r.left + r.width / 2 - left)) });
  }, []);

  useLayoutEffect(() => { if (mounted) position(); }, [mounted, position]);

  // Once placed: center the selected row, move focus into the list, then animate in.
  const placed = place !== null;
  useLayoutEffect(() => {
    if (!mounted || !placed) return;
    const l = list.current, el = selIndex >= 0 ? document.getElementById(optId(selIndex)) : null;
    if (l && el) l.scrollTop = el.offsetTop - l.clientHeight / 2 + el.offsetHeight / 2;
    l?.focus({ preventScroll: true });
    // Flush the closed styles first so the enter transition runs, without waiting a frame.
    void menu.current?.getBoundingClientRect();
    setShown(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, placed]);

  useEffect(() => {
    if (!mounted) return;
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (trigger.current?.contains(n) || menu.current?.contains(n)) return;
      close(false);
    };
    const onMove = () => position();
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [mounted, close, position]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Keep the active row visible while moving with the keyboard.
  useEffect(() => {
    if (!mounted || active < 0) return;
    const l = list.current, el = document.getElementById(optId(active));
    if (!l || !el) return;
    if (el.offsetTop < l.scrollTop) l.scrollTop = el.offsetTop - 4;
    else if (el.offsetTop + el.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = el.offsetTop + el.offsetHeight - l.clientHeight + 4;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, mounted]);

  const typeahead = (key: string, from: number) => {
    const now = Date.now();
    const t = typed.current;
    t.s = now - t.t > 600 ? key : t.s + key;
    t.t = now;
    const q = t.s.toLowerCase();
    const start = t.s.length === 1 ? from + 1 : from;
    for (let k = 0; k < options.length; k++) {
      const i = (start + k) % options.length;
      if (enabled(i) && options[i].label.toLowerCase().startsWith(q)) return i;
    }
    return -1;
  };

  const onTriggerKey = (e: KeyboardEvent) => {
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      open(e.key === "ArrowUp" && !enabled(selIndex) ? last() : undefined);
    } else if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const i = typeahead(e.key, selIndex);
      if (i >= 0 && options[i].value !== value) onChange(options[i].value);
    }
  };

  const onListKey = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setActive((a) => step(a, 1)); break;
      case "ArrowUp": e.preventDefault(); setActive((a) => step(a, -1)); break;
      case "Home": case "PageUp": e.preventDefault(); setActive(first()); break;
      case "End": case "PageDown": e.preventDefault(); setActive(last()); break;
      case "Enter": case " ":
        e.preventDefault();
        if (e.key === " " && Date.now() - typed.current.t < 600 && typed.current.s) { const i = typeahead(" ", active); if (i >= 0) setActive(i); break; }
        choose(active); break;
      case "Escape": e.preventDefault(); e.stopPropagation(); close(true); break;
      case "Tab": close(true); break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const i = typeahead(e.key, active);
          if (i >= 0) setActive(i);
        }
    }
  };

  // Group headers render when the group changes from one row to the next.
  const rows: ReactNode[] = [];
  let lastGroup: string | undefined;
  options.forEach((o, i) => {
    if (o.group && o.group !== lastGroup) rows.push(<div key={`g-${o.group}`} className="sel-group" role="presentation">{o.group}</div>);
    lastGroup = o.group;
    const selected = i === selIndex;
    rows.push(
      <div key={o.value} id={optId(i)} role="option" aria-selected={selected} aria-disabled={o.disabled || undefined}
        className={`sel-opt${i === active ? " active" : ""}${selected ? " selected" : ""}`}
        onPointerMove={() => { if (!o.disabled && active !== i) setActive(i); }}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => choose(i)}>
        {o.icon && <span className="sel-ic">{o.icon}</span>}
        <span className="sel-label">{o.label}{o.hint && <small>{o.hint}</small>}</span>
        <span className="sel-check" aria-hidden="true">{selected && <Icon name="check" size={16} />}</span>
      </div>,
    );
  });

  const style = place
    ? { top: place.top, left: place.left, minWidth: place.minWidth, transformOrigin: `${place.originX}px ${place.up ? "100%" : "0"}` }
    : { top: 0, left: 0, visibility: "hidden" as const };

  return (
    <>
      <button ref={trigger} type="button" id={id} disabled={disabled}
        className={`sel-trigger ${children ? "sel-custom" : `sel-${size}`}${className ? ` ${className}` : ""}`}
        aria-haspopup="listbox" aria-expanded={mounted && shown} aria-controls={mounted ? listId : undefined}
        aria-label={ariaLabel} aria-labelledby={ariaLabelledby}
        data-open={mounted || undefined}
        onClick={() => (mounted ? close(true) : open())}
        onKeyDown={onTriggerKey}>
        {children ?? (
          <>
            <span className={`sel-value${current ? "" : " placeholder"}`}>{current?.label ?? placeholder ?? ""}</span>
            {chevron && <span className={`sel-chev${chevron === "chev" ? " down" : ""}`} aria-hidden="true"><Icon name={chevron} size={14} /></span>}
          </>
        )}
      </button>
      {mounted && createPortal(
        <div ref={menu} className={`sel-menu${menuClassName ? ` ${menuClassName}` : ""}`} data-state={shown ? "open" : "closed"} data-side={place?.up ? "top" : "bottom"} style={style}>
          {header && <div className="sel-head" aria-hidden="true">{header}</div>}
          <div ref={list} id={listId} className="sel-list" role="listbox" tabIndex={-1}
            aria-label={ariaLabel} aria-labelledby={ariaLabel ? undefined : ariaLabelledby ?? (id ? id : undefined)}
            aria-activedescendant={active >= 0 ? optId(active) : undefined}
            style={place ? { maxHeight: place.maxHeight - (header ? 32 : 0) } : undefined}
            onKeyDown={onListKey}>
            {rows}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
