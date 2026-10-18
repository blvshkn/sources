import { useEffect, useId, useRef, useState } from "react";
import { Team } from "../data";
import { Icon } from "./ui";

const initials = (s: string) => s.replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

/** Manager avatar from Sleeper, or initials when they haven't set one. */
export function TeamAvatar({ t, size = 40 }: { t: Team; size?: number }) {
  const [bad, setBad] = useState(false);
  const style = { width: size, height: size };
  return t.avatar && !bad
    ? <img className="tp-av" style={style} src={`https://sleepercdn.com/avatars/thumbs/${t.avatar}`} alt="" onError={() => setBad(true)} />
    : <span className="tp-av tp-av-ini" style={{ ...style, fontSize: size * 0.36 }}>{initials(t.name)}</span>;
}

/** Trade partner dropdown: the selected team's avatar, name and record, opening a list of every other team. */
export function TeamPicker({ teams, value, onChange, compact }: { teams: Team[]; value: string; onChange: (id: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const cur = teams.find((t) => t.id === value) ?? teams[0];

  useEffect(() => {
    if (!open) return;
    setHi(Math.max(0, teams.findIndex((t) => t.id === value)));
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    requestAnimationFrame(() => list.current?.focus());
    return () => document.removeEventListener("pointerdown", away);
  }, [open, teams, value]);

  useEffect(() => { if (open) list.current?.children[hi]?.scrollIntoView({ block: "nearest" }); }, [hi, open]);

  const pick = (t: Team) => { onChange(t.id); setOpen(false); };
  const onKey = (e: { key: string; preventDefault(): void }) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(teams.length - 1, h + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(teams[hi]); }
  };

  if (!cur) return null;
  return (
    <div className={`tp${compact ? " tp-compact" : ""}`} ref={wrap}>
      <span className={compact ? "sr-only" : "tp-label"} id={`${id}-l`}>Trading with</span>
      <button className="tp-btn" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-l ${id}-b`} id={`${id}-b`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}>
        <TeamAvatar t={cur} size={compact ? 34 : 44} />
        <span className="tp-who">{compact ? <><small>Trading with</small><b>{cur.name}</b></> : <><b>{cur.name}</b><small>{cur.manager} · {cur.record}</small></>}</span>
        <Icon name="chev" size={18} />
      </button>
      {open && (
        <ul className="tp-list" role="listbox" ref={list} tabIndex={-1} aria-labelledby={`${id}-l`}
          aria-activedescendant={`${id}-o${hi}`} onKeyDown={onKey}>
          {teams.map((t, i) => (
            <li key={t.id} id={`${id}-o${i}`} role="option" aria-selected={t.id === value}
              className={`tp-opt${i === hi ? " hi" : ""}`} onPointerEnter={() => setHi(i)} onClick={() => pick(t)}>
              <TeamAvatar t={t} size={36} />
              <span className="tp-who"><b>{t.name}</b><small>{t.manager} · {t.record}</small></span>
              {t.id === value && <Icon name="check" size={16} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
