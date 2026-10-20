import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { Team } from "../data";
import { Icon } from "./ui";
import { Trophy } from "./Trophy";
import { ManagerAvatar } from "./Avatar";
import { roomBelow, useEdgeFade } from "./edgeFade";
import { Marked } from "./Marked";
import { useKeyboardInset } from "./useKeyboardInset";
import { rankTeams, type Match } from "../search";
import { SEARCH_AT } from "./Select";

type TeamHit = { team: Team; match?: Match & { on: "name" | "manager" } };

/**
 * Team lists of SEARCH_AT or more get a search field: it matches the team name or the manager (search.ts),
 * and arrow keys, Enter and Escape work from inside it. Shared by Trading with and Add a team.
 */
export function useTeamSearch(teams: Team[], open: boolean) {
  const [q, setQ] = useState("");
  const on = teams.length >= SEARCH_AT;
  useEffect(() => { if (!open) setQ(""); }, [open]);
  const shown: TeamHit[] = on && q.trim() ? rankTeams(q, teams, (t) => t).map((r) => ({ team: r.item, match: r.match })) : teams.map((team) => ({ team }));
  return { on, q, setQ, shown };
}

/** Name and manager lines of a team row, with the matched letters in bold. */
export function TeamLines({ t, match, extra }: { t: Team; match?: TeamHit["match"]; extra?: ReactNode }) {
  return (
    <span className="tp-who">
      <b>{match?.on === "name" ? <Marked name={t.name} marks={match.marks} /> : t.name}{extra}</b>
      <small>{match?.on === "manager" ? <Marked name={t.manager} marks={match.marks} /> : t.manager} · {t.record}</small>
    </span>
  );
}

/** The search field at the top of a team list. */
export function TeamSearchField({ q, setQ, onKey, input, label, wrap }: {
  q: string; setQ: (q: string) => void; onKey: (e: { key: string; preventDefault(): void; stopPropagation(): void }) => void;
  input: RefObject<HTMLInputElement | null>; label: string; wrap?: RefObject<HTMLLabelElement | null>;
}) {
  return (
    <label className="tp-search" ref={wrap}>
      <Icon name="search" size={16} />
      <span className="sr-only">{label}</span>
      <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Team or manager"
        autoComplete="off" spellCheck={false} enterKeyHint="go" />
      {q && <button type="button" className="sel-search-x" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(""); input.current?.focus(); }}><Icon name="x" size={14} /></button>}
    </label>
  );
}

/** Manager avatar from Sleeper (team picture, then account picture), or initials when they haven't set one or it fails to load. */
export function TeamAvatar({ t, size = 40 }: { t: Pick<Team, "name" | "avatar" | "photo">; size?: number }) {
  return <ManagerAvatar src={[t.avatar, t.photo]} name={t.name} size={size} />;
}

/** Trade partner dropdown: the selected team's avatar, name and record, opening a list of every other team. */
export function TeamPicker({ teams, value, onChange, compact }: { teams: Team[]; value: string; onChange: (id: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [room, setRoom] = useState<number>();
  const id = useId();
  const cur = teams.find((t) => t.id === value) ?? teams[0];
  const { on: searching, q, setQ, shown } = useTeamSearch(teams, open);
  const input = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLLabelElement>(null);
  const kbMax = useKeyboardInset(field, list, open && searching);
  useEffect(() => { if (open && searching) setHi(q.trim() ? 0 : Math.max(0, shown.findIndex((x) => x.team.id === value))); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    setHi(Math.max(0, teams.findIndex((t) => t.id === value)));
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    // The list never runs past the viewport or under the phone tab bar: it scrolls inside its own panel
    const fit = () => { const b = wrap.current?.querySelector(".tp-btn"); if (b) setRoom(Math.max(180, roomBelow(b) - 12)); };
    fit();
    window.addEventListener("resize", fit);
    requestAnimationFrame(() => (searching ? input.current : list.current)?.focus({ preventScroll: true }));
    return () => { document.removeEventListener("pointerdown", away); window.removeEventListener("resize", fit); };
  }, [open, teams, value]); // eslint-disable-line react-hooks/exhaustive-deps
  useEdgeFade(list, open);

  useEffect(() => { if (open) list.current?.children[hi]?.scrollIntoView({ block: "nearest" }); }, [hi, open]);

  const refocus = () => wrap.current?.querySelector<HTMLButtonElement>(".tp-btn")?.focus({ preventScroll: true });
  const pick = (t: Team) => { onChange(t.id); setOpen(false); refocus(); };
  const onKey = (e: { key: string; preventDefault(): void; stopPropagation(): void }) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); refocus(); return; }
    if (e.key === "Tab") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(shown.length - 1, h + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    // In the search field a space is just a space
    if ((e.key === "Enter" || (e.key === " " && !searching)) && shown[hi]) { e.preventDefault(); pick(shown[hi].team); }
  };

  if (!cur) return null;
  return (
    <div className={`tp${compact ? " tp-compact" : ""}`} ref={wrap}>
      <span className={compact ? "sr-only" : "tp-label"} id={`${id}-l`}>Trading with</span>
      <button className="tp-btn" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-l ${id}-b`} id={`${id}-b`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}>
        <TeamAvatar t={cur} size={compact ? 36 : 44} />
        <span className="tp-who">{compact ? <><small>Trading with</small><b>{cur.name}<Trophy teamId={cur.id} /></b></> : <><b>{cur.name}<Trophy teamId={cur.id} /></b><small>{cur.manager} · {cur.record}</small></>}</span>
        <Icon name="chev" size={20} />
      </button>
      {open && (
        <div className="tp-pop">
        {searching && <TeamSearchField q={q} setQ={setQ} onKey={onKey} input={input} wrap={field} label="Search teams by name or manager" />}
        <ul className="tp-list" role="listbox" ref={list} tabIndex={-1} aria-labelledby={`${id}-l`}
          aria-activedescendant={shown[hi] ? `${id}-o${hi}` : undefined} onKeyDown={onKey} style={kbMax || room ? { maxHeight: kbMax ?? Math.min(440, room! - (searching ? 52 : 0)) } : undefined}>
          {shown.map(({ team: t, match }, i) => (
            <li key={t.id} id={`${id}-o${i}`} role="option" aria-selected={t.id === value}
              className={`tp-opt${i === hi ? " hi" : ""}`} onPointerEnter={() => setHi(i)} onClick={() => pick(t)}>
              <TeamAvatar t={t} size={36} />
              <TeamLines t={t} match={match} extra={<Trophy teamId={t.id} />} />
              {t.id === value && <Icon name="check" size={16} />}
            </li>
          ))}
          {!shown.length && <li className="tp-none" role="presentation">{`No team or manager matches "${q.trim()}"`}</li>}
        </ul>
        </div>
      )}
    </div>
  );
}
