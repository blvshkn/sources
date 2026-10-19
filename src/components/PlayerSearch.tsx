import { useEffect, useMemo, useRef, useState } from "react";
import { roomBelow, useEdgeFade } from "./edgeFade";
import { TEAMS, Team, playerById } from "../data";
import { eff } from "../engine";
import { Avatar } from "./Avatar";
import { Icon } from "./ui";

/** Find any rostered player in the league and see whose fantasy team he's on. */
export function PlayerSearch({ onPick, picked, onClose }: { onPick: (id: string, team: Team) => void; picked: string[]; onClose?: () => void }) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const all = useMemo(() => TEAMS.flatMap((t) => t.roster.map((id) => ({ p: playerById(id), team: t }))), []);
  const term = q.trim().toLowerCase();
  const hits = term.length < 2 ? [] : all
    .filter(({ p }) => p.name.toLowerCase().includes(term) || p.nfl.toLowerCase() === term)
    .sort((a, b) => Number(b.p.name.toLowerCase().startsWith(term)) - Number(a.p.name.toLowerCase().startsWith(term)) || eff(b.p) - eff(a.p))
    .slice(0, 8);

  // Results never run under the phone tab bar or off the viewport: the list scrolls inside its own panel
  const list = useRef<HTMLUListElement>(null);
  const field = useRef<HTMLLabelElement>(null);
  const [room, setRoom] = useState<number>();
  const showing = term.length >= 2;
  useEdgeFade(list, showing);
  useEffect(() => {
    if (!showing) return;
    const fit = () => { if (field.current) setRoom(Math.max(200, roomBelow(field.current))); };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [showing]);

  return (
    <div className="psr">
      <label className="psr-field" ref={field}>
        <Icon name="search" size={18} />
        <span className="sr-only">Search players in your league</span>
        <input ref={input} autoFocus={!!onClose} onKeyDown={(e) => { if (e.key === "Escape" && onClose) onClose(); }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any player in your league" autoComplete="off" spellCheck={false} />
        {q && !onClose && <button className="psr-clear" onClick={() => { setQ(""); input.current?.focus(); }} aria-label="Clear search"><Icon name="x" size={16} /></button>}
        {onClose && <button className="psr-clear" onClick={onClose} aria-label="Close search"><Icon name="x" size={16} /></button>}
      </label>
      {term.length >= 2 && (
        <ul className="psr-list" aria-label="Search results" ref={list} style={room ? { maxHeight: room } : undefined}>
          {hits.length ? hits.map(({ p, team }) => {
            const on = picked.includes(p.id);
            return (
              <li key={p.id}>
                <button className={`psr-row${on ? " on" : ""}`} onClick={() => { onPick(p.id, team); setQ(""); onClose?.(); }}>
                  <Avatar p={p} size={36} />
                  <span className="psr-n"><b>{p.name}</b><small>{p.pos} · {p.nfl}</small></span>
                  <span className={`psr-team${team.you ? " you" : ""}`}>{team.you ? "Your team" : team.name}</span>
                  <span className="psr-act">{on ? <Icon name="check" size={16} /> : <Icon name="plus" size={16} />}</span>
                </button>
              </li>
            );
          }) : <li className="psr-none">No rostered player matches "{q.trim()}". Free agents are on Waivers.</li>}
        </ul>
      )}
    </div>
  );
}
